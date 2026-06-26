import { describe, it, expect, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  formatSize,
  matchBinaries,
  releaseDownloads,
  normalizeFullRelease,
  buildSurface,
  normalizeDownloads,
  mergeAppCounts,
  readDownloadsBaseline,
} from "../src/downloads-generate.js";
import type { RawAsset, RawRelease, RawDownloads } from "../src/downloads-types.js";

// Default size is 2 MiB so matched rows render as "2.0 MB" deterministically.
const asset = (name: string, size = 2 * 1024 * 1024, download_count = 0): RawAsset => ({
  name,
  browser_download_url: `https://example.com/${name}`,
  size,
  download_count,
});

// A minimal raw release; tag drives version, the rest is fixed for assertions.
const release = (
  tag: string,
  assets: RawAsset[] = [asset(`ocis-${tag}-linux-amd64`)],
): RawRelease => ({
  tag_name: tag,
  name: `ocis ${tag}`,
  published_at: "2026-01-02T03:04:05Z",
  html_url: `https://github.com/owncloud/ocis/releases/tag/${tag}`,
  assets,
});

describe("formatSize", () => {
  it("formats >= 1 MB with one decimal", () => {
    expect(formatSize(42_100_000)).toBe("40.1 MB");
  });
  it("formats < 1 MB as rounded KB", () => {
    expect(formatSize(2048)).toBe("2 KB");
  });
});

describe("matchBinaries", () => {
  it("matches Linux/macOS/Windows amd64+arm64 and labels them", () => {
    const assets = [
      asset("ocis-7.1.0-linux-amd64"),
      asset("ocis-7.1.0-linux-arm64"),
      asset("ocis-7.1.0-darwin-amd64"),
      asset("ocis-7.1.0-darwin-arm64"),
      asset("ocis-7.1.0-windows-amd64.exe"),
    ];
    const rows = matchBinaries(assets);
    expect(rows.map((r) => `${r.os}/${r.arch}`)).toEqual([
      "Linux/amd64",
      "Linux/arm64",
      "macOS/amd64",
      "macOS/arm64",
      "Windows/amd64",
    ]);
    expect(rows[0].url).toBe("https://example.com/ocis-7.1.0-linux-amd64");
    expect(rows[0].size).toBe("2.0 MB");
  });

  it("excludes checksum, pdf and tarball assets", () => {
    const assets = [
      asset("ocis-7.1.0-linux-amd64.sha256"),
      asset("ocis-7.1.0-linux-amd64.pdf"),
      asset("ocis-7.1.0-linux-amd64.tar.gz"),
    ];
    expect(matchBinaries(assets)).toEqual([]);
  });

  it("returns [] when no assets match the matrix", () => {
    expect(matchBinaries([asset("README.md"), asset("source.zip")])).toEqual([]);
  });
});

describe("releaseDownloads", () => {
  it("sums every asset's download count, including non-binary assets", () => {
    const r = release("v7.1.0", [
      asset("ocis-7.1.0-linux-amd64", 2 * 1024 * 1024, 30),
      asset("ocis-7.1.0-linux-amd64.sha256", 1024, 12),
    ]);
    expect(releaseDownloads(r)).toBe(42);
  });

  it("is 0 when no assets carry a count", () => {
    expect(releaseDownloads(release("v7.1.0"))).toBe(0);
  });
});

describe("normalizeFullRelease", () => {
  it("maps a raw release to a history entry, stripping the leading v and totalling downloads", () => {
    const entry = normalizeFullRelease(
      release("v7.1.0", [asset("ocis-7.1.0-linux-amd64", 2 * 1024 * 1024, 9)]),
      matchBinaries,
    );
    expect(entry).toEqual({
      version: "7.1.0",
      releaseUrl: "https://github.com/owncloud/ocis/releases/tag/v7.1.0",
      publishedAt: "2026-01-02T03:04:05Z",
      downloads: 9,
      binaries: [
        {
          os: "Linux",
          arch: "amd64",
          size: "2.0 MB",
          url: "https://example.com/ocis-7.1.0-linux-amd64",
        },
      ],
    });
  });

  it("keeps a version that has no leading v", () => {
    expect(normalizeFullRelease(release("7.1.0"), matchBinaries).version).toBe("7.1.0");
  });
});

