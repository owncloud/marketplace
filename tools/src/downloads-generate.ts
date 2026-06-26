import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  RawAsset,
  RawRelease,
  RawDownloads,
  AppDownloadCounts,
  DownloadBinary,
  DownloadRelease,
  DownloadSurface,
  Downloads,
  StoreStats,
} from "./downloads-types.js";

/**
 * A committed baseline of historical download counts (apps[id][version] →
 * count, and the same for extensions), preserved for releases imported from the
 * legacy marketplace. It is kept separate from data/downloads.json because the
 * fetch step rewrites that file's `apps`/`extensions` blocks wholesale from live
 * GitHub asset counts; the baseline is merged on top at generate time instead.
 */
export interface DownloadsBaseline {
  apps?: AppDownloadCounts;
  extensions?: AppDownloadCounts;
}

/** Format a byte count: >= 1 MB → "N.N MB", otherwise "N KB" (rounded). */
export function formatSize(bytes: number): string {
  const MB = 1024 * 1024;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/**
 * OS/arch matcher rules, applied in order. Each rule's regex is tested against
 * the asset file name (case-insensitive). Checksums, PDFs and source tarballs
 * are excluded by requiring the name NOT to end in those extensions.
 */
interface Rule {
  os: string;
  arch: string;
  re: RegExp;
}
const RULES: Rule[] = [
  { os: "Linux", arch: "amd64", re: /linux[-_]amd64$/i },
  { os: "Linux", arch: "arm64", re: /linux[-_]arm64$/i },
  { os: "macOS", arch: "amd64", re: /darwin[-_]amd64$/i },
  { os: "macOS", arch: "arm64", re: /darwin[-_]arm64$/i },
  { os: "Windows", arch: "amd64", re: /windows[-_]amd64\.exe$/i },
];

const EXCLUDE_RE = /\.(sha256|pdf|tar\.gz)$/i;

/**
 * Resolve a release's assets into typed binary download rows, in RULES order.
 * Assets matching no rule (or excluded extensions) are dropped. Returns [] when
 * nothing matches (caller renders a "Browse on GitHub" fallback).
 */
export function matchBinaries(assets: RawAsset[]): DownloadBinary[] {
  const rows: DownloadBinary[] = [];
  for (const rule of RULES) {
    const hit = assets.find((a) => !EXCLUDE_RE.test(a.name) && rule.re.test(a.name));
    if (hit) {
      rows.push({
        os: rule.os,
        arch: rule.arch,
        size: formatSize(hit.size),
        url: hit.browser_download_url,
      });
    }
  }
  return rows;
}

/** Sum every asset's download count for a release (0 when none are recorded). */
export function releaseDownloads(release: RawRelease): number {
  return release.assets.reduce((sum, a) => sum + (a.download_count ?? 0), 0);
}

/** Resolves a release's assets into binary rows (matchBinaries or matchClassicArchives). */
type AssetMatcher = (assets: RawAsset[]) => DownloadBinary[];

/**
 * Normalize one raw release into a historical release entry: trim a leading "v"
 * from the tag for display, total its asset downloads, and resolve its assets
 * into typed binary rows via the given matcher (matchBinaries for the GitHub
 * surfaces, matchClassicArchives for the classic server).
 */
export function normalizeFullRelease(release: RawRelease, matcher: AssetMatcher): DownloadRelease {
  return {
    version: release.tag_name.replace(/^v/, ""),
    releaseUrl: release.html_url,
    publishedAt: release.published_at,
    downloads: releaseDownloads(release),
    binaries: matcher(release.assets),
  };
}

/**
 * Resolve the classic server's archives into download rows. Classic ships a
 * single PHP source archive per format rather than per-OS binaries, so the
 * OS/arch RULES do not apply: the archive format leads the row (as the "os"
 * field the button renders prominently) and "arch" is left empty — repeating a
 * generic "Server archive" label on every row carries no information. Returns
 * rows in `.tar.bz2`, `.zip` order.
 */
export function matchClassicArchives(assets: RawAsset[]): DownloadBinary[] {
  const FORMATS: { ext: string; label: string }[] = [
    { ext: ".tar.bz2", label: "tar.bz2" },
    { ext: ".zip", label: "zip" },
  ];
  const rows: DownloadBinary[] = [];
  for (const fmt of FORMATS) {
    const hit = assets.find((a) => a.name.endsWith(fmt.ext));
    if (hit) {
      rows.push({
        os: fmt.label,
        arch: "",
        size: formatSize(hit.size),
        url: hit.browser_download_url,
      });
    }
  }
  return rows;
}

/**
 * Build a surface from its raw releases: normalize each into the full history
 * (newest-first), promote the newest release's fields to the surface headline
 * (what the landing page shows), and total downloads across every release.
 * Returns null when the list is empty. The classic server passes
 * matchClassicArchives; the GitHub surfaces use the default matchBinaries.
 */
export function buildSurface(
  releases: RawRelease[],
  matcher: AssetMatcher = matchBinaries,
): DownloadSurface | null {
  if (releases.length === 0) return null;
  const history = [...releases]
    .sort((a, b) => b.published_at.localeCompare(a.published_at))
    .map((r) => normalizeFullRelease(r, matcher));
  const newest = history[0];
  return {
    version: newest.version,
    releaseUrl: newest.releaseUrl,
    publishedAt: newest.publishedAt,
    binaries: newest.binaries,
    downloads: history.reduce((sum, r) => sum + r.downloads, 0),
    releases: history,
  };
}

/**
 * Normalize the raw, committed downloads data into the published shape: each
 * surface's full release history (newest-first) with its all-time download
 * total, or null when a surface has no releases, carrying the generation
 * timestamp. The classic server resolves its archives via matchClassicArchives.
 */
export function normalizeDownloads(raw: RawDownloads): Downloads {
  return {
    generatedAt: raw.generated_at,
    ocis: buildSurface(raw.ocis),
    server: buildSurface(raw.server ?? [], matchClassicArchives),
    client: buildSurface(raw.client),
    android: withStore(buildSurface(raw.android), raw.stores?.android),
    ios: withStore(buildSurface(raw.ios), raw.stores?.ios),
  };
}

/**
 * Attach app-store stats to a surface, when both the surface and the stats are
 * present. Pure: returns a new surface (or the unchanged input / null). Lets a
 * mobile surface carry its store listing alongside its GitHub releases.
 */
export function withStore(
  surface: DownloadSurface | null,
  store: StoreStats | undefined,
): DownloadSurface | null {
  if (!surface || !store) return surface;
  return { ...surface, store };
}

/**
 * Read and parse the committed raw downloads file, or null when it is absent.
 * The fetch step (cli/fetch-downloads) produces this file; the build degrades
 * gracefully before it has ever run.
 */
export async function readRawDownloads(path: string): Promise<RawDownloads | null> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  return JSON.parse(text) as RawDownloads;
}

