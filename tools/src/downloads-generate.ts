import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  RawAsset,
  RawRelease,
  RawDownloads,
  DownloadBinary,
  DownloadSurface,
  Downloads,
} from "./downloads-types.js";

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

/**
 * Normalize one raw GitHub release into a download surface: trim a leading "v"
 * from the tag for display and resolve its assets into typed binary rows.
 */
export function normalizeRelease(release: RawRelease): DownloadSurface {
  return {
    version: release.tag_name.replace(/^v/, ""),
    releaseUrl: release.html_url,
    publishedAt: release.published_at,
    binaries: matchBinaries(release.assets),
  };
}

/**
 * Resolve the classic server's archives into download rows. Classic ships a
 * single PHP source archive per format rather than per-OS binaries, so the
 * OS/arch RULES do not apply: the format is shown as the "arch" and the row's
 * "os" label is the same for both. Returns rows in `.tar.bz2`, `.zip` order.
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
        os: "Server archive",
        arch: fmt.label,
        size: formatSize(hit.size),
        url: hit.browser_download_url,
      });
    }
  }
  return rows;
}

/**
 * Normalize the classic server release into a download surface, resolving its
 * archives via matchClassicArchives rather than the OS/arch binary rules.
 */
export function normalizeClassicRelease(release: RawRelease): DownloadSurface {
  return {
    version: release.tag_name.replace(/^v/, ""),
    releaseUrl: release.html_url,
    publishedAt: release.published_at,
    binaries: matchClassicArchives(release.assets),
  };
}

/** The newest release of a list by publish date, or null when the list is empty. */
function newestSurface(releases: RawRelease[]): DownloadSurface | null {
  if (releases.length === 0) return null;
  const newest = [...releases].sort((a, b) => b.published_at.localeCompare(a.published_at))[0];
  return normalizeRelease(newest);
}

/**
 * Normalize the raw, committed downloads data into the published shape: the
 * newest release per surface (or null), carrying the generation timestamp.
 */
export function normalizeDownloads(raw: RawDownloads): Downloads {
  return {
    generatedAt: raw.generated_at,
    ocis: newestSurface(raw.ocis),
    // Classic server: a single tag+archive release, normalized differently.
    server: raw.server?.length ? normalizeClassicRelease(raw.server[0]) : null,
    client: newestSurface(raw.client),
    android: newestSurface(raw.android),
    ios: newestSurface(raw.ios),
  };
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
