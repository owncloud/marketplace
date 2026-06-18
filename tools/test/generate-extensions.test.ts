import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildExtension, writeOcisApi } from "../src/ext/generate-extensions.js";
import type { ExtensionInfo, OcisApp } from "../src/ext/types.js";

let savedRepo: string | undefined;
beforeEach(() => {
  savedRepo = process.env.GITHUB_REPOSITORY;
  process.env.GITHUB_REPOSITORY = "owner/repo";
});
afterEach(() => {
  if (savedRepo === undefined) delete process.env.GITHUB_REPOSITORY;
  else process.env.GITHUB_REPOSITORY = savedRepo;
});

function info(version: string, overrides: Partial<ExtensionInfo> = {}): ExtensionInfo {
  return {
    id: "com.example.draw-io",
    name: "Draw.io",
    subtitle: "View and edit draw.io diagrams.",
    license: "AGPL-3.0",
    version,
    minOCIS: "6.2.0",
    authors: [{ name: "ownCloud GmbH", url: "https://owncloud.com" }],
    tags: ["editor", "viewer"],
    ...overrides,
  };
}

describe("buildExtension", () => {
  it("sorts versions newest-first and points url at the extId release asset", () => {
    const app = buildExtension(
      "draw-io",
      [info("0.1.0"), info("0.2.0")],
      () => "2026-06-11T00:00:00+00:00",
      () => [],
      () => undefined,
      "https://site",
      { "0.1.0": 5, "0.2.0": 12 },
    );
    expect(app.versions.map((v) => v.version)).toEqual(["0.2.0", "0.1.0"]);
    expect(app.versions[0].url).toBe(
      "https://github.com/owner/repo/releases/download/draw-io/draw-io-0.2.0.zip",
    );
    expect(app.versions[0].minOCIS).toBe("6.2.0");
    expect(app.versions[0].downloads).toBe(12);
    // App-level download total sums every version.
    expect(app.downloads).toBe(17);
  });

  it("takes display fields from the newest release", () => {
    const app = buildExtension(
      "draw-io",
      [
        info("0.1.0", { subtitle: "old subtitle" }),
        info("0.2.0", { subtitle: "new subtitle", description: "Full." }),
      ],
      () => "2026-06-11T00:00:00+00:00",
      () => [],
      () => undefined,
      "https://site",
    );
    expect(app.subtitle).toBe("new subtitle");
    expect(app.description).toBe("Full.");
  });

  it("rewrites ingested screenshots to same-origin URLs, cover falls back to the first", () => {
    const app = buildExtension(
      "draw-io",
      [info("0.2.0")],
      () => "2026-06-11T00:00:00+00:00",
      (id, version) => (id === "draw-io" && version === "0.2.0" ? ["01.png", "02.jpg"] : []),
      () => undefined,
      "https://site",
    );
    expect(app.screenshots).toEqual([
      { url: "https://site/extensions/draw-io/releases/0.2.0/screenshots/01.png" },
      { url: "https://site/extensions/draw-io/releases/0.2.0/screenshots/02.jpg" },
    ]);
    // No distinct cover file → the first screenshot doubles as the cover.
    expect(app.coverImage).toEqual({
      url: "https://site/extensions/draw-io/releases/0.2.0/screenshots/01.png",
    });
  });

  it("pairs screenshot captions positionally and tolerates a short list", () => {
    const app = buildExtension(
      "draw-io",
      [info("0.2.0", { screenshotCaptions: ["First shot"] })],
      () => "2026-06-11T00:00:00+00:00",
      () => ["01.png", "02.jpg"],
      () => undefined,
      "https://site",
    );
    expect(app.screenshots).toEqual([
      {
        url: "https://site/extensions/draw-io/releases/0.2.0/screenshots/01.png",
        caption: "First shot",
      },
      { url: "https://site/extensions/draw-io/releases/0.2.0/screenshots/02.jpg" },
    ]);
  });

  it("uses a distinct cover file with its caption, separate from the screenshots", () => {
    const app = buildExtension(
      "draw-io",
      [info("0.2.0", { cover: true, coverCaption: "The editor" })],
      () => "2026-06-11T00:00:00+00:00",
      () => ["01.png"],
      (id, version) => (id === "draw-io" && version === "0.2.0" ? "cover.png" : undefined),
      "https://site",
    );
    expect(app.coverImage).toEqual({
      url: "https://site/extensions/draw-io/releases/0.2.0/cover.png",
      caption: "The editor",
    });
    // The cover is distinct from the screenshots, which are still exposed.
    expect(app.screenshots).toEqual([
      { url: "https://site/extensions/draw-io/releases/0.2.0/screenshots/01.png" },
    ]);
  });

  it("omits screenshots/coverImage when the release is not yet ingested", () => {
    const app = buildExtension(
      "draw-io",
      [info("0.2.0")],
      () => "2026-06-11T00:00:00+00:00",
      () => [],
      () => undefined,
      "https://site",
    );
    expect(app.screenshots).toBeUndefined();
    expect(app.coverImage).toBeUndefined();
  });

  it("omits minOCIS from a version that does not declare it", () => {
    const app = buildExtension(
      "draw-io",
      [info("0.2.0", { minOCIS: undefined })],
      () => "2026-06-11T00:00:00+00:00",
      () => [],
      () => undefined,
      "https://site",
    );
    expect(app.versions[0].minOCIS).toBeUndefined();
  });
});

