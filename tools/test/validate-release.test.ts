import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateRelease } from "../src/validate.js";
import { makeTarball } from "./helpers/make-tarball.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

function infoXml(id: string, version: string, category = "tools"): string {
  return `<?xml version="1.0"?><info>
    <id>${id}</id><name>App</name><description>d</description>
    <licence>AGPL</licence><author>me</author><version>${version}</version>
    <category>${category}</category>
    <dependencies><owncloud min-version="10.0.0" max-version="10.99.99"/></dependencies>
  </info>`;
}

async function release(appId: string, version: string, info: string) {
  const root = await mkdtemp(join(tmpdir(), "rel-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const dir = join(root, appId, "releases", version);
  await mkdir(dir, { recursive: true });
  const tarballPath = join(dir, "package.tar.gz");
  cleanups.push(await makeTarball(tarballPath, { rootDir: appId, infoXml: info }));
  return { appId, version, dir, tarballPath };
}

describe("validateRelease", () => {
  it("accepts a release whose path matches info.xml and uses a valid category", async () => {
    const ref = await release("calendar", "2.1.0", infoXml("calendar", "2.1.0"));
    const info = await validateRelease(ref);
    expect(info.id).toBe("calendar");
  });

  it("rejects when folder appId differs from info.xml <id>", async () => {
    const ref = await release("calendar", "2.1.0", infoXml("kalender", "2.1.0"));
    await expect(validateRelease(ref)).rejects.toThrow(
      /id.*calendar.*kalender|kalender.*calendar/i,
    );
  });

  it("rejects when folder version differs from info.xml <version>", async () => {
    const ref = await release("calendar", "2.1.0", infoXml("calendar", "9.9.9"));
    await expect(validateRelease(ref)).rejects.toThrow(/version/i);
  });

  it("rejects an unknown category", async () => {
    const ref = await release("calendar", "2.1.0", infoXml("calendar", "2.1.0", "nonsense"));
    await expect(validateRelease(ref)).rejects.toThrow(/category.*nonsense/i);
  });
});
