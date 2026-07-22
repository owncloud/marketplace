import * as tar from "tar";
import { mkdtemp, readFile, readdir, rm, lstat, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { ValidationError } from "./types.js";

const INFO_XML_RE = /(^|\/)appinfo\/info\.xml$/;

/** One entry from a package, with its tar-internal path and content bytes. */
export interface TarballEntry {
  /** Path as stored in the archive, forward-slash separated (e.g. "music/appinfo/info.xml"). */
  path: string;
  /** Content bytes. For a symlink, the bytes of the (followed) target file. */
  bytes: Buffer;
  /**
   * True when this entry is a symlink. The legacy (v1) code signer followed
   * symlinks and hashed the target file's content, so `bytes` holds that target
   * content; ocsign (v2) never follows symlinks, so the verifier drops these for
   * v2 packages.
   */
  isSymlink: boolean;
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
 * Extract every regular file and symlink from a .tar.gz and return it with its
 * archive path and content bytes. Directories are skipped. Paths are normalised
 * to forward slashes so they match the forward-slash relative keys used in
 * signature.json manifests.
 *
 * Symlinks are surfaced (marked `isSymlink`) with the bytes of their resolved
 * target, because the legacy v1 signer followed and hashed them. A symlink whose
 * target is missing or points outside the package is skipped rather than raising
 * — the manifest check will then report it as a missing file. Symlink resolution
 * is confined to the extraction dir to avoid reading arbitrary host files.
 *
 * The whole package is materialised in a temp dir which is removed before
 * returning; the caller receives the bytes in memory. App packages are small
 * (a few MB), so buffering them is fine.
 */
export async function readTarballEntries(tarballPath: string): Promise<TarballEntry[]> {
  const dir = await mkdtemp(join(tmpdir(), "mp-entries-"));
  try {
    await tar.x({ file: tarballPath, cwd: dir });
    const root = await realpath(dir);
    const entries: TarballEntry[] = [];
    async function walk(abs: string): Promise<void> {
      for (const name of await readdir(abs)) {
        const full = join(abs, name);
        const st = await lstat(full);
        const rel = relative(dir, full).split(sep).join("/");
        if (st.isDirectory()) {
          await walk(full);
        } else if (st.isFile()) {
          entries.push({ path: rel, bytes: await readFile(full), isSymlink: false });
        } else if (st.isSymbolicLink()) {
          const bytes = await readSymlinkTarget(full, root);
          if (bytes !== undefined) entries.push({ path: rel, bytes, isSymlink: true });
        }
      }
    }
    await walk(dir);
    return entries;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Read the content a symlink resolves to, but only if the target is a regular
 * file inside `root`. Returns undefined for dangling links, links to
 * directories, or targets that escape `root` (defence against a crafted package
 * making us hash a host file).
 */
async function readSymlinkTarget(linkPath: string, root: string): Promise<Buffer | undefined> {
  let resolved: string;
  try {
    resolved = await realpath(linkPath);
  } catch {
    return undefined; // dangling
  }
  if (resolved !== root && !resolved.startsWith(root + sep)) return undefined; // escapes package
  try {
    const st = await lstat(resolved);
    if (!st.isFile()) return undefined;
    return await readFile(resolved);
  } catch {
    return undefined;
  }
}
