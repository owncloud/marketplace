import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ApiApp } from "../types.js";
import type { OcisApp } from "../ext/types.js";
import type { ApiPublisher, PublisherInfo } from "./types.js";

/**
 * Build one ApiPublisher from its parsed info and the already-built catalog
 * objects it owns. Aggregate `stats` (counts + summed downloads) come from those
 * objects, so the numbers match exactly what the app/extension pages show. The
 * `logo` filename is rewritten to a same-origin URL into the served tree
 * (`${baseUrl}/publishers/<slug>/<logo>`).
 *
 * The emitted `apps`/`extensions` are the *catalog* ids of the owned objects
 * (app id and the extension's reverse-DNS id), NOT the registry's folder slugs —
 * those are what the website's app/extension feeds and routes key on, so the page
 * can resolve them directly. (publisher.json authors folder slugs for convenience;
 * the generator translates here.)
 *
 * `ownedApps`/`ownedExts` are the catalog entries this publisher owns (already
 * filtered by the caller); ownership integrity is validated separately.
 */
export function buildPublisher(
  info: PublisherInfo,
  ownedApps: ApiApp[],
  ownedExts: OcisApp[],
  baseUrl: string,
): ApiPublisher {
  const downloads =
    ownedApps.reduce((sum, a) => sum + a.downloads, 0) +
    ownedExts.reduce((sum, e) => sum + (e.downloads ?? 0), 0);

  const publisher: ApiPublisher = {
    slug: info.slug,
    name: info.name,
    enabled: info.enabled,
    apps: ownedApps.map((a) => a.id),
    extensions: ownedExts.map((e) => e.id),
    stats: {
      apps: ownedApps.length,
      extensions: ownedExts.length,
      downloads,
    },
  };
  if (info.website) publisher.website = info.website;
  if (info.description) publisher.description = info.description;
  if (info.logo) publisher.logo = `${baseUrl}/publishers/${info.slug}/${info.logo}`;
  return publisher;
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

/**
 * Write the publisher feed under `outDir`:
 *   api/v1/publishers.json
 * The array holds only enabled publishers (the caller filters), so its presence
 * is the source of truth for which publisher pages exist.
 */
export async function writePublishers(outDir: string, publishers: ApiPublisher[]): Promise<void> {
  await writeJson(join(outDir, "api", "v1", "publishers.json"), publishers);
}
