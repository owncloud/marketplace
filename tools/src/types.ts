/** Metadata extracted from a single appinfo/info.xml. */
export interface AppInfo {
  id: string;
  name: string;
  summary: string;
  description: string;
  license: string;
  author: string;
  version: string;
  categories: string[];
  /**
   * Declared external screenshot URLs from info.xml. These are the *source* for
   * ingestion (validation + download), NOT what clients load — screenshots are
   * served same-origin from ingested files (see cli/ingest-screenshots and the
   * ScreenshotsProvider in generate.ts).
   */
  screenshots: string[];
  platformMin: string;
  platformMax: string;
}

/** A release entry in generated app JSON (flat platform keys — see plan notes). */
export interface ApiRelease {
  platformMin: string;
  platformMax: string;
  version: string;
  download: string;
  license: string;
  created: string; // ISO 8601
  /** GitHub Release asset download count for this version (0 until counted). */
  downloads: number;
}

/**
 * App rating, faithful to what market's ApiDataProvider expects: per-star vote
 * counts (1..5) plus the mean. This is a static store with no user ratings, so
 * every field is 0 — but the object must be present and well-formed (the client
 * indexes into it), never null.
 */
export interface ApiRating {
  "1": number;
  "2": number;
  "3": number;
  "4": number;
  "5": number;
  mean: number;
}

/** An app entry in generated apps.json, faithful to market's ApiDataProvider. */
export interface ApiApp {
  id: string;
  type: string;
  name: string;
  categories: string[];
  description: string;
  screenshots: { url: string }[];
  marketplace: string;
  downloads: number;
  rating: ApiRating;
  downloadable: boolean;
  publisher: { name: string; url: string };
  releases: ApiRelease[];
}

/** A category entry in generated categories.json. */
export interface ApiCategory {
  id: string;
  translations: { en: { name: string } };
}

/** Thrown for any publisher-facing validation failure; message is shown in CI. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
