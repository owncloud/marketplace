import { describe, it, expect } from "vitest";
import {
  selectReleases,
  buildRawDownloads,
  buildAppCounts,
  selectClassicVersion,
  buildClassicRelease,
  CLASSIC_REPO,
  SURFACE_REPOS,
  type GhRelease,
} from "../src/cli/fetch-downloads.js";
import type { RawAsset } from "../src/downloads-types.js";

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

  it("does not include the classic server (it has no GitHub releases)", () => {
    expect(Object.values(SURFACE_REPOS)).not.toContain(CLASSIC_REPO);
  });
});

describe("selectClassicVersion", () => {
  const tag = (name: string) => ({ name });

  it("picks the highest stable 10.x version, without the leading v", () => {
    expect(
      selectClassicVersion([tag("v10.16.2"), tag("v10.16.3"), tag("v10.15.0")]),
    ).toBe("10.16.3");
  });

  it("compares components numerically rather than lexically", () => {
    expect(selectClassicVersion([tag("v10.9.0"), tag("v10.10.0")])).toBe("10.10.0");
  });

  it("ignores prerelease and stray tags", () => {
    expect(
      selectClassicVersion([
        tag("v10.16.2RC1"),
        tag("v10.16.2-rc1"),
        tag("vv9.1.4RC1"),
        tag("v9.1.8"),
        tag("v10.16.2"),
      ]),
    ).toBe("10.16.2");
  });

  it("returns null when no stable 10.x tag is present", () => {
    expect(selectClassicVersion([tag("v9.1.8"), tag("v10.16.2RC1")])).toBeNull();
    expect(selectClassicVersion([])).toBeNull();
  });
});

describe("buildClassicRelease", () => {
  const archives: RawAsset[] = [
    {
      name: "owncloud-10.16.3.tar.bz2",
      browser_download_url: "https://download.owncloud.com/server/stable/owncloud-10.16.3.tar.bz2",
      size: 58_000_000,
    },
    {
      name: "owncloud-10.16.3.zip",
      browser_download_url: "https://download.owncloud.com/server/stable/owncloud-10.16.3.zip",
      size: 72_000_000,
    },
  ];

  it("assembles a release with both archives and a git-tag html_url", () => {
    const rel = buildClassicRelease(
      "10.16.3",
      archives,
      ["2026-05-22T14:24:17.000Z", "2026-05-22T14:24:17.000Z"],
    );
    expect(rel.tag_name).toBe("v10.16.3");
    expect(rel.name).toBe("ownCloud 10.16.3");
    expect(rel.html_url).toBe("https://github.com/owncloud/core/releases/tag/v10.16.3");
    expect(rel.assets).toEqual(archives);
  });

  it("uses the newest archive last-modified as published_at", () => {
    const rel = buildClassicRelease(
      "10.16.3",
      archives,
      ["2026-05-20T00:00:00.000Z", "2026-05-22T14:24:17.000Z"],
    );
    expect(rel.published_at).toBe("2026-05-22T14:24:17.000Z");
  });

  it("tolerates a missing last-modified date", () => {
    const rel = buildClassicRelease("10.16.3", archives, ["", "2026-05-22T14:24:17.000Z"]);
    expect(rel.published_at).toBe("2026-05-22T14:24:17.000Z");
  });
});
