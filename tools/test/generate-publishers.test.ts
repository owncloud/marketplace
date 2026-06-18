import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPublisher, writePublishers } from "../src/publishers/generate-publishers.js";
import type { PublisherInfo } from "../src/publishers/types.js";
import type { ApiApp } from "../src/types.js";
import type { OcisApp } from "../src/ext/types.js";

function info(over: Partial<PublisherInfo> = {}): PublisherInfo {
  return {
    slug: "owncloud",
    name: "ownCloud GmbH",
    enabled: true,
    apps: ["example-app"],
    extensions: ["example-extension"],
    ...over,
  };
}

function app(id: string, downloads: number): ApiApp {
  return {
    id,
    type: "app",
    name: id,
    categories: [],
    description: "",
    screenshots: [],
    marketplace: "",
    downloads,
    rating: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, mean: 0 },
    downloadable: true,
    publisher: { name: "ownCloud GmbH", url: "" },
    releases: [],
  };
}

function ext(id: string, downloads: number): OcisApp {
  return {
    id,
    name: id,
    subtitle: "",
    license: "AGPL-3.0",
    versions: [],
    authors: [{ name: "ownCloud GmbH" }],
    tags: [],
    downloads,
  };
}

describe("buildPublisher", () => {
  it("computes stats from the owned apps and extensions", () => {
    const pub = buildPublisher(
      info(),
      [app("example-app", 10)],
      [ext("com.example.ext", 5)],
      "https://site",
    );
    expect(pub.stats).toEqual({ apps: 1, extensions: 1, downloads: 15 });
  });

  it("rewrites the logo filename to a same-origin URL", () => {
    const pub = buildPublisher(info({ logo: "logo.png" }), [], [], "https://site");
    expect(pub.logo).toBe("https://site/publishers/owncloud/logo.png");
  });

  it("omits optional fields when not declared", () => {
    const pub = buildPublisher(info(), [], [], "https://site");
    expect(pub.logo).toBeUndefined();
    expect(pub.website).toBeUndefined();
    expect(pub.description).toBeUndefined();
  });

  it("carries website and description through", () => {
    const pub = buildPublisher(
      info({ website: "https://owncloud.com", description: "Hi." }),
      [],
      [],
      "https://site",
    );
    expect(pub.website).toBe("https://owncloud.com");
    expect(pub.description).toBe("Hi.");
  });
});

describe("writePublishers", () => {
  let out: string;
  afterEach(async () => {
    if (out) await rm(out, { recursive: true, force: true });
  });

  it("writes api/v1/publishers.json as an array", async () => {
    out = await mkdtemp(join(tmpdir(), "pub-api-"));
    const pub = buildPublisher(info(), [app("example-app", 1)], [], "https://site");
    await writePublishers(out, [pub]);
    const written = JSON.parse(await readFile(join(out, "api/v1/publishers.json"), "utf8"));
    expect(Array.isArray(written)).toBe(true);
    expect(written[0].slug).toBe("owncloud");
  });

  it("is deterministic: re-running yields byte-identical output", async () => {
    out = await mkdtemp(join(tmpdir(), "pub-api-"));
    const pub = buildPublisher(info(), [], [], "https://site");
    await writePublishers(out, [pub]);
    const first = await readFile(join(out, "api/v1/publishers.json"), "utf8");
    await writePublishers(out, [pub]);
    const second = await readFile(join(out, "api/v1/publishers.json"), "utf8");
    expect(second).toBe(first);
  });
});
