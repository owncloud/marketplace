import semver from "semver";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { extAssetUrl } from "../config.js";
import type { CreatedProvider, ScreenshotsProvider, DownloadCounts } from "../generate.js";
import type { ExtensionInfo, OcisApp, OcisVersion } from "./types.js";

function coerce(v: string): semver.SemVer {
  const c = semver.coerce(v);
  if (!c) throw new Error(`cannot parse version "${v}"`);
  return c;
}

/** Sort version strings descending (newest first). */
function byVersionDesc(a: string, b: string): number {
  return semver.rcompare(coerce(a), coerce(b));
}

/**
 * Build one OcisApp from all of an extension's release infos. The app-level
 * display fields (name, subtitle, description, …) come from the newest release;
 * versions are sorted newest-first.
 *
 * `counts` carries this extension's per-version GitHub Release asset download
 * counts (version → count); they are not part of oCIS's RawAppSchema, so they are
 * summed into the website-facing total but not emitted per oCIS version. Each
 * version's `url` points at the GitHub Release asset (see extAssetUrl) so GitHub
 * counts the download and oCIS can fetch the bundle directly.
 *
 * `extId` is the folder slug used for the release tag/asset name; the oCIS-facing
 * `id` is the reverse-DNS id declared in extension.yaml.
 */
export function buildExtension(
  extId: string,
  infos: ExtensionInfo[],
  created: CreatedProvider,
  screenshots: ScreenshotsProvider,
  baseUrl: string,
  counts: DownloadCounts = {},
): OcisApp {
  const sorted = [...infos].sort((a, b) => byVersionDesc(a.version, b.version));
  const newest = sorted[0];

  const versions: OcisVersion[] = sorted.map((info) => {
    const v: OcisVersion = {
      version: info.version,
      url: extAssetUrl(extId, info.version),
      created: created(extId, info.version),
      downloads: counts[info.version] ?? 0,
    };
    if (info.minOCIS) v.minOCIS = info.minOCIS;
    return v;
  });

  // Screenshots are served same-origin from the ingested files on disk (mirroring
  // the classic-app flow); empty until the release is ingested, which the website
  // handles gracefully.
  const screenshotFiles = screenshots(extId, newest.version);
  const screenshotImages = screenshotFiles.map((file) => ({
    url: `${baseUrl}/extensions/${extId}/releases/${newest.version}/screenshots/${file}`,
  }));

  const app: OcisApp = {
    id: newest.id,
    name: newest.name,
    subtitle: newest.subtitle,
    license: newest.license,
    versions,
    authors: newest.authors,
    tags: newest.tags,
    downloads: versions.reduce((sum, v) => sum + (v.downloads ?? 0), 0),
  };
  if (newest.description) app.description = newest.description;
  if (newest.resources) app.resources = newest.resources;
  // The first ingested screenshot doubles as the cover image oCIS shows in its
  // app-store grid; the full set is exposed as screenshots on the detail view.
  if (screenshotImages.length > 0) {
    app.coverImage = screenshotImages[0];
    app.screenshots = screenshotImages;
  }
  return app;
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

/**
 * Write the oCIS web-extension repository feed under `outDir`:
 *   api/ocis/v1/apps.json
 * A single feed (no platform-version fan-out): oCIS filters on each version's
 * minOCIS client-side. The classic api/v1 tree is written separately and is
 * untouched by this function.
 */
export async function writeOcisApi(outDir: string, exts: OcisApp[]): Promise<void> {
  await writeJson(join(outDir, "api", "ocis", "v1", "apps.json"), exts);
}

// Re-exported so callers (cli/generate-api) can pass the shared providers without
// importing them from two modules; the types live with the classic generator.
export type { CreatedProvider, ScreenshotsProvider, DownloadCounts };