describe("buildSurface", () => {
  it("returns null for an empty release list", () => {
    expect(buildSurface([])).toBeNull();
  });

  it("orders history newest-first and promotes the newest to the headline", () => {
    const surface = buildSurface([
      { ...release("v7.0.0"), published_at: "2026-01-01T00:00:00Z" },
      { ...release("v7.1.0"), published_at: "2026-02-01T00:00:00Z" },
    ])!;
    expect(surface.version).toBe("7.1.0");
    expect(surface.releases.map((r) => r.version)).toEqual(["7.1.0", "7.0.0"]);
    expect(surface.binaries).toEqual(surface.releases[0].binaries);
  });

  it("totals downloads across every release", () => {
    const surface = buildSurface([
      { ...release("v7.0.0", [asset("ocis-7.0.0-linux-amd64", 2 * 1024 * 1024, 10)]) },
      { ...release("v7.1.0", [asset("ocis-7.1.0-linux-amd64", 2 * 1024 * 1024, 32)]) },
    ])!;
    expect(surface.downloads).toBe(42);
  });
});

describe("normalizeDownloads", () => {
  const raw: RawDownloads = {
    generated_at: "2026-06-14T00:00:00Z",
    ocis: [
      {
        ...release("v7.0.0", [asset("ocis-7.0.0-linux-amd64", 2 * 1024 * 1024, 5)]),
        published_at: "2026-01-01T00:00:00Z",
      },
      {
        ...release("v7.1.0", [asset("ocis-7.1.0-linux-amd64", 2 * 1024 * 1024, 7)]),
        published_at: "2026-02-01T00:00:00Z",
      },
    ],
    client: [release("v5.0.0")],
    android: [],
    ios: [],
  };

  it("keeps the full history per surface, newest-first, with its all-time total", () => {
    const out = normalizeDownloads(raw);
    expect(out.ocis?.version).toBe("7.1.0");
    expect(out.ocis?.releases.length).toBe(2);
    expect(out.ocis?.downloads).toBe(12);
    expect(out.client?.version).toBe("5.0.0");
    expect(out.generatedAt).toBe("2026-06-14T00:00:00Z");
  });

  it("yields null for a surface with no releases", () => {
    const out = normalizeDownloads(raw);
    expect(out.android).toBeNull();
    expect(out.ios).toBeNull();
    expect(out.server).toBeNull();
  });

  it("keeps all classic server releases, resolving them via the archive matcher", () => {
    const out = normalizeDownloads({
      ...raw,
      server: [
        {
          ...release("v10.16.3", [asset("owncloud-10.16.3.tar.bz2")]),
          published_at: "2026-03-01T00:00:00Z",
        },
        {
          ...release("v10.15.5", [asset("owncloud-10.15.5.tar.bz2")]),
          published_at: "2026-02-01T00:00:00Z",
        },
      ],
    });
    expect(out.server?.releases.map((r) => r.version)).toEqual(["10.16.3", "10.15.5"]);
    // Classic archives lead with the format (in `os`) and leave `arch` empty.
    expect(out.server?.releases[0].binaries[0].os).toBe("tar.bz2");
    expect(out.server?.releases[0].binaries[0].arch).toBe("");
  });
});

describe("mergeAppCounts", () => {
  it("sums counts when a version is present in both maps", () => {
    const merged = mergeAppCounts({ music: { "2.5.2": 5 } }, { music: { "2.5.2": 102780 } });
    expect(merged.music["2.5.2"]).toBe(102785);
  });

  it("keeps versions present only in live or only in baseline", () => {
    const merged = mergeAppCounts({ onlyoffice: { "9.12.1": 3 } }, { music: { "2.5.2": 100 } });
    expect(merged).toEqual({ onlyoffice: { "9.12.1": 3 }, music: { "2.5.2": 100 } });
  });

  it("does not mutate its inputs", () => {
    const live = { music: { "2.5.2": 5 } };
    const baseline = { music: { "2.5.2": 100 } };
    mergeAppCounts(live, baseline);
    expect(live).toEqual({ music: { "2.5.2": 5 } });
    expect(baseline).toEqual({ music: { "2.5.2": 100 } });
  });

  it("handles empty maps", () => {
    expect(mergeAppCounts({}, {})).toEqual({});
  });
});

describe("readDownloadsBaseline", () => {
  it("parses a committed baseline file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "baseline-"));
    const path = join(dir, "downloads-baseline.json");
    await writeFile(path, JSON.stringify({ apps: { music: { "2.5.2": 102780 } } }));
    try {
      const baseline = await readDownloadsBaseline(path);
      expect(baseline?.apps?.music["2.5.2"]).toBe(102780);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns null when the file is absent", async () => {
    expect(await readDownloadsBaseline(join(tmpdir(), "no-such-baseline.json"))).toBeNull();
  });

  it("warns when an explicitly-requested file is missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const missing = join(tmpdir(), "no-such-baseline.json");
      expect(await readDownloadsBaseline(missing, true)).toBeNull();
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0][0]).toContain(missing);
    } finally {
      warn.mockRestore();
    }
  });

  it("does not warn when a defaulted file is absent", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await readDownloadsBaseline(join(tmpdir(), "no-such-baseline.json"));
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
