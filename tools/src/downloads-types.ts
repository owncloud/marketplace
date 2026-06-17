/** One release asset as returned by the GitHub Releases API (fields we use). */
export interface RawAsset {
  name: string;
  browser_download_url: string;
  size: number;
  /** Total times this asset has been downloaded, per the GitHub API. */
  download_count: number;
}

/** One release as returned by the GitHub Releases API (fields we use). */
export interface RawRelease {
  tag_name: string;
  name: string;
  published_at: string;
  html_url: string;
  assets: RawAsset[];
}

/**
 * Per-app download counts, keyed appId → version → count, sourced from this
 * repo's own GitHub Release assets. Optional: absent before the fetch step has
 * ever recorded any, and apps with no published assets simply have no entry.
 *
 * The same shape is reused for oCIS web-extension counts, keyed extId → version
 * → count (see RawDownloads.extensions).
 */
export type AppDownloadCounts = Record<string, Record<string, number>>;

/** The raw, committed data/downloads.json: GitHub data, lightly trimmed. */
export interface RawDownloads {
  generated_at: string;
  ocis: RawRelease[];
  client: RawRelease[];
  android: RawRelease[];
  ios: RawRelease[];
  /**
   * Classic ownCloud Server 10.x. Unlike the GitHub-fetched surfaces above, it
   * has no GitHub releases — its version comes from the owncloud/core git tags
   * and its archives from download.owncloud.com. Optional for backward
   * compatibility with data/downloads.json committed before this field existed.
   */
  server?: RawRelease[];
  /** App package download counts from this repo's Release assets. */
  apps?: AppDownloadCounts;
  /** Extension bundle download counts from this repo's Release assets (extId → version → count). */
  extensions?: AppDownloadCounts;
}

/** A single resolved binary download row in the normalized API. */
export interface DownloadBinary {
  os: string; // "Linux" | "macOS" | "Windows"
  arch: string; // "amd64" | "arm64"
  size: string; // human-formatted, e.g. "42.1 MB"
  url: string;
}

/** A single historical release in a surface's full release history. */
export interface DownloadRelease {
  version: string;
  releaseUrl: string;
  publishedAt: string;
  /** Sum of asset download counts for this release (0 when none recorded). */
  downloads: number;
  binaries: DownloadBinary[];
}

/**
 * A normalized per-surface entry in the published downloads.json. The top-level
 * version/releaseUrl/publishedAt/binaries fields describe the newest release
 * (what the downloads landing page shows); `releases` carries the full history
 * (newest-first) for the per-product release-history subpage, and `downloads`
 * is the all-time total across every release of the surface.
 */
export interface DownloadSurface {
  version: string;
  releaseUrl: string;
  publishedAt: string;
  binaries: DownloadBinary[];
  downloads: number;
  releases: DownloadRelease[];
}

/** The normalized, published _site/api/v1/downloads.json. */
export interface Downloads {
  generatedAt: string;
  ocis: DownloadSurface | null;
  server: DownloadSurface | null;
  client: DownloadSurface | null;
  android: DownloadSurface | null;
  ios: DownloadSurface | null;
}
