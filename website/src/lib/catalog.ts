import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export interface CatalogRelease {
  version: string;
  download: string;
  license: string;
  created: string;
  platformMin: string;
  platformMax: string;
}
export interface CatalogApp {
  id: string;
  name: string;
  description: string;
  categories: string[];
  screenshots: { url: string }[];
  publisher: { name: string; url: string };
  releases: CatalogRelease[];
}

/** Join the site base path with a relative path, collapsing duplicate slashes. */
export function withBase(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

/** Read the generated apps.json from the shared _site output. */
export async function loadApps(): Promise<CatalogApp[]> {
  const path = fileURLToPath(new URL("../../../_site/api/v1/apps.json", import.meta.url));
  return JSON.parse(await readFile(path, "utf8")) as CatalogApp[];
}
