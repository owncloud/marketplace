import * as tar from "tar";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ValidationError } from "./types.js";

const INFO_XML_RE = /(^|\/)appinfo\/info\.xml$/;

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
