import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { validateChangeset, type ChangedPath } from "../validate.js";
import { ValidationError } from "../types.js";

/** A newly-added release package introduced by the changeset. */
const ADDED_PACKAGE_RE = /^apps\/[^/]+\/releases\/[^/]+\/package\.tar\.gz$/;

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
 * Return the repo-relative paths of release packages newly **added** by the diff
 * of `baseRef`...HEAD (status "A", matching `apps/{id}/releases/{version}/package.tar.gz`).
 * Shared by both the platform-floor gate and screenshot validation so the
 * "only new releases" rule is defined once.
 */
export async function addedPackagePaths(baseRef: string, cwd?: string): Promise<string[]> {
  const { stdout } = await exec("git", ["diff", "--name-status", `${baseRef}...HEAD`], { cwd });
  return parseNameStatus(stdout)
    .filter((c) => c.status === "A" && ADDED_PACKAGE_RE.test(c.path))
    .map((c) => c.path);
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
