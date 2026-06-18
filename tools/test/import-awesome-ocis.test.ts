import { describe, it, expect } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  deriveSlugs,
  toExtensionInfo,
  toExtensionYaml,
  type SourceApp,
} from "../src/ext/import-awesome-ocis.js";
import { parseExtensionYaml } from "../src/ext/extension-yaml.js";

function app(overrides: Partial<SourceApp> = {}): SourceApp {
  return {
    id: "com.github.owncloud.web-extensions.draw-io",
    name: "Draw.io",
    subtitle: "View and edit draw.io diagrams.",
    license: "AGPL-3.0",
    versions: [{ version: "0.2.0", minOCIS: "6.2.0", url: "https://x/draw-io-0.2.0.zip" }],
    authors: [{ name: "ownCloud GmbH", url: "https://owncloud.com" }],
    tags: ["editor", "viewer"],
    coverImage: { url: "https://x/cover.png" },
    screenshots: [
      { url: "https://x/1.png", caption: "One" },
      { url: "https://x/2.png", caption: "Two" },
    ],
    resources: [{ url: "https://x", label: "GitHub", icon: "github" }],
    ...overrides,
  };
}

describe("deriveSlugs", () => {
  it("uses the last dot-segment as the slug", () => {
    const slugs = deriveSlugs([
      app({ id: "com.github.owncloud.web-extensions.draw-io" }),
      app({ id: "com.github.owncloud.web-extensions.unzip" }),
      app({ id: "com.github.mschlachter.ocis-app-tokens" }),
    ]);
    expect(slugs.get("com.github.owncloud.web-extensions.draw-io")).toBe("draw-io");
    expect(slugs.get("com.github.owncloud.web-extensions.unzip")).toBe("unzip");
    expect(slugs.get("com.github.mschlachter.ocis-app-tokens")).toBe("ocis-app-tokens");
  });

  it("falls back to the last two segments on a collision", () => {
    const slugs = deriveSlugs([
      app({ id: "com.example.foo.viewer" }),
      app({ id: "com.other.bar.viewer" }),
    ]);
    expect(slugs.get("com.example.foo.viewer")).toBe("foo-viewer");
    expect(slugs.get("com.other.bar.viewer")).toBe("bar-viewer");
  });

  it("rejects a non-reverse-DNS id", () => {
    expect(() => deriveSlugs([app({ id: "drawio" })])).toThrow(/reverse-DNS/i);
  });

  it("throws when even the two-segment fallback collides", () => {
    expect(() =>
      deriveSlugs([app({ id: "com.a.x.viewer" }), app({ id: "com.b.x.viewer" })]),
    ).toThrow(/collision/i);
  });
});

describe("toExtensionInfo / toExtensionYaml", () => {
  it("maps app + version fields, sets cover, and carries captions", () => {
    const a = app();
    const info = toExtensionInfo(a, a.versions[0]);
    expect(info).toMatchObject({
      id: "com.github.owncloud.web-extensions.draw-io",
      name: "Draw.io",
      subtitle: "View and edit draw.io diagrams.",
      license: "AGPL-3.0",
      version: "0.2.0",
      minOCIS: "6.2.0",
      cover: true,
      screenshotCaptions: ["One", "Two"],
    });
    expect(info.resources).toEqual([{ url: "https://x", label: "GitHub", icon: "github" }]);
  });

  it("omits cover when the app has no coverImage", () => {
    const a = app({ coverImage: undefined });
    expect(toExtensionInfo(a, a.versions[0]).cover).toBeUndefined();
  });

  it("omits captions unless every screenshot has one (avoids misalignment)", () => {
    const a = app({
      screenshots: [{ url: "https://x/1.png", caption: "One" }, { url: "https://x/2.png" }],
    });
    expect(toExtensionInfo(a, a.versions[0]).screenshotCaptions).toBeUndefined();
  });

  it("produces yaml that round-trips through the real parser", () => {
    const a = app();
    const yaml = toExtensionYaml(a, a.versions[0]);
    // The generated yaml must satisfy the production validator.
    const parsed = parseExtensionYaml(yaml);
    expect(parsed.id).toBe(a.id);
    expect(parsed.version).toBe("0.2.0");
    expect(parsed.cover).toBe(true);
    expect(parsed.screenshotCaptions).toEqual(["One", "Two"]);
    // Sanity: it is also valid YAML mapping.
    expect(typeof parseYaml(yaml)).toBe("object");
  });
});
