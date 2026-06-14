import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { scanApps } from "../scan.js";
import { validateRelease } from "../validate.js";
import { buildApp, writeApi } from "../generate.js";
import { readRawDownloads, writeDownloads } from "../downloads-generate.js";
import { makeGitCreatedProvider } from "../created.js";
import { listScreenshots, screenshotsDir } from "../screenshots.js";
import { BASE_URL, KNOWN_PLATFORM_VERSIONS } from "../config.js";
import type { AppInfo } from "../types.js";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/**
 * Usage: tsx src/cli/generate-api.ts [--apps apps] [--out _site]
 * Re-validates all releases (defense in depth), then writes the static API.
 */
async function main(): Promise<void> {
  const appsDir = arg("--apps", "apps");
  const outDir = arg("--out", "_site");
  const downloadsData = arg("--downloads", "data/downloads.json");

  const refs = await scanApps(appsDir);
  const byApp = new Map<string, AppInfo[]>();
  for (const ref of refs) {
    const info = await validateRelease(ref); // re-validate during build
    const list = byApp.get(ref.appId) ?? [];
    list.push(info);
    byApp.set(ref.appId, list);
  }

  const created = await makeGitCreatedProvider(
    refs.map((r) => ({ appId: r.appId, version: r.version, dir: r.dir })),
    "1970-01-01T00:00:00+00:00",
  );

  // Map each release to its ingested screenshot files on disk; buildApp turns
  // these into same-origin URLs. Keyed by appId/version, read once up front.
  const screenshotsByRelease = new Map<string, string[]>();
  for (const ref of refs) {
    screenshotsByRelease.set(`${ref.appId}@${ref.version}`, await listScreenshots(ref.dir));
  }
  const screenshots = (appId: string, version: string): string[] =>
    screenshotsByRelease.get(`${appId}@${version}`) ?? [];

  // Per-app download counts from this repo's Release assets, when fetched.
  // The fetch step produces data/downloads.json; before it has ever run the
  // build degrades to zero counts rather than failing.
  const rawDownloads = await readRawDownloads(downloadsData);
  const appCounts = rawDownloads?.apps ?? {};

  const apps = [...byApp.entries()]
    .map(([appId, infos]) =>
      buildApp(appId, infos, created, screenshots, BASE_URL, appCounts[appId] ?? {}),
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  await writeApi(outDir, apps, KNOWN_PLATFORM_VERSIONS);

  // Emit api/v1/downloads.json from the committed raw release data, when present.
  if (rawDownloads) {
    await writeDownloads(outDir, rawDownloads);
  } else {
    console.warn(`No ${downloadsData}; skipping downloads.json`);
  }

  // Copy each release's ingested screenshots into the served tree so the
  // absolute screenshot URLs in the API resolve same-origin:
  //   _site/apps/{id}/releases/{version}/screenshots/*
  // Package tarballs are NOT copied here: they are distributed as GitHub
  // Release assets (so GitHub counts downloads); see buildApp's download URL.
  for (const ref of refs) {
    const files = screenshotsByRelease.get(`${ref.appId}@${ref.version}`) ?? [];
    if (files.length === 0) continue;
    const shotsDest = join(outDir, "apps", ref.appId, "releases", ref.version, "screenshots");
    await mkdir(shotsDest, { recursive: true });
    for (const file of files) {
      await cp(join(screenshotsDir(ref.dir), file), join(shotsDest, file));
    }
  }

  console.log(`Generated API for ${apps.length} app(s) into ${outDir}/api/v1/`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
