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

/** Fetch a repo's releases from the GitHub API (first page, newest first). */
async function fetchReleases(repo: string): Promise<GhRelease[]> {
  const url = `https://api.github.com/repos/${repo}/releases?per_page=100`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "owncloud-marketplace",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} for ${repo}: ${await res.text()}`);
  }
  return (await res.json()) as GhRelease[];
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
  // Fetch the product surfaces plus this repo's own releases (app packages).
  const ownRepo = githubRepo();
  const [own, ...fetched] = await Promise.all([
    fetchReleases(ownRepo),
    ...surfaces.map((s) => fetchReleases(SURFACE_REPOS[s])),
  ]);
  const perSurface = Object.fromEntries(surfaces.map((s, i) => [s, fetched[i]])) as Record<
    Surface,
    GhRelease[]
  >;

  const raw = buildRawDownloads(perSurface, now);
  raw.apps = buildAppCounts(own);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(raw, null, 2) + "\n", "utf8");

  const surfaceCounts = surfaces.map((s) => `${s}=${raw[s].length}`).join(" ");
  console.log(`Wrote ${out} (${surfaceCounts} apps=${Object.keys(raw.apps).length})`);
}

// Only run when executed directly as a CLI, not when imported (e.g. by tests).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
