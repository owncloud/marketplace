import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// The API generator writes the oCIS extension feed to ../_site/api/ocis/v1
// relative to the website root (matching the classic api/v1 tree). Anchor on cwd,
// exactly like catalog.ts, since astro dev/build both run from the website dir.
const ocisApiDir = resolve(process.cwd(), "..", "_site", "api", "ocis", "v1");

export interface ExtensionAuthor {
  name: string;
  url?: string;
}
export interface ExtensionImage {
  url: string;
  caption?: string;
}
export interface ExtensionResource {
  url: string;
  label: string;
  icon?: string;
}
export interface ExtensionVersion {
  version: string;
  minOCIS?: string;
  url: string;
  created?: string;
  downloads?: number;
}
export interface CatalogExtension {
  id: string;
  name: string;
  subtitle: string;
  description?: string;
  license: string;
  versions: ExtensionVersion[];
  authors: ExtensionAuthor[];
  tags: string[];
  coverImage?: ExtensionImage;
  screenshots?: ExtensionImage[];
  resources?: ExtensionResource[];
  downloads?: number;
}

/**
 * Read the generated oCIS extension feed (api/ocis/v1/apps.json) from the shared
 * _site output, or [] when it is absent — the API generator produces it, so a
 * build before that step has run legitimately has no extensions and the pages
 * degrade gracefully.
 *
 * The feed is `{ "apps": [...] }` (oCIS Web's RawAppListSchema shape), not a
 * bare array.
 */
export async function loadExtensions(): Promise<CatalogExtension[]> {
  try {
    const doc = JSON.parse(
      await readFile(resolve(ocisApiDir, "apps.json"), "utf8"),
    ) as { apps: CatalogExtension[] };
    return doc.apps;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}
