import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import type { RawRelease, RawAsset, RawDownloads, AppDownloadCounts } from "../downloads-types.js";
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
 * Classic ownCloud Server 10.x is fetched differently from the GitHub-release
 * surfaces above: owncloud/core publishes no GitHub releases, so the version
 * comes from its git tags and the archives are served from download.owncloud.com.
 */
export const CLASSIC_REPO = "owncloud/core";
export const CLASSIC_BASE = "https://download.owncloud.com/server/stable";
/** The two archive formats classic is distributed in, in display order. */
export const CLASSIC_ARCHIVES = ["tar.bz2", "zip"] as const;

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

/** A git tag as returned by the GitHub tags API (the one field we read). */
export interface GhTag {
  name: string;
}

/**
 * Pick the newest stable ownCloud 10.x version from a list of git tags. Keeps
 * only `vMAJOR.MINOR.PATCH` tags with major 10 — dropping prerelease tags
 * (`v10.16.2RC1`, `v10.16.2-rc1`) and stray ones (`vv9.1.4RC1`) — and returns
 * the highest by numeric component compare, without the leading `v`
 * (e.g. "10.16.3"). Returns null when no stable 10.x tag is present.
 */
export function selectClassicVersion(tags: GhTag[]): string | null {
  const versions = tags
    .map((t) => /^v(10)\.(\d+)\.(\d+)$/.exec(t.name))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => [Number(m[1]), Number(m[2]), Number(m[3])] as const);
  if (versions.length === 0) return null;
  versions.sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2]);
  return versions[0].join(".");
}

/**
 * Assemble the classic server's RawRelease from a resolved version and its
 * fetched archive metadata. Modelled as a release with one asset per archive so
 * it reuses the existing raw/normalized download shapes; `published_at` is the
 * newest archive's last-modified date, and `html_url` points at the git tag
 * page (owncloud/core has no GitHub release pages).
 */
export function buildClassicRelease(
  version: string,
  archives: RawAsset[],
  lastModified: string[],
): RawRelease {
  const publishedAt =
    [...lastModified].filter(Boolean).sort((a, b) => b.localeCompare(a))[0] ?? "";
  return {
    tag_name: `v${version}`,
    name: `ownCloud ${version}`,
    published_at: publishedAt,
    html_url: `https://github.com/${CLASSIC_REPO}/releases/tag/v${version}`,
    body: "",
    assets: archives,
  };
}

/** Fetch a repo's releases from the GitHub API (first page, newest first). */
async function fetchReleases(repo: string): Promise<GhRelease[]> {
  return fetchGitHub(`https://api.github.com/repos/${repo}/releases?per_page=100`, repo);
}

/** Fetch a repo's git tags from the GitHub API (first page). */
async function fetchTags(repo: string): Promise<GhTag[]> {
  return fetchGitHub(`https://api.github.com/repos/${repo}/tags?per_page=100`, repo);
}

/**
 * GET a GitHub API URL with our standard headers/auth, parsing JSON. Retries a
 * few times on transient 5xx responses (the owncloud/core tags endpoint is slow
 * and intermittently 504s at GitHub's edge), backing off between attempts.
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
 * Resolve the classic server surface: read owncloud/core's tags for the newest
 * stable 10.x version, then HEAD each archive on download.owncloud.com for its
 * size and last-modified date. Returns null (and logs) on any failure so a
 * download-server hiccup never fails the four GitHub surfaces.
 */
export async function fetchClassic(): Promise<RawRelease | null> {
  try {
    const version = selectClassicVersion(await fetchTags(CLASSIC_REPO));
    if (!version) {
      console.warn(`No stable 10.x tag found for ${CLASSIC_REPO}; skipping classic server.`);
      return null;
    }
    const probes = await Promise.all(
      CLASSIC_ARCHIVES.map(async (ext) => {
        const name = `owncloud-${version}.${ext}`;
        const url = `${CLASSIC_BASE}/${name}`;
        const res = await fetch(url, { method: "HEAD" });
        if (!res.ok) throw new Error(`HEAD ${res.status} for ${url}`);
        const size = Number(res.headers.get("content-length"));
        const lastModified = res.headers.get("last-modified");
        const iso = lastModified ? new Date(lastModified).toISOString() : "";
        const asset: RawAsset = { name, browser_download_url: url, size };
        return { asset, iso };
      }),
    );
    return buildClassicRelease(
      version,
      probes.map((p) => p.asset),
      probes.map((p) => p.iso),
    );
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
  // and the classic server (tags + download server) all in parallel.
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
