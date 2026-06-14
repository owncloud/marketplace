import { describe, it, expect } from "vitest";
import {
  selectReleases,
  buildRawDownloads,
  buildAppCounts,
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
  it("maps GitHub releases to the trimmed raw shape", () => {
    expect(selectReleases([gh()])).toEqual([
      {
        tag_name: "v1.0.0",
        name: "rel",
        published_at: "2026-01-01T00:00:00Z",
        html_url: "https://github.com/owncloud/ocis/releases/tag/v1.0.0",
        body: "notes",
        assets: [
          { name: "ocis-1.0.0-linux-amd64", browser_download_url: "https://ex/a", size: 10 },
        ],
      },
    ]);
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
      ios: "owncloud/ios",
    });
  });
});
