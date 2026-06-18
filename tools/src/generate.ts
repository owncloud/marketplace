import semver from "semver";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AppInfo, ApiApp, ApiRelease } from "./types.js";
import { toApiCategories } from "./categories.js";
import { appAssetUrl } from "./config.js";

/** Provides the ISO-8601 created timestamp for a given appId/version. */
export type CreatedProvider = (appId: string, version: string) => string;

/**
 * Provides the ingested screenshot file names for a given appId/version's
 * release dir (e.g. ["01.png", "02.jpg"]), in stable sorted order. Returns an
 * empty array when a release has not been ingested yet — screenshots are pinned
 * into the repo by a separate step (see cli/ingest-screenshots), so a freshly
 * published release legitimately has none until then.
 */
export type ScreenshotsProvider = (appId: string, version: string) => string[];

function coerce(v: string): semver.SemVer {
  const c = semver.coerce(v);
  if (!c) throw new Error(`cannot parse version "${v}"`);
  return c;
}

/** Sort version strings descending (newest first). */
function byVersionDesc(a: string, b: string): number {
  return semver.rcompare(coerce(a), coerce(b));
}

/** Per-version download counts for one app (version → count). */
export type DownloadCounts = Record<string, number>;

/**
 * Build one ApiApp from all of an app's release AppInfos. App-level display
 * fields come from the newest release; releases are sorted newest-first.
 *
 * `counts` carries this app's per-version GitHub Release asset download counts
 * (version → count); missing versions count as 0. The app-level `downloads` is
 * their sum. Each release's `download` points at the GitHub Release asset (not
 * the Pages copy) so GitHub counts the download.
 *
 * `publisherUrl` fills `publisher.url` when an enabled publisher owning this app
 * declares a website; it defaults to "" (info.xml has no publisher URL), keeping
 * the field's client-shape compatibility when no publisher claims the app.
 */
export function buildApp(
  appId: string,
  infos: AppInfo[],
  created: CreatedProvider,
  screenshots: ScreenshotsProvider,
  baseUrl: string,
  counts: DownloadCounts = {},
  publisherUrl = "",
): ApiApp {
  const sorted = [...infos].sort((a, b) => byVersionDesc(a.version, b.version));
  const newest = sorted[0];
  // Screenshots are served same-origin from the ingested files on disk (the
  // info.xml URLs are the ingestion source, not what clients load — external
  // origins would be blocked by the ownCloud client's image CSP). Empty until
  // the release is ingested, which the website handles gracefully.
  const screenshotFiles = screenshots(appId, newest.version);

  const releases: ApiRelease[] = sorted.map((info) => ({
    platformMin: info.platformMin,
    platformMax: info.platformMax,
    version: info.version,
    download: appAssetUrl(appId, info.version),
    license: info.license,
    created: created(appId, info.version),
    downloads: counts[info.version] ?? 0,
  }));

  return {
    id: appId,
    type: "app",
    name: newest.name,
    categories: newest.categories,
    description: newest.description,
    screenshots: screenshotFiles.map((file) => ({
      url: `${baseUrl}/apps/${appId}/releases/${newest.version}/screenshots/${file}`,
    })),
    marketplace: `${baseUrl}/apps/${appId}`,
    downloads: releases.reduce((sum, r) => sum + r.downloads, 0),
    rating: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, mean: 0 },
    downloadable: true,
    publisher: { name: newest.author, url: publisherUrl },
    releases,
  };
}

function releaseCoversVersion(rel: ApiRelease, version: string): boolean {
  const v = coerce(version);
  return semver.gte(v, coerce(rel.platformMin)) && semver.lte(v, coerce(rel.platformMax));
}

/**
 * Filter the full catalog to apps having at least one release compatible with
 * `version`, narrowing each app's releases to the compatible ones.
 */
export function appsForPlatformVersion(apps: ApiApp[], version: string): ApiApp[] {
  const result: ApiApp[] = [];
  for (const app of apps) {
    const releases = app.releases.filter((r) => releaseCoversVersion(r, version));
    if (releases.length > 0) result.push({ ...app, releases });
  }
  return result;
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

/**
 * Write the full static API tree under `outDir`:
 *   api/v1/categories.json, bundles.json, apps.json,
 *   api/v1/platform/{version}/apps.json for each known version.
 */
export async function writeApi(
  outDir: string,
  apps: ApiApp[],
  knownVersions: string[],
): Promise<void> {
  const apiDir = join(outDir, "api", "v1");
  await writeJson(join(apiDir, "categories.json"), toApiCategories());
  await writeJson(join(apiDir, "bundles.json"), []);
  await writeJson(join(apiDir, "apps.json"), apps);
  for (const version of knownVersions) {
    await writeJson(
      join(apiDir, "platform", version, "apps.json"),
      appsForPlatformVersion(apps, version),
    );
  }
}
