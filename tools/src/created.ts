import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
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
 * Wrap a base CreatedProvider so an explicit appId@version → ISO override wins;
 * any release without an override delegates to the base (git history). Used to
 * carry the real historical release date of imported legacy releases, which the
 * git provider would otherwise date as the day they were committed here.
 */
export function withCreatedOverrides(
  base: CreatedProvider,
  overrides: Record<string, string>,
): CreatedProvider {
  return (appId, version) => overrides[`${appId}@${version}`] ?? base(appId, version);
}

/**
 * Read the committed created-date overrides (appId@version → ISO), or {} when
 * the file is absent — so the build degrades to pure git history. When the path
 * was explicitly requested but missing, warn loudly: that is a misconfiguration
 * (e.g. a workflow pointing at the wrong cwd-relative path) that would silently
 * date every imported release as the day it was committed here.
 */
export async function readCreatedOverrides(
  path: string,
  explicit = false,
): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Record<string, string>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      if (explicit) {
        console.warn(
          `WARN: --created file not found at "${path}"; release dates fall back to git commit dates.`,
        );
      }
      return {};
    }
    throw err;
  }
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
