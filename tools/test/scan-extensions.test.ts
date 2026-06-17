import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanExtensions } from "../src/ext/scan-extensions.js";

let root: string;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

async function makeTree(): Promise<string> {
  root = await mkdtemp(join(tmpdir(), "ext-"));
  const ext = join(root, "extensions");
  for (const [id, version] of [
    ["draw-io", "0.1.0"],
    ["draw-io", "0.2.0"],
    ["json-viewer", "1.0.0"],
  ]) {
    const dir = join(ext, id, "releases", version);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "bundle.zip"), "x");
    await writeFile(join(dir, "extension.yaml"), "x");
  }
  return ext;
}

describe("scanExtensions", () => {
  it("lists every extId/version release with bundle and yaml paths", async () => {
    const ext = await makeTree();
    const refs = await scanExtensions(ext);
    const keys = refs.map((r) => `${r.extId}@${r.version}`).sort();
    expect(keys).toEqual(["draw-io@0.1.0", "draw-io@0.2.0", "json-viewer@1.0.0"]);
    const d2 = refs.find((r) => r.extId === "draw-io" && r.version === "0.2.0")!;
    expect(d2.bundlePath.endsWith("draw-io/releases/0.2.0/bundle.zip")).toBe(true);
    expect(d2.yamlPath.endsWith("draw-io/releases/0.2.0/extension.yaml")).toBe(true);
  });

  it("returns an empty array when extensions dir does not exist", async () => {
    expect(await scanExtensions(join(tmpdir(), "definitely-missing-ext-xyz"))).toEqual([]);
  });
});
