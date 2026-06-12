import { describe, it, expect } from "vitest";
import { validatePlatformFloor } from "../src/validate.js";
import { ValidationError } from "../src/types.js";
import type { AppInfo } from "../src/types.js";

function info(platformMin: string): AppInfo {
  return {
    id: "example-app",
    name: "Example App",
    summary: "s",
    description: "d",
    license: "AGPL",
    author: "me",
    version: "1.0.0",
    categories: ["tools"],
    screenshots: [],
    platformMin,
    platformMax: "11.99.99",
  };
}

describe("validatePlatformFloor", () => {
  it("accepts min-version 11.0.0", () => {
    expect(() => validatePlatformFloor(info("11.0.0"))).not.toThrow();
  });

  it("accepts a bare major/minor min-version (11, 11.0)", () => {
    expect(() => validatePlatformFloor(info("11"))).not.toThrow();
    expect(() => validatePlatformFloor(info("11.0"))).not.toThrow();
  });

  it("rejects a min-version below 11", () => {
    expect(() => validatePlatformFloor(info("10.11.0"))).toThrow(ValidationError);
    expect(() => validatePlatformFloor(info("10.11.0"))).toThrow(/min-version.*11/i);
  });

  it("rejects an unparseable min-version", () => {
    expect(() => validatePlatformFloor(info("not-a-version"))).toThrow(/unparseable/i);
  });
});
