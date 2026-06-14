import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { appAssetName, appAssetUrl, githubRepo } from "../src/config.js";

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
