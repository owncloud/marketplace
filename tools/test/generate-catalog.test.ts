import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildApp, appsForPlatformVersion } from "../src/generate.js";
import type { AppInfo } from "../src/types.js";

// buildApp derives the asset URL host from GITHUB_REPOSITORY; pin it so the
// expected download URLs are stable regardless of the runner's environment.
let savedRepo: string | undefined;
beforeEach(() => {
  savedRepo = process.env.GITHUB_REPOSITORY;
  process.env.GITHUB_REPOSITORY = "owner/repo";
});
afterEach(() => {
  if (savedRepo === undefined) delete process.env.GITHUB_REPOSITORY;
  else process.env.GITHUB_REPOSITORY = savedRepo;
});

const base: AppInfo = {
  id: "calendar",
  name: "Calendar",
  summary: "s",
  description: "d",
  license: "AGPL",
  author: "ownCloud GmbH",
  version: "1.0.0",
  categories: ["tools"],
  screenshots: ["https://e.com/1.png"],
  platformMin: "10.0.0",
  platformMax: "10.99.99",
};

const created = () => "2026-06-11T00:00:00+00:00";
// Default: no ingested screenshots. Individual tests pass their own provider.
const noScreenshots = () => [];

describe("buildApp", () => {
  it("produces a faithful ApiApp with flat platform keys and static defaults", () => {
    const app = buildApp("calendar", [base], created, () => ["01.png"], "https://site");
    expect(app.id).toBe("calendar");
    expect(app.type).toBe("app");
    expect(app.downloads).toBe(0);
    expect(app.rating).toEqual({ "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, mean: 0 });
    expect(app.downloadable).toBe(true);
    // Screenshots are served same-origin from ingested files, not the info.xml URL.
    expect(app.screenshots).toEqual([
      { url: "https://site/apps/calendar/releases/1.0.0/screenshots/01.png" },
    ]);
    expect(app.marketplace).toBe("https://site/apps/calendar");
    expect(app.publisher).toEqual({ name: "ownCloud GmbH", url: "" });
    // The download URL points at the GitHub Release asset (tag = appId), not
    // the Pages copy, so GitHub counts the download.
    expect(app.releases[0]).toEqual({
      platformMin: "10.0.0",
      platformMax: "10.99.99",
      version: "1.0.0",
      download: "https://github.com/owner/repo/releases/download/calendar/calendar-1.0.0.tar.gz",
      license: "AGPL",
      created: "2026-06-11T00:00:00+00:00",
      downloads: 0,
    });
  });

  it("fills publisher.url from the publisher website when supplied", () => {
    const app = buildApp(
      "calendar",
      [base],
      created,
      noScreenshots,
      "https://site",
      {},
      "https://owncloud.com",
    );
    expect(app.publisher).toEqual({ name: "ownCloud GmbH", url: "https://owncloud.com" });
  });

  it("leaves publisher.url empty when no website is supplied", () => {
    const app = buildApp("calendar", [base], created, noScreenshots, "https://site");
    expect(app.publisher.url).toBe("");
  });

  it("populates per-release downloads from counts and sums them as the app total", () => {
    const v2: AppInfo = { ...base, version: "2.0.0" };
    const app = buildApp("calendar", [base, v2], created, noScreenshots, "https://site", {
      "1.0.0": 30,
      "2.0.0": 12,
    });
    expect(app.downloads).toBe(42);
    const byVersion = Object.fromEntries(app.releases.map((r) => [r.version, r.downloads]));
    expect(byVersion).toEqual({ "1.0.0": 30, "2.0.0": 12 });
  });

  it("counts a version with no recorded downloads as zero", () => {
    const app = buildApp("calendar", [base], created, noScreenshots, "https://site", {});
    expect(app.releases[0].downloads).toBe(0);
    expect(app.downloads).toBe(0);
  });

  it("uses the newest release for app-level display fields and sorts releases desc", () => {
    const v2: AppInfo = { ...base, version: "2.0.0", name: "Calendar v2", description: "newer" };
    const app = buildApp("calendar", [base, v2], created, noScreenshots, "https://site");
    expect(app.name).toBe("Calendar v2");
    expect(app.description).toBe("newer");
    expect(app.releases.map((r) => r.version)).toEqual(["2.0.0", "1.0.0"]);
  });
});

describe("appsForPlatformVersion", () => {
  const v10 = buildApp("calendar", [base], created, noScreenshots, "https://site"); // 10.0.0–10.99.99
  const onlyNewer = buildApp(
    "notes",
    [{ ...base, id: "notes", platformMin: "11.0.0", platformMax: "11.99.99" }],
    created,
    noScreenshots,
    "https://site",
  );

  it("includes apps whose release range covers the target version", () => {
    const apps = appsForPlatformVersion([v10, onlyNewer], "10.5.0");
    expect(apps.map((a) => a.id)).toEqual(["calendar"]);
  });

  it("includes only matching releases within an included app", () => {
    const multi = buildApp(
      "calendar",
      [base, { ...base, version: "2.0.0", platformMin: "11.0.0", platformMax: "11.99.99" }],
      created,
      noScreenshots,
      "https://site",
    );
    const [app] = appsForPlatformVersion([multi], "10.5.0");
    expect(app.releases.map((r) => r.version)).toEqual(["1.0.0"]);
  });

  // info.xml conventionally writes the oc10 ceiling as max-version="10", meaning
  // "all of 10.x". Taken literally that is 10.0.0 and the app would vanish from
  // every platform/10.15.x feed — the App Store inside a current server.
  const forMax = (platformMax: string, version: string): string[] => {
    const app = buildApp(
      "calendar",
      [{ ...base, platformMin: "10.0.0", platformMax }],
      created,
      noScreenshots,
      "https://site",
    );
    return appsForPlatformVersion([app], version).map((a) => a.id);
  };

  it("treats a bare major max-version as covering the whole line", () => {
    expect(forMax("10", "10.15.0")).toEqual(["calendar"]);
    expect(forMax("10", "10.16.3")).toEqual(["calendar"]);
    // ...but not the next major.
    expect(forMax("10", "11.0.0")).toEqual([]);
  });

  it("treats a major.minor max-version as covering that minor's patches", () => {
    expect(forMax("10.15", "10.15.3")).toEqual(["calendar"]);
    expect(forMax("10.15", "10.16.0")).toEqual([]);
  });

  it("keeps a full three-part max-version exact", () => {
    expect(forMax("10.15.0", "10.15.0")).toEqual(["calendar"]);
    expect(forMax("10.15.0", "10.15.1")).toEqual([]);
  });

  it("still honours the legacy sentinel and a bare next major", () => {
    expect(forMax("10.9999.9999", "10.16.3")).toEqual(["calendar"]);
    expect(forMax("11", "11.0.0")).toEqual(["calendar"]);
  });

  it("does not widen the lower bound", () => {
    // min-version="10.11" is a floor of 10.11.0, so 10.10.x stays excluded.
    const app = buildApp(
      "calendar",
      [{ ...base, platformMin: "10.11", platformMax: "10" }],
      created,
      noScreenshots,
      "https://site",
    );
    expect(appsForPlatformVersion([app], "10.10.0")).toEqual([]);
    expect(appsForPlatformVersion([app], "10.11.0").map((a) => a.id)).toEqual(["calendar"]);
  });
});
