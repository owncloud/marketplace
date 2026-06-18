import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { scanApps } from "../scan.js";
import { validateRelease } from "../validate.js";
import { buildApp, writeApi } from "../generate.js";
import {
  readRawDownloads,
  readDownloadsBaseline,
  mergeAppCounts,
  writeDownloads,
} from "../downloads-generate.js";
import { makeGitCreatedProvider, withCreatedOverrides, readCreatedOverrides } from "../created.js";
import { listScreenshots, screenshotsDir, findCover } from "../screenshots.js";
import { BASE_URL, KNOWN_PLATFORM_VERSIONS } from "../config.js";
import { scanExtensions } from "../ext/scan-extensions.js";
import { validateExtensionRelease, assertConsistentIds } from "../ext/validate-extension.js";
import { buildExtension, writeOcisApi } from "../ext/generate-extensions.js";
import { scanPublishers } from "../publishers/scan-publishers.js";
import { validatePublisher, assertOwnershipIntegrity } from "../publishers/validate-publisher.js";
import { buildPublisher, writePublishers } from "../publishers/generate-publishers.js";
import type { AppInfo } from "../types.js";
import type { ExtensionInfo, OcisApp } from "../ext/types.js";
import type { PublisherInfo } from "../publishers/types.js";

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
  const extDir = arg("--extensions", "extensions");
  const publishersDir = arg("--publishers", "publishers");
  const outDir = arg("--out", "_site");
  const downloadsData = arg("--downloads", "data/downloads.json");
  const baselineData = arg("--downloads-baseline", "data/downloads-baseline.json");
  const createdData = arg("--created", "data/created.json");

  // Scan + validate publishers up front so we can map each owned app to its
  // publisher's website (filling publisher.url in buildApp). Ownership integrity
  // is asserted later, once all catalog ids are known.
  const publisherRefs = await scanPublishers(publishersDir);
  const publisherInfos: PublisherInfo[] = [];
  for (const ref of publisherRefs) publisherInfos.push(await validatePublisher(ref));
  const appWebsite = new Map<string, string>();
  for (const pub of publisherInfos) {
    if (!pub.enabled || !pub.website) continue;
    for (const appId of pub.apps) appWebsite.set(appId, pub.website);
  }

  const refs = await scanApps(appsDir);
  const byApp = new Map<string, AppInfo[]>();
  for (const ref of refs) {
    const info = await validateRelease(ref); // re-validate during build
    const list = byApp.get(ref.appId) ?? [];
    list.push(info);
    byApp.set(ref.appId, list);
  }

  // Release dates come from git history (first commit that added the dir), but
  // an explicit data/created.json entry (appId@version → ISO) wins — it carries
  // the real historical date for releases imported from the legacy marketplace,
  // which git would otherwise date as "imported today".
  const gitCreated = await makeGitCreatedProvider(
    refs.map((r) => ({ appId: r.appId, version: r.version, dir: r.dir })),
    "1970-01-01T00:00:00+00:00",
  );
  const created = withCreatedOverrides(gitCreated, await readCreatedOverrides(createdData));

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
  // Historical totals for imported releases live in a committed baseline that
  // fetch-downloads never rewrites; add them on top of the live GitHub counts.
  const rawDownloads = await readRawDownloads(downloadsData);
  const baseline = await readDownloadsBaseline(baselineData);
  const appCounts = mergeAppCounts(rawDownloads?.apps ?? {}, baseline?.apps ?? {});

  const apps = [...byApp.entries()]
    .map(([appId, infos]) =>
      buildApp(
        appId,
        infos,
        created,
        screenshots,
        BASE_URL,
        appCounts[appId] ?? {},
        appWebsite.get(appId) ?? "",
      ),
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

  // ---- oCIS web extensions (parallel catalog, parallel API namespace) ----
  // Mirrors the classic pipeline above: scan extensions/, re-validate, build the
  // oCIS-compatible feed, and copy ingested screenshots into the served tree.
  const extRefs = await scanExtensions(extDir);
  const byExt = new Map<string, ExtensionInfo[]>();
  for (const ref of extRefs) {
    const info = await validateExtensionRelease(ref);
    const list = byExt.get(ref.extId) ?? [];
    list.push(info);
    byExt.set(ref.extId, list);
  }
  for (const [extId, infos] of byExt) assertConsistentIds(extId, infos);

  const extCreated = await makeGitCreatedProvider(
    extRefs.map((r) => ({ appId: r.extId, version: r.version, dir: r.dir })),
    "1970-01-01T00:00:00+00:00",
  );

  const extShotsByRelease = new Map<string, string[]>();
  const extCoverByRelease = new Map<string, string | undefined>();
  for (const ref of extRefs) {
    extShotsByRelease.set(`${ref.extId}@${ref.version}`, await listScreenshots(ref.dir));
    extCoverByRelease.set(`${ref.extId}@${ref.version}`, await findCover(ref.dir));
  }
  const extShots = (extId: string, version: string): string[] =>
    extShotsByRelease.get(`${extId}@${version}`) ?? [];
  const extCover = (extId: string, version: string): string | undefined =>
    extCoverByRelease.get(`${extId}@${version}`);

  // Extension Release asset download counts share the raw downloads file, keyed
  // by extId under `extensions` (apps live under `apps`); 0 before first fetch.
  // Baseline historical totals (when present) are added the same way as apps.
  const extCounts = mergeAppCounts(rawDownloads?.extensions ?? {}, baseline?.extensions ?? {});

  const exts = [...byExt.entries()]
    .map(([extId, infos]) =>
      buildExtension(
        extId,
        infos,
        extCreated,
        extShots,
        extCover,
        BASE_URL,
        extCounts[extId] ?? {},
      ),
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  await writeOcisApi(outDir, exts);

  // Copy each extension release's ingested screenshots into the served tree so
  // the absolute URLs resolve same-origin:
  //   _site/extensions/{id}/releases/{version}/screenshots/*
  // Bundle ZIPs are NOT copied: they are distributed as GitHub Release assets
  // (so GitHub counts downloads); see buildExtension's version url.
  for (const ref of extRefs) {
    const releaseDest = join(outDir, "extensions", ref.extId, "releases", ref.version);
    const files = extShotsByRelease.get(`${ref.extId}@${ref.version}`) ?? [];
    if (files.length > 0) {
      const shotsDest = join(releaseDest, "screenshots");
      await mkdir(shotsDest, { recursive: true });
      for (const file of files) {
        await cp(join(screenshotsDir(ref.dir), file), join(shotsDest, file));
      }
    }
    // Copy the distinct cover image (when present) so its same-origin URL resolves.
    const coverFile = extCoverByRelease.get(`${ref.extId}@${ref.version}`);
    if (coverFile) {
      await mkdir(releaseDest, { recursive: true });
      await cp(join(ref.dir, coverFile), join(releaseDest, coverFile));
    }
  }

  console.log(`Generated oCIS API for ${exts.length} extension(s) into ${outDir}/api/ocis/v1/`);

  // ---- Publishers (opt-in pages over the two catalogs above) ----
  // Now that every app and extension id is known, assert ownership integrity
  // (no unknown or doubly-claimed ids), then emit a feed of only the *enabled*
  // publishers — presence in publishers.json means the page exists.
  const appById = new Map(apps.map((a) => [a.id, a]));
  const extBySlug = new Map(extRefs.map((r) => [r.extId, r] as const));
  const ocisBySlug = new Map<string, OcisApp>();
  for (const [extId, infos] of byExt) {
    ocisBySlug.set(extId, exts.find((e) => e.id === infos[0].id)!);
  }
  assertOwnershipIntegrity(publisherInfos, new Set(appById.keys()), new Set(extBySlug.keys()));

  const publishers = publisherInfos
    .filter((p) => p.enabled)
    .map((p) =>
      buildPublisher(
        p,
        p.apps.map((id) => appById.get(id)!),
        p.extensions.map((id) => ocisBySlug.get(id)!),
        BASE_URL,
      ),
    )
    .sort((a, b) => a.slug.localeCompare(b.slug));

  await writePublishers(outDir, publishers);

  // Copy each enabled publisher's logo into the served tree so the same-origin
  // logo URL resolves: _site/publishers/{slug}/{logo}
  for (const p of publisherInfos) {
    if (!p.enabled || !p.logo) continue;
    const ref = publisherRefs.find((r) => r.slug === p.slug)!;
    const dest = join(outDir, "publishers", p.slug, p.logo);
    await mkdir(dirname(dest), { recursive: true });
    await cp(join(ref.dir, p.logo), dest);
  }

  console.log(`Generated ${publishers.length} publisher page(s) into ${outDir}/api/v1/`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
