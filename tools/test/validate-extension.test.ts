import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateExtensionRelease, assertConsistentIds } from "../src/ext/validate-extension.js";
import type { ExtensionRef } from "../src/ext/scan-extensions.js";
import type { ExtensionInfo } from "../src/ext/types.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

function yaml(id: string, version: string): string {
  return `
id: ${id}
name: Example
subtitle: An example.
license: AGPL-3.0
version: ${version}
authors:
  - name: ownCloud
tags: [tools]
`;
}

async function release(extId: string, version: string, body: string): Promise<ExtensionRef> {
  const root = await mkdtemp(join(tmpdir(), "extrel-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const dir = join(root, extId, "releases", version);
  await mkdir(dir, { recursive: true });
  const yamlPath = join(dir, "extension.yaml");
  await writeFile(yamlPath, body);
  return { extId, version, dir, yamlPath, bundlePath: join(dir, "bundle.zip") };
}

describe("validateExtensionRelease", () => {
  it("accepts a release whose folder version matches extension.yaml", async () => {
    const ref = await release("draw-io", "0.2.0", yaml("com.example.draw-io", "0.2.0"));
    const info = await validateExtensionRelease(ref);
    expect(info.id).toBe("com.example.draw-io");
    expect(info.version).toBe("0.2.0");
  });

  it("rejects when the folder version differs from extension.yaml version", async () => {
    const ref = await release("draw-io", "0.2.0", yaml("com.example.draw-io", "9.9.9"));
    await expect(validateExtensionRelease(ref)).rejects.toThrow(/version/i);
  });

  it("rejects when extension.yaml is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "extrel-"));
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    const dir = join(root, "draw-io", "releases", "0.1.0");
    await mkdir(dir, { recursive: true });
    const ref: ExtensionRef = {
      extId: "draw-io",
      version: "0.1.0",
      dir,
      yamlPath: join(dir, "extension.yaml"),
      bundlePath: join(dir, "bundle.zip"),
    };
    await expect(validateExtensionRelease(ref)).rejects.toThrow(/missing extension\.yaml/i);
  });
});

describe("assertConsistentIds", () => {
  const info = (id: string): ExtensionInfo => ({
    id,
    name: "X",
    subtitle: "s",
    license: "MIT",
    version: "1.0.0",
    authors: [{ name: "A" }],
    tags: ["t"],
  });

  it("accepts releases that all share the same id", () => {
    expect(() =>
      assertConsistentIds("draw-io", [info("com.example.draw-io"), info("com.example.draw-io")]),
    ).not.toThrow();
  });

  it("rejects releases that declare conflicting ids", () => {
    expect(() =>
      assertConsistentIds("draw-io", [info("com.example.draw-io"), info("com.example.typo")]),
    ).toThrow(/conflicting ids/i);
  });
});
