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

/** The raw, committed data/downloads.json: GitHub data, lightly trimmed. */
export interface RawDownloads {
  generated_at: string;
  ocis: RawRelease[];
  client: RawRelease[];
  android: RawRelease[];
  ios: RawRelease[];
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
  client: DownloadSurface | null;
  android: DownloadSurface | null;
  ios: DownloadSurface | null;
}
