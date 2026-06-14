import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeDownloads, readRawDownloads } from "../src/downloads-generate.js";
import type { RawDownloads } from "../src/downloads-types.js";

let out: string;
afterEach(async () => {
  if (out) await rm(out, { recursive: true, force: true });
});

const raw: RawDownloads = {
  generated_at: "2026-06-14T00:00:00Z",
  ocis: [
    {
      tag_name: "v7.1.0",
      name: "ocis 7.1.0",
      published_at: "2026-02-01T00:00:00Z",
      html_url: "https://github.com/owncloud/ocis/releases/tag/v7.1.0",
      body: "notes",
      assets: [
        {
          name: "ocis-7.1.0-linux-amd64",
          browser_download_url: "https://example.com/ocis-7.1.0-linux-amd64",
          size: 2 * 1024 * 1024,
        },
      ],
    },
  ],
  server: [
    {
      tag_name: "v10.16.3",
      name: "ownCloud 10.16.3",
      published_at: "2026-05-22T14:24:17.000Z",
      html_url: "https://github.com/owncloud/core/releases/tag/v10.16.3",
      body: "",
      assets: [
        {
          name: "owncloud-10.16.3.tar.bz2",
          browser_download_url:
            "https://download.owncloud.com/server/stable/owncloud-10.16.3.tar.bz2",
          size: 58 * 1024 * 1024,
        },
        {
          name: "owncloud-10.16.3.zip",
          browser_download_url:
            "https://download.owncloud.com/server/stable/owncloud-10.16.3.zip",
          size: 72 * 1024 * 1024,
        },
      ],
    },
  ],
  client: [],
  android: [],
  ios: [],
};

describe("writeDownloads", () => {
  it("writes the normalized downloads.json under api/v1", async () => {
    out = await mkdtemp(join(tmpdir(), "dl-"));
    await writeDownloads(out, raw);

    const written = JSON.parse(await readFile(join(out, "api/v1/downloads.json"), "utf8"));
    expect(written.generatedAt).toBe("2026-06-14T00:00:00Z");
    expect(written.ocis.version).toBe("7.1.0");
    expect(written.ocis.binaries[0]).toEqual({
      os: "Linux",
      arch: "amd64",
      size: "2.0 MB",
      url: "https://example.com/ocis-7.1.0-linux-amd64",
    });
    expect(written.client).toBeNull();
  });

  it("normalizes the classic server into format-labelled archive rows", async () => {
    out = await mkdtemp(join(tmpdir(), "dl-"));
    await writeDownloads(out, raw);

    const written = JSON.parse(await readFile(join(out, "api/v1/downloads.json"), "utf8"));
    expect(written.server.version).toBe("10.16.3");
    expect(written.server.releaseUrl).toBe(
      "https://github.com/owncloud/core/releases/tag/v10.16.3",
    );
    expect(written.server.binaries).toEqual([
      {
        os: "Server archive",
        arch: "tar.bz2",
        size: "58.0 MB",
        url: "https://download.owncloud.com/server/stable/owncloud-10.16.3.tar.bz2",
      },
      {
        os: "Server archive",
        arch: "zip",
        size: "72.0 MB",
        url: "https://download.owncloud.com/server/stable/owncloud-10.16.3.zip",
      },
    ]);
  });

  it("leaves server null when raw.server is absent (backward compat)", async () => {
    out = await mkdtemp(join(tmpdir(), "dl-"));
    const { server, ...withoutServer } = raw;
    void server;
    await writeDownloads(out, withoutServer);

    const written = JSON.parse(await readFile(join(out, "api/v1/downloads.json"), "utf8"));
    expect(written.server).toBeNull();
  });

  it("is deterministic: re-running yields byte-identical output", async () => {
    out = await mkdtemp(join(tmpdir(), "dl-"));
    await writeDownloads(out, raw);
    const first = await readFile(join(out, "api/v1/downloads.json"), "utf8");
    await writeDownloads(out, raw);
    const second = await readFile(join(out, "api/v1/downloads.json"), "utf8");
    expect(second).toBe(first);
  });
});

describe("readRawDownloads", () => {
  it("reads and parses an existing raw downloads file", async () => {
    out = await mkdtemp(join(tmpdir(), "dl-"));
    const path = join(out, "downloads.json");
    await writeFile(path, JSON.stringify(raw), "utf8");
    expect(await readRawDownloads(path)).toEqual(raw);
  });

  it("returns null when the file does not exist", async () => {
    out = await mkdtemp(join(tmpdir(), "dl-"));
    expect(await readRawDownloads(join(out, "missing.json"))).toBeNull();
  });
});
