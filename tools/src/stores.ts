import type { StoreStats } from "./downloads-types.js";

/**
 * The ownCloud mobile apps' store identities — the single source of truth for
 * the store lookups. The Apple id keys the iTunes Lookup API; the Play package
 * keys google-play-scraper.
 */
export const APPLE_APP_ID = "1359583808";
export const PLAY_PACKAGE = "com.owncloud.android";

/** The iTunes Lookup endpoint for the App Store listing (public, no auth). */
export function appleLookupUrl(appId = APPLE_APP_ID): string {
  return `https://itunes.apple.com/lookup?id=${appId}`;
}

/** Round a 0–5 rating to one decimal place, or undefined when not a number. */
function roundRating(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 10) / 10
    : undefined;
}

/** The one iTunes Lookup result object whose fields we read. */
interface AppleLookupResult {
  trackViewUrl?: string;
  averageUserRating?: number;
  userRatingCount?: number;
}

/**
 * Parse an iTunes Lookup response into StoreStats, or null when it carries no
 * usable result (the API returns `{ resultCount: 0, results: [] }` for an
 * unknown id). Pure, so it is unit-tested without hitting the network. The
 * App Store publishes no install count, so `installs` is always omitted.
 */
export function parseAppleStats(body: unknown): StoreStats | null {
  const results = (body as { results?: AppleLookupResult[] })?.results;
  const r = Array.isArray(results) ? results[0] : undefined;
  if (!r?.trackViewUrl) return null;
  return {
    url: r.trackViewUrl,
    rating: roundRating(r.averageUserRating),
    ratingCount: typeof r.userRatingCount === "number" ? r.userRatingCount : undefined,
  };
}

/** The google-play-scraper `app()` result fields we read. */
interface PlayAppResult {
  url?: string;
  score?: number;
  ratings?: number;
  installs?: string;
}

/**
 * Parse a google-play-scraper `app()` result into StoreStats, or null when it
 * lacks a listing URL. Pure, so it is unit-tested without hitting the network.
 */
export function parsePlayStats(app: unknown): StoreStats | null {
  const a = app as PlayAppResult;
  if (!a?.url) return null;
  return {
    url: a.url,
    rating: roundRating(a.score),
    ratingCount: typeof a.ratings === "number" ? a.ratings : undefined,
    installs: typeof a.installs === "string" ? a.installs : undefined,
  };
}

/**
 * Fetch the App Store listing stats via the public iTunes Lookup API, or null
 * on any failure. Like fetchClassic() in cli/fetch-downloads, store outages are
 * swallowed (logged) so they never fail the daily downloads fetch.
 */
export async function fetchAppleStats(appId = APPLE_APP_ID): Promise<StoreStats | null> {
  try {
    const res = await fetch(appleLookupUrl(appId), {
      headers: { "User-Agent": "owncloud-marketplace" },
    });
    if (!res.ok) throw new Error(`iTunes lookup ${res.status}`);
    return parseAppleStats(await res.json());
  } catch (err) {
    console.warn(`Could not fetch App Store stats: ${String(err)}`);
    return null;
  }
}

/**
 * Fetch the Google Play listing stats via google-play-scraper, or null on any
 * failure. The dependency is imported dynamically so this module loads even if
 * it is absent, and so failures here stay isolated to the store fetch.
 */
export async function fetchPlayStats(appId = PLAY_PACKAGE): Promise<StoreStats | null> {
  try {
    const mod = (await import("google-play-scraper")) as {
      default?: { app: (opts: { appId: string }) => Promise<unknown> };
      app?: (opts: { appId: string }) => Promise<unknown>;
    };
    // v10 ships a default export; some bundlers nest it under `.default`.
    const gplay = mod.default ?? mod;
    const app = await gplay.app!({ appId });
    return parsePlayStats(app);
  } catch (err) {
    console.warn(`Could not fetch Google Play stats: ${String(err)}`);
    return null;
  }
}
