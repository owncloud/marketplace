import { describe, it, expect } from "vitest";
import { parsePublisherJson } from "../src/publishers/publisher-json.js";
import { ValidationError } from "../src/types.js";

function json(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ slug: "owncloud", name: "ownCloud GmbH", ...overrides });
}

describe("parsePublisherJson", () => {
  it("parses a minimal publisher with defaults", () => {
    const info = parsePublisherJson(json());
    expect(info).toEqual({
      slug: "owncloud",
      name: "ownCloud GmbH",
      enabled: false,
      apps: [],
      extensions: [],
    });
  });

  it("parses a full publisher", () => {
    const info = parsePublisherJson(
      json({
        enabled: true,
        website: "https://owncloud.com",
        description: "The company behind ownCloud.",
        logo: "logo.png",
        apps: ["example-app"],
        extensions: ["example-extension"],
      }),
    );
    expect(info).toEqual({
      slug: "owncloud",
      name: "ownCloud GmbH",
      enabled: true,
      website: "https://owncloud.com",
      description: "The company behind ownCloud.",
      logo: "logo.png",
      apps: ["example-app"],
      extensions: ["example-extension"],
    });
  });

  it("defaults enabled to false when absent or not true", () => {
    expect(parsePublisherJson(json()).enabled).toBe(false);
    expect(parsePublisherJson(json({ enabled: false })).enabled).toBe(false);
  });

  it("rejects invalid JSON", () => {
    expect(() => parsePublisherJson("{not json")).toThrow(ValidationError);
  });

  it("rejects a missing slug or name", () => {
    expect(() => parsePublisherJson(JSON.stringify({ name: "x" }))).toThrow(/slug/);
    expect(() => parsePublisherJson(JSON.stringify({ slug: "x" }))).toThrow(/name/);
  });

  it("rejects a slug that is not lowercase/hyphen safe", () => {
    expect(() => parsePublisherJson(json({ slug: "Own Cloud" }))).toThrow(/slug/);
    expect(() => parsePublisherJson(json({ slug: "-bad" }))).toThrow(/slug/);
  });

  it("rejects a non-boolean enabled", () => {
    expect(() => parsePublisherJson(json({ enabled: "yes" }))).toThrow(/enabled/);
  });

  it("rejects a non-http(s) or malformed website", () => {
    expect(() => parsePublisherJson(json({ website: "ftp://x.com" }))).toThrow(/website/);
    expect(() => parsePublisherJson(json({ website: "not a url" }))).toThrow(/website/);
  });

  it("rejects non-string entries in apps/extensions", () => {
    expect(() => parsePublisherJson(json({ apps: [1] }))).toThrow(/apps/);
    expect(() => parsePublisherJson(json({ extensions: [""] }))).toThrow(/extensions/);
  });

  it("trims string fields and id list entries", () => {
    const info = parsePublisherJson(json({ name: "  ownCloud  ", apps: ["  a  "] }));
    expect(info.name).toBe("ownCloud");
    expect(info.apps).toEqual(["a"]);
  });
});
