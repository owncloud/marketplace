import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export interface ExtensionRef {
  extId: string;
  version: string;
  /** Directory: <extRoot>/<extId>/releases/<version> */
  dir: string;
  /** Absolute path to the extension's metadata file. */
  yamlPath: string;
  /** Absolute path to the extension bundle ZIP. */
  bundlePath: string;
}

async function listDirs(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/** Walk <extRoot>/{extId}/releases/{version}/ and return every release. */
export async function scanExtensions(extRoot: string): Promise<ExtensionRef[]> {
  try {
    await stat(extRoot);
  } catch {
    return [];
  }
  const refs: ExtensionRef[] = [];
  for (const extId of await listDirs(extRoot)) {
    const releasesDir = join(extRoot, extId, "releases");
    for (const version of await listDirs(releasesDir)) {
      const dir = join(releasesDir, version);
      refs.push({
        extId,
        version,
        dir,
        yamlPath: join(dir, "extension.yaml"),
        bundlePath: join(dir, "bundle.zip"),
      });
    }
  }
  return refs;
}
