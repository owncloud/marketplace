import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanApps, type ReleaseRef } from "../scan.js";
import { appAssetName } from "../config.js";

/** Runs a command, resolving with its captured stdout/stderr. */
export type Runner = (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

const defaultRunner: Runner = promisify(execFile);

/**
 * Publish each app's package tarball as a GitHub Release asset so GitHub counts
 * its downloads. One release per app (tag = appId); each version is a distinct
 * asset named `<appId>-<version>.tar.gz`.
 *
 * gh derives the asset name from the uploaded file's basename, so each tarball
 * is copied to a temp file named `<appId>-<version>.tar.gz` before upload — the
 * on-disk file is always `package.tar.gz`, which would otherwise collide across
 * versions and break the per-version download URL and download counter.
 *
 * Assets are immutable: an asset that already exists is left untouched so its
 * accumulated download count is never reset. Only newly added versions upload.
 *
 * Requires the `gh` CLI authenticated via GH_TOKEN (set in CI).
 */

/** Names of assets already attached to the release tagged `appId`, or [] when the release does not exist. */
async function existingAssets(appId: string, run: Runner): Promise<string[]> {
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
async function ensureRelease(appId: string, run: Runner): Promise<void> {
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

/**
 * Upload one tarball as `<appId>-<version>.tar.gz` on the app's release. gh
 * names the asset after the uploaded file, so the tarball is copied to a
 * temp file carrying the per-version name (the source under apps/.../releases/
 * is immutable). The temp file is removed afterwards.
 */
async function uploadAsset(ref: ReleaseRef, run: Runner): Promise<void> {
  const assetName = appAssetName(ref.appId, ref.version);
  const tmp = await mkdtemp(join(tmpdir(), "publish-asset-"));
  try {
    const named = join(tmp, assetName);
    await copyFile(ref.tarballPath, named);
    await run("gh", ["release", "upload", ref.appId, named]);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

export async function publishAssets(appsDir: string, run: Runner = defaultRunner): Promise<void> {
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
    await ensureRelease(appId, run);
    const present = new Set(await existingAssets(appId, run));
    for (const ref of appRefs) {
      if (present.has(appAssetName(appId, ref.version))) {
        skipped++;
        continue;
      }
      await uploadAsset(ref, run);
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