/**
 * Read and parse the committed download-count baseline, or null when it is
 * absent. Mirrors readRawDownloads' ENOENT-degrades-gracefully behaviour so the
 * build works with no baseline at all. When the path was explicitly requested
 * but missing, warn loudly: that is a misconfiguration that would silently drop
 * the historical download totals of imported releases.
 */
export async function readDownloadsBaseline(
  path: string,
  explicit = false,
): Promise<DownloadsBaseline | null> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      if (explicit) {
        console.warn(
          `WARN: --downloads-baseline file not found at "${path}"; historical download totals dropped.`,
        );
      }
      return null;
    }
    throw err;
  }
  return JSON.parse(text) as DownloadsBaseline;
}

/**
 * Add baseline counts on top of live counts, per id → version. The result holds
 * every id/version present in either map; where both have a value they are
 * summed. Pure: neither input is mutated. Imported releases carry their
 * historical total as the baseline while live GitHub counts (0 until the asset
 * is published) accumulate on top.
 */
export function mergeAppCounts(
  live: AppDownloadCounts,
  baseline: AppDownloadCounts,
): AppDownloadCounts {
  const merged: AppDownloadCounts = {};
  for (const source of [live, baseline]) {
    for (const [id, versions] of Object.entries(source)) {
      const target = (merged[id] ??= {});
      for (const [version, count] of Object.entries(versions)) {
        target[version] = (target[version] ?? 0) + count;
      }
    }
  }
  return merged;
}

/**
 * Normalize the raw download data and write it to `outDir/api/v1/downloads.json`,
 * deterministically (stable key order, trailing newline) so re-runs are
 * byte-identical.
 */
export async function writeDownloads(outDir: string, raw: RawDownloads): Promise<void> {
  const apiDir = join(outDir, "api", "v1");
  await mkdir(apiDir, { recursive: true });
  const data = normalizeDownloads(raw);
  await writeFile(join(apiDir, "downloads.json"), JSON.stringify(data, null, 2) + "\n", "utf8");
}
