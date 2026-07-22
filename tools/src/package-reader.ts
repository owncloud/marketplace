import * as tar from "tar";
import { mkdtemp, readFile, readdir, rm, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { ValidationError } from "./types.js";

const INFO_XML_RE = /(^|\/)appinfo\/info\.xml$/;

/** One regular file from a package, with its tar-internal path and raw bytes. */
export interface TarballEntry {
  /** Path as stored in the archive, forward-slash separated (e.g. "music/appinfo/info.xml"). */
  path: string;
  bytes: Buffer;
}

/** Extract and return the appinfo/info.xml text from a .tar.gz package. */
export async function readInfoXmlFromTarball(tarballPath: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mp-extract-"));
  let matchedPath: string | undefined;
  try {
    await tar.x({
      file: tarballPath,
      cwd: dir,
      filter: (p) => INFO_XML_RE.test(p),
      onentry: (entry) => {
        if (matchedPath === undefined && INFO_XML_RE.test(entry.path)) {
          matchedPath = entry.path;
        }
      },
    });
    if (matchedPath === undefined) {
      throw new ValidationError(
        "package does not contain an appinfo/info.xml file at any app root",
      );
    }
    return await readFile(join(dir, matchedPath), "utf8");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Extract every regular file from a .tar.gz and return it with its archive path
 * and raw bytes. Directories and symlinks are skipped (only file bytes matter
 * for hashing). Paths are normalised to forward slashes so they match the
 * forward-slash relative keys used in signature.json manifests.
 *
 * The whole package is materialised in a temp dir which is removed before
 * returning; the caller receives the bytes in memory. App packages are small
 * (a few MB), so buffering them is fine.
 */
export async function readTarballEntries(tarballPath: string): Promise<TarballEntry[]> {
  const dir = await mkdtemp(join(tmpdir(), "mp-entries-"));
  try {
    await tar.x({ file: tarballPath, cwd: dir });
    const entries: TarballEntry[] = [];
    async function walk(abs: string): Promise<void> {
      for (const name of await readdir(abs)) {
        const full = join(abs, name);
        const st = await lstat(full);
        if (st.isDirectory()) {
          await walk(full);
        } else if (st.isFile()) {
          const rel = relative(dir, full).split(sep).join("/");
          entries.push({ path: rel, bytes: await readFile(full) });
        }
      }
    }
    await walk(dir);
    return entries;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
