import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listScreenshots, findCover, screenshotsDir } from "../src/screenshots.js";

let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

async function makeRelease(files: { cover?: string; screenshots?: string[] }): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), "release-"));
  if (files.cover) await writeFile(join(dir, files.cover), "x");
  if (files.screenshots && files.screenshots.length > 0) {
    await mkdir(screenshotsDir(dir), { recursive: true });
    for (const s of files.screenshots) await writeFile(join(screenshotsDir(dir), s), "x");
  }
  return dir;
}

describe("findCover", () => {
  it("finds cover.png", async () => {
    const d = await makeRelease({ cover: "cover.png" });
    expect(await findCover(d)).toBe("cover.png");
  });

  it("finds cover.webp", async () => {
    const d = await makeRelease({ cover: "cover.webp" });
    expect(await findCover(d)).toBe("cover.webp");
  });

  it("returns undefined when no cover ships", async () => {
    const d = await makeRelease({ screenshots: ["01.png"] });
    expect(await findCover(d)).toBeUndefined();
  });

  it("ignores non-cover files at the release root", async () => {
    const d = await makeRelease({});
    await writeFile(join(d, "bundle.zip"), "x");
    await writeFile(join(d, "extension.yaml"), "x");
    expect(await findCover(d)).toBeUndefined();
  });
});

describe("listScreenshots", () => {
  it("lists sorted screenshot files and excludes the cover", async () => {
    const d = await makeRelease({ cover: "cover.png", screenshots: ["02.jpg", "01.png"] });
    expect(await listScreenshots(d)).toEqual(["01.png", "02.jpg"]);
  });

  it("returns [] when no screenshots dir exists", async () => {
    const d = await makeRelease({ cover: "cover.png" });
    expect(await listScreenshots(d)).toEqual([]);
  });
});
