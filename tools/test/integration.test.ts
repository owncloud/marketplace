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
  it("serves apps.json containing the example app", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/apps.json`);
    expect(res.status).toBe(200);
    const apps = (await res.json()) as { id: string }[];
    expect(apps.find((a) => a.id === "example-app")).toBeTruthy();
  });

  it("serves the per-version apps.json for 11.0.0", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/platform/11.0.0/apps.json`);
    expect(res.status).toBe(200);
    const apps = (await res.json()) as { id: string }[];
    expect(apps.find((a) => a.id === "example-app")).toBeTruthy();
  });

  it("serves a per-version apps.json for the classic 10.16.3 line", async () => {
    // example-app 1.0.0 declares owncloud 10.0.0–10.99.99, so it is served to
    // a classic Server asking for the apps compatible with its running version.
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/platform/10.16.3/apps.json`);
    expect(res.status).toBe(200);
    const apps = (await res.json()) as { id: string; releases: { version: string }[] }[];
    const app = apps.find((a) => a.id === "example-app");
    expect(app).toBeTruthy();
    expect(app?.releases.map((r) => r.version)).toContain("1.0.0");
  });

  it("serves categories.json", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/categories.json`);
    expect(res.status).toBe(200);
  });
});
