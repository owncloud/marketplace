import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { addedPackagePaths } from "./check-changeset.js";
import { readInfoXmlFromTarball } from "../package-reader.js";
import { parseInfoXml } from "../info-xml.js";
import { fetchAndValidateImage, validateImageFile } from "../image-validate.js";
import { listScreenshots, screenshotsDir } from "../screenshots.js";
import { ValidationError } from "../types.js";

const exec = promisify(execFile);

/**
 * Validate the screenshots of each release **newly added** by the PR, each
 * within the supported formats and size/dimension limits (see image-validate).
 * A release that ships committed screenshots (screenshots/NN.ext beside its
 * package) is validated from those local files — the bytes the catalog actually
 * serves — without any network access. This local validation is **strict**: a
 * committed file that is not a valid, in-bounds image fails the gate.
 *
 * A release that ships no local files falls back to fetching its info.xml
 * <screenshot> URLs. Those URLs are only an *ingestion source* — the catalog
 * never serves them (it serves committed files), and post-merge ingestion is
 * itself best-effort (cli/ingest-screenshots skips a dead/invalid URL and
 * ingests the rest). So this fallback is **best-effort too**: an unreachable or
 * unsupported source URL is warned and skipped rather than failing the gate.
 * That keeps the gate off external hosts that block CI (e.g. a WAF returning 415
 * to datacenter IPs) and lets a legacy app whose only screenshot source has
 * rotted (wrong format, 404, dead host) still be imported with no screenshots —
 * a valid catalog state. Already-published releases are not re-checked.
 */
export async function validateAddedScreenshots(baseRef: string, repoRoot: string): Promise<number> {
  const added = await addedPackagePaths(baseRef, repoRoot);
  let count = 0;
  for (const path of added) {
    const releaseDir = join(repoRoot, dirname(path));
    const localFiles = await listScreenshots(releaseDir);
    if (localFiles.length > 0) {
      const dir = screenshotsDir(releaseDir);
      for (const file of localFiles) {
        await validateImageFile(join(dir, file));
        count++;
      }
      continue;
    }
    const info = parseInfoXml(await readInfoXmlFromTarball(join(repoRoot, path)));
    for (const url of info.screenshots) {
      try {
        await fetchAndValidateImage(url);
        count++;
      } catch (err) {
        // Best-effort: a bad source URL is never served (only committed files
        // are), so warn and continue rather than blocking the release.
        const reason = err instanceof Error ? err.message : String(err);
        console.warn(`WARN ${path}: skipped screenshot ${url} — ${reason}`);
      }
    }
  }
  return count;
}

/**
 * Usage: tsx src/cli/validate-screenshots.ts <baseRef>
 * Validates screenshots for releases added in <baseRef>...HEAD.
 */
async function main(): Promise<void> {
  const baseRef = process.argv[2];
  if (!baseRef) throw new Error("usage: validate-screenshots <baseRef>");
  const repoRoot = (await exec("git", ["rev-parse", "--show-toplevel"])).stdout.trim();
  const count = await validateAddedScreenshots(baseRef, repoRoot);
  console.log(`Screenshots OK: validated ${count} screenshot(s) across new releases.`);
}

// Only run when executed directly as a CLI, not when imported (e.g. by tests).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    if (err instanceof ValidationError) {
      console.error(`Validation failed: ${err.message}`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
}
