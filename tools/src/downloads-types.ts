/** One release asset as returned by the GitHub Releases API (fields we use). */
export interface RawAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

/** One release as returned by the GitHub Releases API (fields we use). */
export interface RawRelease {
  tag_name: string;
  name: string;
  published_at: string;
  html_url: string;
  body: string;
  assets: RawAsset[];
}

/**
 * Per-app download counts, keyed appId → version → count, sourced from this
 * repo's own GitHub Release assets. Optional: absent before the fetch step has
 * ever recorded any, and apps with no published assets simply have no entry.
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
}

/** A single resolved binary download row in the normalized API. */
export interface DownloadBinary {
  os: string; // "Linux" | "macOS" | "Windows"
  arch: string; // "amd64" | "arm64"
  size: string; // human-formatted, e.g. "42.1 MB"
  url: string;
}

/** A normalized per-surface entry in the published downloads.json. */
export interface DownloadSurface {
  version: string;
  releaseUrl: string;
  publishedAt: string;
  binaries: DownloadBinary[];
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