/**
 * Conformance with oCIS Web's app-store RawAppSchema (owncloud/web →
 * packages/web-app-app-store/src/types.ts). We don't import oCIS's Zod schema;
 * instead we assert the fields oCIS requires are present and well-typed, so a
 * regression in our output is caught even though oCIS strips our extra keys.
 */
describe("oCIS RawAppSchema conformance", () => {
  function assertConformant(app: OcisApp): void {
    expect(typeof app.id).toBe("string");
    expect(typeof app.name).toBe("string");
    expect(typeof app.subtitle).toBe("string");
    expect(typeof app.license).toBe("string");
    expect(Array.isArray(app.versions)).toBe(true);
    expect(app.versions.length).toBeGreaterThan(0);
    for (const v of app.versions) {
      expect(typeof v.version).toBe("string");
      expect(typeof v.url).toBe("string");
      if (v.minOCIS !== undefined) expect(typeof v.minOCIS).toBe("string");
    }
    expect(Array.isArray(app.authors)).toBe(true);
    expect(app.authors.length).toBeGreaterThan(0);
    for (const a of app.authors) expect(typeof a.name).toBe("string");
    expect(Array.isArray(app.tags)).toBe(true);
    for (const t of app.tags) expect(typeof t).toBe("string");
  }

  it("buildExtension produces a RawAppSchema-conformant object", () => {
    const app = buildExtension(
      "draw-io",
      [info("0.2.0")],
      () => "2026-06-11T00:00:00+00:00",
      () => ["01.png"],
      () => undefined,
      "https://site",
    );
    assertConformant(app);
  });
});

describe("writeOcisApi", () => {
  let out: string;
  afterEach(async () => {
    if (out) await rm(out, { recursive: true, force: true });
  });

  it("writes api/ocis/v1/apps.json as an array", async () => {
    out = await mkdtemp(join(tmpdir(), "ocis-api-"));
    const app = buildExtension(
      "draw-io",
      [info("0.2.0")],
      () => "2026-06-11T00:00:00+00:00",
      () => [],
      () => undefined,
      "https://site",
    );
    await writeOcisApi(out, [app]);
    const written = JSON.parse(await readFile(join(out, "api/ocis/v1/apps.json"), "utf8"));
    expect(Array.isArray(written)).toBe(true);
    expect(written[0].id).toBe("com.example.draw-io");
  });

  it("is deterministic: re-running yields byte-identical apps.json", async () => {
    out = await mkdtemp(join(tmpdir(), "ocis-api-"));
    const app = buildExtension(
      "draw-io",
      [info("0.2.0")],
      () => "2026-06-11T00:00:00+00:00",
      () => [],
      () => undefined,
      "https://site",
    );
    await writeOcisApi(out, [app]);
    const first = await readFile(join(out, "api/ocis/v1/apps.json"), "utf8");
    await writeOcisApi(out, [app]);
    const second = await readFile(join(out, "api/ocis/v1/apps.json"), "utf8");
    expect(second).toBe(first);
  });
});
