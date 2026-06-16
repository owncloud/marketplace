import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import type { RawRelease, RawDownloads, AppDownloadCounts } from "../downloads-types.js";
import { githubRepo } from "../config.js";

/** A release as returned by the GitHub Releases API (the fields we read). */
export interface GhRelease {
  tag_name: string;
  name: string;
  published_at: string;
  html_url: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  assets: { name: string; browser_download_url: string; size: number; download_count: number }[];
}

/** The download surfaces and the ownCloud repo each one tracks. */
export const SURFACE_REPOS = {
  ocis: "owncloud/ocis",
  client: "owncloud/client",
  android: "owncloud/android",
  ios: "owncloud/ios",
} as const;

type Surface = keyof typeof SURFACE_REPOS;

/**
 * Classic ownCloud Server is tracked on owncloud/core, not in SURFACE_REPOS,
 * because we only surface the supported classic lines (10.15.x and 10.16.x)
 * rather than its newest release overall. Its archives are distributed as
 * GitHub release assets (mirrored from download.owncloud.com), so the same
 * release-based fetch the other surfaces use applies.
 */
export const CLASSIC_REPO = "owncloud/core";
/** The supported classic Server lines: a tag must match to be surfaced. */
export const CLASSIC_TAG_RE = /^v10\.(15|16)\.(\d+)$/;

/**
 * Map GitHub releases to the trimmed RawRelease shape, dropping drafts and
 * prereleases so only stable GA releases reach the downloads page.
 */
export function selectReleases(releases: GhRelease[]): RawRelease[] {
  return releases
    .filter((r) => !r.draft && !r.prerelease)
    .map((r) => ({
      tag_name: r.tag_name,
      name: r.name,
      published_at: r.published_at,
      html_url: r.html_url,
      body: r.body,
      assets: r.assets.map((a) => ({
        name: a.name,
        browser_download_url: a.browser_download_url,
        size: a.size,
      })),
    }));
}

/** Assemble the committed RawDownloads from each surface's selected releases. */
export function buildRawDownloads(
  perSurface: Record<Surface, GhRelease[]>,
  generatedAt: string,
): RawDownloads {
  return {
    generated_at: generatedAt,
    ocis: selectReleases(perSurface.ocis),
    client: selectReleases(perSurface.client),
    android: selectReleases(perSurface.android),
    ios: selectReleases(perSurface.ios),
  };
}

/**
 * Reduce this repo's own releases into per-app download counts. App packages
 * are published one release per app (tag = appId) with assets named
 * `<appId>-<version>.tar.gz`; the version is recovered by stripping that exact
 * prefix and suffix, so versions containing hyphens are handled correctly.
 * Assets not matching the app's own naming (e.g. checksums) are ignored.
 */
export function buildAppCounts(releases: GhRelease[]): AppDownloadCounts {
  const counts: AppDownloadCounts = {};
  for (const release of releases) {
    const appId = release.tag_name;
    const prefix = `${appId}-`;
    const suffix = ".tar.gz";
    for (const asset of release.assets) {
      if (!asset.name.startsWith(prefix) || !asset.name.endsWith(suffix)) continue;
      const version = asset.name.slice(prefix.length, asset.name.length - suffix.length);
      if (!version) continue;
      (counts[appId] ??= {})[version] = asset.download_count;
    }
  }
  return counts;
}

/**
 * Pick the newest classic Server release from owncloud/core's releases. Keeps
 * only stable (non-draft, non-prerelease) releases whose tag matches a supported
 * classic line (10.15.x / 10.16.x), and returns the highest by numeric version
 * compare. Returns null when none qualify, so the surface is simply absent
 * rather than linking a release that does not exist yet.
 */
export function selectClassicRelease(releases: GhRelease[]): GhRelease | null {
  const matched = releases
    .filter((r) => !r.draft && !r.prerelease)
    .map((r) => ({ release: r, m: CLASSIC_TAG_RE.exec(r.tag_name) }))
    .filter((x): x is { release: GhRelease; m: RegExpExecArray } => x.m !== null);
  if (matched.length === 0) return null;
  matched.sort((a, b) => Number(b.m[1]) - Number(a.m[1]) || Number(b.m[2]) - Number(a.m[2]));
  return matched[0].release;
}

