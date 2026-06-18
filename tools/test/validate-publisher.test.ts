import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validatePublisher,
  assertOwnershipIntegrity,
} from "../src/publishers/validate-publisher.js";
import { scanPublishers } from "../src/publishers/scan-publishers.js";
import { ValidationError } from "../src/types.js";
import type { PublisherInfo } from "../src/publishers/types.js";

// A tiny valid 1x1 PNG, reused as a logo fixture.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

let root: string;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

/** Write publishers/<slug>/publisher.json (+ optional files) and return the root. */
async function makePublisher(
  slug: string,
  body: Record<string, unknown>,
  files: Record<string, Buffer> = {},
): Promise<string> {
  root = await mkdtemp(join(tmpdir(), "pub-"));
  const dir = join(root, "publishers", slug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "publisher.json"), JSON.stringify(body));
  for (const [name, bytes] of Object.entries(files)) {
    await writeFile(join(dir, name), bytes);
  }
  return join(root, "publishers");
}

describe("validatePublisher", () => {
  it("accepts a publisher whose slug matches its folder", async () => {
    const pubRoot = await makePublisher("owncloud", { slug: "owncloud", name: "ownCloud" });
    const [ref] = await scanPublishers(pubRoot);
    const info = await validatePublisher(ref);
    expect(info.slug).toBe("owncloud");
    expect(info.enabled).toBe(false);
  });

  it("rejects a slug that does not match the folder name", async () => {
    const pubRoot = await makePublisher("owncloud", { slug: "acme", name: "Acme" });
    const [ref] = await scanPublishers(pubRoot);
    await expect(validatePublisher(ref)).rejects.toThrow(/slug mismatch/);
  });

  it("rejects a missing publisher.json", async () => {
    root = await mkdtemp(join(tmpdir(), "pub-"));
    const ref = {
      slug: "ghost",
      dir: join(root, "ghost"),
      jsonPath: join(root, "ghost/publisher.json"),
    };
    await expect(validatePublisher(ref)).rejects.toThrow(/missing publisher.json/);
  });

  it("accepts a valid logo image", async () => {
    const pubRoot = await makePublisher(
      "owncloud",
      { slug: "owncloud", name: "ownCloud", logo: "logo.png" },
      { "logo.png": PNG },
    );
    const [ref] = await scanPublishers(pubRoot);
    const info = await validatePublisher(ref);
    expect(info.logo).toBe("logo.png");
  });

  it("rejects a declared-but-missing logo", async () => {
    const pubRoot = await makePublisher("owncloud", {
      slug: "owncloud",
      name: "ownCloud",
      logo: "logo.png",
    });
    const [ref] = await scanPublishers(pubRoot);
    await expect(validatePublisher(ref)).rejects.toThrow(/logo.*missing/);
  });

  it("rejects a logo that is not a supported image", async () => {
    const pubRoot = await makePublisher(
      "owncloud",
      { slug: "owncloud", name: "ownCloud", logo: "logo.png" },
      { "logo.png": Buffer.from("not an image") },
    );
    const [ref] = await scanPublishers(pubRoot);
    await expect(validatePublisher(ref)).rejects.toThrow(ValidationError);
  });

  it("rejects a logo path that escapes the publisher directory", async () => {
    const pubRoot = await makePublisher("owncloud", {
      slug: "owncloud",
      name: "ownCloud",
      logo: "../secret.png",
    });
    const [ref] = await scanPublishers(pubRoot);
    await expect(validatePublisher(ref)).rejects.toThrow(/file name/);
  });
});

describe("assertOwnershipIntegrity", () => {
  const pub = (slug: string, over: Partial<PublisherInfo> = {}): PublisherInfo => ({
    slug,
    name: slug,
    enabled: true,
    apps: [],
    extensions: [],
    ...over,
  });

  it("accepts publishers whose owned ids all exist", () => {
    expect(() =>
      assertOwnershipIntegrity(
        [pub("owncloud", { apps: ["a"], extensions: ["x"] })],
        new Set(["a", "b"]),
        new Set(["x"]),
      ),
    ).not.toThrow();
  });

  it("rejects an unknown app id", () => {
    expect(() =>
      assertOwnershipIntegrity([pub("p", { apps: ["nope"] })], new Set(["a"]), new Set()),
    ).toThrow(/unknown app "nope"/);
  });

  it("rejects an unknown extension id", () => {
    expect(() =>
      assertOwnershipIntegrity([pub("p", { extensions: ["nope"] })], new Set(), new Set(["x"])),
    ).toThrow(/unknown extension "nope"/);
  });

  it("rejects an app claimed by two publishers", () => {
    expect(() =>
      assertOwnershipIntegrity(
        [pub("a", { apps: ["shared"] }), pub("b", { apps: ["shared"] })],
        new Set(["shared"]),
        new Set(),
      ),
    ).toThrow(/claimed by both/);
  });

  it("rejects an extension claimed by two publishers", () => {
    expect(() =>
      assertOwnershipIntegrity(
        [pub("a", { extensions: ["x"] }), pub("b", { extensions: ["x"] })],
        new Set(),
        new Set(["x"]),
      ),
    ).toThrow(/claimed by both/);
  });
});
