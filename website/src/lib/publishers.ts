import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// The API generator writes publishers.json into ../_site/api/v1 alongside
// apps.json (matching catalog.ts). Anchor on cwd since astro dev/build both run
// from the website dir.
const apiDir = resolve(process.cwd(), "..", "_site", "api", "v1");

export interface PublisherStats {
  apps: number;
  extensions: number;
  downloads: number;
}

export interface Publisher {
  slug: string;
  name: string;
  enabled: boolean;
  website?: string;
  description?: string;
  /** Same-origin URL of the publisher logo, when one was provided. */
  logo?: string;
  /** Catalog ids of owned apps (match apps.json `id`, i.e. the `apps/<id>` slug). */
  apps: string[];
  /** Catalog ids of owned extensions (the reverse-DNS id in the oCIS feed). */
  extensions: string[];
  stats: PublisherStats;
}

/**
 * Read the generated publishers.json from the shared _site output, or [] when it
 * is absent — the API generator produces it, so a build before that step has ever
 * run legitimately has no publishers and the pages degrade gracefully. Only
 * enabled publishers are written, so every entry has a page.
 */
export async function loadPublishers(): Promise<Publisher[]> {
  try {
    return JSON.parse(
      await readFile(resolve(apiDir, "publishers.json"), "utf8"),
    ) as Publisher[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

/**
 * Map each owned app id to its publisher, for reverse lookup on app detail pages
 * (linking the publisher name to its page). Built from the enabled publishers in
 * publishers.json; an app no publisher claims is simply absent from the map.
 */
export function appIdToPublisher(publishers: Publisher[]): Map<string, Publisher> {
  const map = new Map<string, Publisher>();
  for (const pub of publishers) {
    for (const appId of pub.apps) map.set(appId, pub);
  }
  return map;
}
