import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readInfoXmlFromTarball } from "../src/package-reader.js";
import { ValidationError } from "../src/types.js";
import { makeTarball } from "./helpers/make-tarball.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function tempTarPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pkg-"));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  return join(dir, "package.tar.gz");
}

describe("readInfoXmlFromTarball", () => {
  it("returns the info.xml content from appinfo/info.xml", async () => {
    const tarPath = await tempTarPath();
    cleanups.push(
      await makeTarball(tarPath, {
        rootDir: "calendar",
        infoXml: "<info><id>calendar</id></info>",
      }),
    );
    const xml = await readInfoXmlFromTarball(tarPath);
    expect(xml).toContain("<id>calendar</id>");
  });

  it("throws ValidationError when appinfo/info.xml is absent", async () => {
    const tarPath = await tempTarPath();
    cleanups.push(
      await makeTarball(tarPath, { rootDir: "calendar", extraFiles: { "readme.txt": "hi" } }),
    );
    await expect(readInfoXmlFromTarball(tarPath)).rejects.toThrow(ValidationError);
  });
});
