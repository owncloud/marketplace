import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CreatedProvider } from "./generate.js";

const exec = promisify(execFile);

/** CreatedProvider backed by a precomputed appId@version -> ISO map (for tests). */
export function makeStaticCreatedProvider(
  map: Record<string, string>,
  fallback = "1970-01-01T00:00:00+00:00",
): CreatedProvider {
  return (appId, version) => map[`${appId}@${version}`] ?? fallback;
}

/**
 * Build a CreatedProvider from git history: the author date of the FIRST commit
 * that introduced each release directory. Falls back to the build time when a
 * release is not yet committed (e.g. local uncommitted work).
 */
export async function makeGitCreatedProvider(
  releaseDirs: { appId: string; version: string; dir: string }[],
  fallbackIso: string,
): Promise<CreatedProvider> {
  const map: Record<string, string> = {};
  for (const { appId, version, dir } of releaseDirs) {
    try {
      const { stdout } = await exec("git", ["log", "--diff-filter=A", "--format=%aI", "--", dir]);
      const dates = stdout.trim().split("\n").filter(Boolean);
      map[`${appId}@${version}`] = dates.length ? dates[dates.length - 1] : fallbackIso;
    } catch {
      map[`${appId}@${version}`] = fallbackIso;
    }
  }
  return makeStaticCreatedProvider(map, fallbackIso);
}
