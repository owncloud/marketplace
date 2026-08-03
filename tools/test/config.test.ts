import { describe, it, expect, beforeEach, afterEach } from "vitest";
import semver from "semver";
import {
  appAssetName,
  appAssetUrl,
  extAssetName,
  extAssetUrl,
  githubRepo,
  KNOWN_PLATFORM_VERSIONS,
} from "../src/config.js";

let savedRepo: string | undefined;
beforeEach(() => {
  savedRepo = process.env.GITHUB_REPOSITORY;
});
afterEach(() => {
  if (savedRepo === undefined) delete process.env.GITHUB_REPOSITORY;
  else process.env.GITHUB_REPOSITORY = savedRepo;
});

describe("githubRepo", () => {
  it("reads GITHUB_REPOSITORY when set", () => {
    process.env.GITHUB_REPOSITORY = "owner/repo";
    expect(githubRepo()).toBe("owner/repo");
  });

  it("falls back to the canonical repo when unset", () => {
    delete process.env.GITHUB_REPOSITORY;
    expect(githubRepo()).toBe("DeepDiver1975/appstore");
  });
});

describe("appAssetName / appAssetUrl", () => {
  it("names the asset <appId>-<version>.tar.gz", () => {
    expect(appAssetName("calendar", "1.0.0")).toBe("calendar-1.0.0.tar.gz");
  });

  it("builds the Release asset URL on the app's tag, honoring GITHUB_REPOSITORY", () => {
    process.env.GITHUB_REPOSITORY = "owner/repo";
    expect(appAssetUrl("calendar", "1.0.0")).toBe(
      "https://github.com/owner/repo/releases/download/calendar/calendar-1.0.0.tar.gz",
    );
  });
});

describe("KNOWN_PLATFORM_VERSIONS", () => {
  // The Market app requests /api/v1/platform/<its exact 3-part version>/apps.json
  // and has no fallback: a version absent from this list is a hard 404 that
  // breaks `occ market:list` outright (owncloud/core#41773 — 10.16.4).
  it("covers every released 10.16.x patch, including 10.16.4", () => {
    expect(KNOWN_PLATFORM_VERSIONS).toContain("10.16.4");
  });

  // Patch releases ship without a marketplace change, so an exact enumeration
  // is stale the day core tags a new patch. Cover the rest of each line ahead
  // of time rather than waiting for the next 404 report.
  it("covers headroom past the newest released patch of each supported line", () => {
    for (const v of ["10.15.4", "10.16.5", "10.16.9"]) {
      expect(KNOWN_PLATFORM_VERSIONS).toContain(v);
    }
  });

  it("keeps entries unique, 3-part and sorted ascending", () => {
    expect(new Set(KNOWN_PLATFORM_VERSIONS).size).toBe(KNOWN_PLATFORM_VERSIONS.length);
    for (const v of KNOWN_PLATFORM_VERSIONS) expect(v).toMatch(/^\d+\.\d+\.\d+$/);
    const sorted = [...KNOWN_PLATFORM_VERSIONS].sort((a, b) => semver.compare(a, b));
    expect(KNOWN_PLATFORM_VERSIONS).toEqual(sorted);
  });
});

describe("extAssetName / extAssetUrl", () => {
  it("names the asset <extId>-<version>.zip", () => {
    expect(extAssetName("draw-io", "0.2.0")).toBe("draw-io-0.2.0.zip");
  });

  it("builds the Release asset URL on the extension's tag, honoring GITHUB_REPOSITORY", () => {
    process.env.GITHUB_REPOSITORY = "owner/repo";
    expect(extAssetUrl("draw-io", "0.2.0")).toBe(
      "https://github.com/owner/repo/releases/download/draw-io/draw-io-0.2.0.zip",
    );
  });
});
