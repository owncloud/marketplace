import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { appAssetName, appAssetUrl, extAssetName, extAssetUrl, githubRepo } from "../src/config.js";

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
