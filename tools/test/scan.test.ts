import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanApps } from "../src/scan.js";

let root: string;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

async function makeTree(): Promise<string> {
  root = await mkdtemp(join(tmpdir(), "apps-"));
  const apps = join(root, "apps");
  await mkdir(join(apps, "calendar", "releases", "1.0.0"), { recursive: true });
  await writeFile(join(apps, "calendar", "releases", "1.0.0", "package.tar.gz"), "x");
  await mkdir(join(apps, "calendar", "releases", "2.0.0"), { recursive: true });
  await writeFile(join(apps, "calendar", "releases", "2.0.0", "package.tar.gz"), "x");
  await mkdir(join(apps, "notes", "releases", "1.0.0"), { recursive: true });
  await writeFile(join(apps, "notes", "releases", "1.0.0", "package.tar.gz"), "x");
  return apps;
}

describe("scanApps", () => {
  it("lists every appId/version release with its tarball path", async () => {
    const apps = await makeTree();
    const refs = await scanApps(apps);
    const keys = refs.map((r) => `${r.appId}@${r.version}`).sort();
    expect(keys).toEqual(["calendar@1.0.0", "calendar@2.0.0", "notes@1.0.0"]);
    const cal1 = refs.find((r) => r.appId === "calendar" && r.version === "1.0.0")!;
    expect(cal1.tarballPath.endsWith("calendar/releases/1.0.0/package.tar.gz")).toBe(true);
  });

  it("returns an empty array when apps dir does not exist", async () => {
    expect(await scanApps(join(tmpdir(), "definitely-missing-xyz"))).toEqual([]);
  });
});
