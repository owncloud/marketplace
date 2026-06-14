import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { scanApps, type ReleaseRef } from "../scan.js";
import { appAssetName } from "../config.js";

const run = promisify(execFile);

/**
 * Publish each app's package tarball as a GitHub Release asset so GitHub counts
 * its downloads. One release per app (tag = appId); each version is a distinct
 * asset named `<appId>-<version>.tar.gz`.
 *
 * Assets are immutable: an asset that already exists is left untouched so its
 * accumulated download count is never reset. Only newly added versions upload.
 *
 * Requires the `gh` CLI authenticated via GH_TOKEN (set in CI).
 */

/** Names of assets already attached to the release tagged `appId`, or [] when the release does not exist. */
async function existingAssets(appId: string): Promise<string[]> {
  try {
    const { stdout } = await run("gh", [
      "release",
      "view",
      appId,
      "--json",
      "assets",
      "--jq",
      ".assets[].name",
    ]);
    return stdout.split("\n").filter(Boolean);
  } catch {
    // `gh release view` exits non-zero when the release does not exist yet.
    return [];
  }
}

/** Ensure a release tagged `appId` exists, creating an empty one if absent. */
async function ensureRelease(appId: string): Promise<void> {
  try {
    await run("gh", ["release", "view", appId, "--json", "id"]);
  } catch {
    await run("gh", [
      "release",
      "create",
      appId,
      "--title",
      appId,
      "--notes",
      `Package releases for the "${appId}" app.`,
    ]);
  }
}

/** Upload one tarball as `<appId>-<version>.tar.gz` on the app's release. */
async function uploadAsset(ref: ReleaseRef): Promise<void> {
  const assetName = appAssetName(ref.appId, ref.version);
  // gh names the uploaded asset after the file; use the #display syntax to set
  // the asset name independently of the on-disk file name.
  await run("gh", ["release", "upload", ref.appId, `${ref.tarballPath}#${assetName}`]);
}

export async function publishAssets(appsDir: string): Promise<void> {
  const refs = await scanApps(appsDir);
  const byApp = new Map<string, ReleaseRef[]>();
  for (const ref of refs) {
    const list = byApp.get(ref.appId) ?? [];
    list.push(ref);
    byApp.set(ref.appId, list);
  }

  let uploaded = 0;
  let skipped = 0;
  for (const [appId, appRefs] of byApp) {
    await ensureRelease(appId);
    const present = new Set(await existingAssets(appId));
    for (const ref of appRefs) {
      if (present.has(appAssetName(appId, ref.version))) {
        skipped++;
        continue;
      }
      await uploadAsset(ref);
      uploaded++;
      console.log(`Uploaded ${appAssetName(appId, ref.version)}`);
    }
  }
  console.log(`Done: ${uploaded} uploaded, ${skipped} already present.`);
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// Only run when executed directly as a CLI, not when imported (e.g. by tests).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  publishAssets(arg("--apps", "apps")).catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