/** Fetch a repo's releases from the GitHub API (first page, newest first). */
async function fetchReleases(repo: string): Promise<GhRelease[]> {
  return fetchGitHub(`https://api.github.com/repos/${repo}/releases?per_page=100`, repo);
}

/**
 * GET a GitHub API URL with our standard headers/auth, parsing JSON. Retries a
 * few times on transient 5xx responses (some owncloud endpoints are slow and
 * intermittently 504 at GitHub's edge), backing off between attempts.
 */
async function fetchGitHub<T>(url: string, repo: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "owncloud-marketplace",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const attempts = 4;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers });
    if (res.ok) return (await res.json()) as T;
    const body = await res.text();
    // Retry only transient server-side failures; 4xx (rate limit, not found)
    // won't get better by retrying and should surface immediately.
    if (res.status >= 500 && attempt < attempts) {
      await sleep(attempt * 2000);
      continue;
    }
    throw new Error(`GitHub API ${res.status} for ${repo}: ${body}`);
  }
}

/** Resolve after `ms` milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolve the classic server surface from owncloud/core's GitHub releases:
 * pick the newest release on a supported line (10.15.x / 10.16.x) and keep only
 * its archive assets (.tar.bz2 / .zip). Returns null (and logs) on any failure,
 * or when no supported release exists, so the surface is simply absent rather
 * than failing the four GitHub surfaces.
 */
export async function fetchClassic(): Promise<RawRelease | null> {
  try {
    const release = selectClassicRelease(await fetchReleases(CLASSIC_REPO));
    if (!release) {
      console.warn(
        `No supported 10.15/10.16 release found for ${CLASSIC_REPO}; skipping classic server.`,
      );
      return null;
    }
    const [selected] = selectReleases([release]);
    const assets = selected.assets.filter(
      (a) => a.name.endsWith(".tar.bz2") || a.name.endsWith(".zip"),
    );
    if (assets.length === 0) {
      console.warn(`Classic release ${release.tag_name} has no archive assets; skipping.`);
      return null;
    }
    return { ...selected, assets };
  } catch (err) {
    console.warn(`Could not fetch classic server downloads: ${String(err)}`);
    return null;
  }
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/**
 * Usage: tsx src/cli/fetch-downloads.ts [--out data/downloads.json]
 * Fetches each surface's releases from GitHub and writes the committed raw
 * downloads file. Requires GITHUB_TOKEN to avoid low anonymous rate limits.
 */
async function main(): Promise<void> {
  const out = arg("--out", "data/downloads.json");
  const now = new Date().toISOString();

  const surfaces = Object.keys(SURFACE_REPOS) as Surface[];
  // Fetch the GitHub-release surfaces, this repo's own releases (app packages),
  // and the classic server (owncloud/core releases) all in parallel.
  const ownRepo = githubRepo();
  const [own, classic, ...fetched] = await Promise.all([
    fetchReleases(ownRepo),
    fetchClassic(),
    ...surfaces.map((s) => fetchReleases(SURFACE_REPOS[s])),
  ]);
  const perSurface = Object.fromEntries(surfaces.map((s, i) => [s, fetched[i]])) as Record<
    Surface,
    GhRelease[]
  >;

  const raw = buildRawDownloads(perSurface, now);
  if (classic) raw.server = [classic];
  raw.apps = buildAppCounts(own);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(raw, null, 2) + "\n", "utf8");

  const surfaceCounts = surfaces.map((s) => `${s}=${raw[s].length}`).join(" ");
  console.log(
    `Wrote ${out} (${surfaceCounts} server=${raw.server?.length ?? 0} apps=${Object.keys(raw.apps).length})`,
  );
}

// Only run when executed directly as a CLI, not when imported (e.g. by tests).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
