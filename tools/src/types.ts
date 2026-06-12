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
  rating: null;
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
