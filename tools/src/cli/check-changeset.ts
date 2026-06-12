import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { validateChangeset, validatePlatformFloor, type ChangedPath } from "../validate.js";
import { readInfoXmlFromTarball } from "../package-reader.js";
import { parseInfoXml } from "../info-xml.js";
import { ValidationError } from "../types.js";

/** A newly-added release package introduced by the changeset. */
const ADDED_PACKAGE_RE = /^apps\/[^/]+\/releases\/[^/]+\/package\.tar\.gz$/;

/**
 * Enforce the platform floor on every release package newly added by the PR.
 * Only added packages are checked, so historical (immutable) releases that
 * predate the floor are left untouched. Paths are resolved against `repoRoot`
 * (the working tree), where checked-out files live.
 */
async function enforcePlatformFloorOnAdded(
  changed: ChangedPath[],
  repoRoot: string,
): Promise<void> {
  for (const c of changed) {
    if (c.status !== "A" || !ADDED_PACKAGE_RE.test(c.path)) continue;
    const xml = await readInfoXmlFromTarball(join(repoRoot, c.path));
    validatePlatformFloor(parseInfoXml(xml));
  }
}

const exec = promisify(execFile);

/**
 * Parse the output of `git diff --name-status` into ChangedPath entries.
 *
 * Renames/copies are emitted by git as a THREE-field line
 * `R<score>\t<oldPath>\t<newPath>` (likewise `C<score>` for copies). A rename
 * moves the old file away, so we split it into TWO entries: the OLD path as a
 * delete (`D`, so a source under a published release dir is rejected as
 * immutable) and the NEW path as an add (`A`, so the destination is collision-
 * checked). Plain A/M/D lines (two fields) are passed through unchanged.
 */
export function parseNameStatus(stdout: string): ChangedPath[] {
  const changed: ChangedPath[] = [];
  for (const line of stdout.trim().split("\n").filter(Boolean)) {
    const parts = line.split("\t");
    const code = parts[0][0] as "A" | "M" | "D" | "R" | "C";
    if ((code === "R" || code === "C") && parts.length >= 3) {
      // rename/copy: parts = [statusScore, oldPath, newPath]
      changed.push({ path: parts[1], status: "D" }); // source moved away → immutable check
      changed.push({ path: parts[2], status: "A" }); // destination is new → collision check
    } else {
      changed.push({ path: parts[parts.length - 1], status: code as ChangedPath["status"] });
    }
  }
  return changed;
}

/**
 * Usage: tsx src/cli/check-changeset.ts <baseRef>
 * Diffs HEAD against <baseRef>, then enforces release immutability/collision.
 * "exists on master" is determined by probing the base ref for the release's
 * package via `git cat-file -e <baseRef>:<releaseDir>/package.tar.gz`.
 */
async function main(): Promise<void> {
  const baseRef = process.argv[2];
  if (!baseRef) throw new Error("usage: check-changeset <baseRef>");

  const { stdout } = await exec("git", ["diff", "--name-status", `${baseRef}...HEAD`]);
  const changed: ChangedPath[] = parseNameStatus(stdout);

  // A release exists on the base ref iff its package blob is present there.
  const existsCache = new Map<string, boolean>();
  async function existsOnBase(releaseDir: string): Promise<boolean> {
    const cached = existsCache.get(releaseDir);
    if (cached !== undefined) return cached;
    let exists = false;
    try {
      await exec("git", ["cat-file", "-e", `${baseRef}:${releaseDir}/package.tar.gz`]);
      exists = true;
    } catch {
      exists = false;
    }
    existsCache.set(releaseDir, exists);
    return exists;
  }

  // Pre-resolve existence for every release dir touched by the changeset, so the
  // synchronous validateChangeset predicate can read from the cache.
  const RELEASE_RE = /^apps\/([^/]+)\/releases\/([^/]+)\/.+/;
  const dirs = new Set<string>();
  for (const c of changed) {
    const m = RELEASE_RE.exec(c.path);
    if (m) dirs.add(`apps/${m[1]}/releases/${m[2]}`);
  }
  for (const dir of dirs) await existsOnBase(dir);

  validateChangeset(changed, (releaseDir) => existsCache.get(releaseDir) ?? false);

  // Immutability/collision passed; now gate newly-added releases on the
  // platform floor. Resolve the repo root so package paths (relative to it)
  // are readable regardless of the CLI's working directory.
  const repoRoot = (await exec("git", ["rev-parse", "--show-toplevel"])).stdout.trim();
  await enforcePlatformFloorOnAdded(changed, repoRoot);

  console.log("Changeset OK: no immutability or collision violations.");
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
