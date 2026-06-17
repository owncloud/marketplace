import { describe, it, expect } from "vitest";
import {
  selectReleases,
  buildRawDownloads,
  buildAppCounts,
  selectClassicReleases,
  CLASSIC_REPO,
  SURFACE_REPOS,
  type GhRelease,
} from "../src/cli/fetch-downloads.js";

const gh = (overrides: Partial<GhRelease> = {}): GhRelease => ({
  tag_name: "v1.0.0",
  name: "rel",
  published_at: "2026-01-01T00:00:00Z",
  html_url: "https://github.com/owncloud/ocis/releases/tag/v1.0.0",
  body: "notes",
  draft: false,
  prerelease: false,
  assets: [
    {
      name: "ocis-1.0.0-linux-amd64",
      browser_download_url: "https://ex/a",
      size: 10,
      download_count: 0,
    },
  ],
  ...overrides,
});

const asset = (name: string, download_count: number) => ({
  name,
  browser_download_url: `https://ex/${name}`,
  size: 1,
  download_count,
});

describe("selectReleases", () => {
  it("maps GitHub releases to the trimmed raw shape, carrying download_count", () => {
    expect(selectReleases([gh({ assets: [asset("ocis-1.0.0-linux-amd64", 12)] })])).toEqual([
      {
        tag_name: "v1.0.0",
        name: "rel",
        published_at: "2026-01-01T00:00:00Z",
        html_url: "https://github.com/owncloud/ocis/releases/tag/v1.0.0",
        assets: [
          {
            name: "ocis-1.0.0-linux-amd64",
            browser_download_url: "https://ex/ocis-1.0.0-linux-amd64",
            size: 1,
            download_count: 12,
          },
        ],
      },
    ]);
  });

  it("defaults a missing download_count to 0", () => {
    const release = gh({
      // An asset shaped like the API response but without download_count.
      assets: [{ name: "a", browser_download_url: "https://ex/a", size: 1 } as never],
    });
    expect(selectReleases([release])[0].assets[0].download_count).toBe(0);
  });

  it("drops drafts and prereleases", () => {
    const releases = [
      gh({ tag_name: "v1.0.0" }),
      gh({ tag_name: "v1.1.0-rc.1", prerelease: true }),
      gh({ tag_name: "v1.2.0", draft: true }),
    ];
    expect(selectReleases(releases).map((r) => r.tag_name)).toEqual(["v1.0.0"]);
  });
});

describe("buildRawDownloads", () => {
  it("assembles per-surface releases with the generation timestamp", () => {
    const raw = buildRawDownloads(
      {
        ocis: [gh({ tag_name: "v7.1.0" })],
        client: [],
        android: [],
        ios: [],
      },
      "2026-06-14T00:00:00Z",
    );
    expect(raw.generated_at).toBe("2026-06-14T00:00:00Z");
    expect(raw.ocis.map((r) => r.tag_name)).toEqual(["v7.1.0"]);
    expect(raw.client).toEqual([]);
  });
});

describe("buildAppCounts", () => {
  it("maps each app's per-version asset download counts (tag = appId)", () => {
    const counts = buildAppCounts([
      gh({ tag_name: "calendar", assets: [asset("calendar-1.0.0.tar.gz", 30)] }),
      gh({ tag_name: "notes", assets: [asset("notes-2.1.0.tar.gz", 7)] }),
    ]);
    expect(counts).toEqual({
      calendar: { "1.0.0": 30 },
      notes: { "2.1.0": 7 },
    });
  });

  it("recovers versions that contain hyphens by stripping the exact appId prefix", () => {
    const counts = buildAppCounts([
      gh({ tag_name: "example-app", assets: [asset("example-app-1.0.0-beta.tar.gz", 4)] }),
    ]);
    expect(counts).toEqual({ "example-app": { "1.0.0-beta": 4 } });
  });

  it("ignores assets not matching the app's own naming", () => {
    const counts = buildAppCounts([
      gh({
        tag_name: "calendar",
        assets: [asset("calendar-1.0.0.tar.gz", 5), asset("checksums.txt", 99)],
      }),
    ]);
    expect(counts).toEqual({ calendar: { "1.0.0": 5 } });
  });

  it("returns an empty map for no releases", () => {
    expect(buildAppCounts([])).toEqual({});
  });
});

describe("SURFACE_REPOS", () => {
  it("maps each surface to its ownCloud repo", () => {
    expect(SURFACE_REPOS).toEqual({
      ocis: "owncloud/ocis",
      client: "owncloud/client",
      android: "owncloud/android",
      ios: "owncloud/ios-app",
    });
  });

  it("does not include the classic server (it is surfaced separately)", () => {
    expect(Object.values(SURFACE_REPOS)).not.toContain(CLASSIC_REPO);
  });
});

describe("selectClassicReleases", () => {
  const classic = (tag_name: string, overrides: Partial<GhRelease> = {}): GhRelease =>
    gh({ tag_name, ...overrides });

  it("keeps all supported 10.15/10.16 releases, newest-first", () => {
    const picked = selectClassicReleases([
      classic("v10.16.2"),
      classic("v10.16.3"),
      classic("v10.15.3"),
    ]);
    expect(picked.map((r) => r.tag_name)).toEqual(["v10.16.3", "v10.16.2", "v10.15.3"]);
  });

  it("compares patch components numerically rather than lexically", () => {
    const picked = selectClassicReleases([classic("v10.16.9"), classic("v10.16.10")]);
    expect(picked.map((r) => r.tag_name)).toEqual(["v10.16.10", "v10.16.9"]);
  });

  it("ignores drafts, prereleases and out-of-range lines", () => {
    const picked = selectClassicReleases([
      classic("v10.16.3", { draft: true }),
      classic("v10.16.2", { prerelease: true }),
      classic("v10.14.0"),
      classic("v11.0.0"),
      classic("v10.15.3"),
    ]);
    expect(picked.map((r) => r.tag_name)).toEqual(["v10.15.3"]);
  });

  it("returns [] when no supported release is present", () => {
    expect(selectClassicReleases([classic("v10.14.0"), classic("v11.0.0")])).toEqual([]);
    expect(selectClassicReleases([])).toEqual([]);
  });
});
