import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// The API generator writes to ../_site/api/v1 relative to the website root
// (matching astro.config.mjs `outDir`). Anchor on cwd rather than import.meta.url:
// `astro dev`/`astro build` both run from the website dir, whereas the build's
// emitted module location is an internal Astro detail that changed across majors.
const apiDir = resolve(process.cwd(), "..", "_site", "api", "v1");

export interface CatalogRelease {
  version: string;
  download: string;
  license: string;
  created: string;
  platformMin: string;
  platformMax: string;
  downloads: number;
}
export interface CatalogApp {
  id: string;
  name: string;
  description: string;
  categories: string[];
  screenshots: { url: string }[];
  publisher: { name: string; url: string };
  downloads: number;
  releases: CatalogRelease[];
}

/** Join the site base path with a relative path, collapsing duplicate slashes. */
export function withBase(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

export interface CatalogCategory {
  id: string;
  name: string;
}

/** Read the generated apps.json from the shared _site output. */
export async function loadApps(): Promise<CatalogApp[]> {
  return JSON.parse(
    await readFile(resolve(apiDir, "apps.json"), "utf8"),
  ) as CatalogApp[];
}

export interface DownloadBinary {
  os: string;
  arch: string;
  size: string;
  url: string;
}
export interface DownloadSurface {
  version: string;
  releaseUrl: string;
  publishedAt: string;
  binaries: DownloadBinary[];
}
export interface Downloads {
  generatedAt: string;
  ocis: DownloadSurface | null;
  server: DownloadSurface | null;
  client: DownloadSurface | null;
  android: DownloadSurface | null;
  ios: DownloadSurface | null;
}

/**
 * Read the generated downloads.json from the shared _site output, or null when
 * it is absent — the fetch step produces it, so a build before that step has
 * ever run legitimately has no downloads data and the page degrades gracefully.
 */
export async function loadDownloads(): Promise<Downloads | null> {
  try {
    return JSON.parse(
      await readFile(resolve(apiDir, "downloads.json"), "utf8"),
    ) as Downloads;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** Read the generated categories.json, flattening the English translation to a name. */
export async function loadCategories(): Promise<CatalogCategory[]> {
  const raw = JSON.parse(
    await readFile(resolve(apiDir, "categories.json"), "utf8"),
  ) as {
    id: string;
    translations: { en?: { name: string } };
  }[];
  return raw.map((c) => ({ id: c.id, name: c.translations.en?.name ?? c.id }));
}
