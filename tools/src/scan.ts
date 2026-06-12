import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export interface ReleaseRef {
  appId: string;
  version: string;
  /** Directory: <appsRoot>/<appId>/releases/<version> */
  dir: string;
  /** Absolute path to the package tarball. */
  tarballPath: string;
}

async function listDirs(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/** Walk <appsRoot>/{appId}/releases/{version}/ and return every release. */
export async function scanApps(appsRoot: string): Promise<ReleaseRef[]> {
  try {
    await stat(appsRoot);
  } catch {
    return [];
  }
  const refs: ReleaseRef[] = [];
  for (const appId of await listDirs(appsRoot)) {
    const releasesDir = join(appsRoot, appId, "releases");
    for (const version of await listDirs(releasesDir)) {
      const dir = join(releasesDir, version);
      refs.push({ appId, version, dir, tarballPath: join(dir, "package.tar.gz") });
    }
  }
  return refs;
}
