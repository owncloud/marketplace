import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type Server } from "node:http";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const toolsDir = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

let out: string;
let server: Server;
let port: number;

beforeAll(async () => {
  out = await mkdtemp(join(tmpdir(), "site-"));
  await exec(
    "npx",
    ["tsx", "src/cli/generate-api.ts", "--apps", join(repoRoot, "apps"), "--out", out],
    { cwd: toolsDir },
  );
  server = createServer(async (req, res) => {
    const rel = normalize(decodeURIComponent((req.url ?? "/").split("?")[0])).replace(
      /^(\.\.[/\\])+/,
      "",
    );
    const filePath = join(out, rel);
    try {
      if ((await stat(filePath)).isFile()) {
        createReadStream(filePath).pipe(res);
        return;
      }
    } catch {
      /* fall through to 404 */
    }
    res.statusCode = 404;
    res.end("not found");
  });
  await new Promise<void>((r) => server.listen(0, r));
  port = (server.address() as { port: number }).port;
}, 60_000);

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  if (out) await rm(out, { recursive: true, force: true });
});

describe("static API is servable", () => {
  it("serves apps.json containing a published app", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/apps.json`);
    expect(res.status).toBe(200);
    const apps = (await res.json()) as { id: string }[];
    expect(apps.find((a) => a.id === "migrate_to_ocis")).toBeTruthy();
  });

  it("serves the per-version apps.json for 11.0.0", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/platform/11.0.0/apps.json`);
    expect(res.status).toBe(200);
    const apps = (await res.json()) as { id: string }[];
    expect(apps.find((a) => a.id === "migrate_to_ocis")).toBeTruthy();
  });

  it("serves a per-version apps.json for the classic 10.16.3 line", async () => {
    // migrate_to_ocis 2.0.0 declares owncloud 10.15–11, so it is served to a
    // classic Server asking for the apps compatible with its running version.
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/platform/10.16.3/apps.json`);
    expect(res.status).toBe(200);
    const apps = (await res.json()) as { id: string; releases: { version: string }[] }[];
    const app = apps.find((a) => a.id === "migrate_to_ocis");
    expect(app).toBeTruthy();
    expect(app?.releases.map((r) => r.version)).toContain("2.0.0");
  });

  // owncloud/core#41773: 10.16.4 shipped and the feed 404'd, so `occ market:list`
  // failed with "No marketplace connection". The Market app has no fallback, so
  // every patch of a supported line must resolve — including ones core has not
  // tagged yet, since a patch release lands without a marketplace change.
  it("serves a per-version apps.json for every 10.16.x patch, not just released ones", async () => {
    for (const version of ["10.16.4", "10.16.5", "10.16.9"]) {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/platform/${version}/apps.json`);
      expect(res.status, `platform/${version}/apps.json`).toBe(200);
      const apps = (await res.json()) as { id: string }[];
      expect(apps.find((a) => a.id === "migrate_to_ocis")).toBeTruthy();
    }
  });

  it("serves categories.json", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/categories.json`);
    expect(res.status).toBe(200);
  });
});
