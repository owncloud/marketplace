import { describe, it, expect, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeTarball } from "./helpers/make-tarball.js";

// A tiny valid 1x1 PNG, standing in for an already-ingested screenshot file.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const exec = promisify(execFile);
const toolsDir = fileURLToPath(new URL("..", import.meta.url));
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

function infoXml(id: string, version: string): string {
  return `<?xml version="1.0"?><info><id>${id}</id><name>App</name>
    <description>d</description><licence>AGPL</licence><author>me</author>
    <version>${version}</version><category>tools</category>
    <dependencies><owncloud min-version="10.0.0" max-version="10.99.99"/></dependencies></info>`;
}

async function fixtureRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cli-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const relDir = join(root, "apps", "calendar", "releases", "1.0.0");
  await mkdir(relDir, { recursive: true });
  cleanups.push(
    await makeTarball(join(relDir, "package.tar.gz"), {
      rootDir: "calendar",
      infoXml: infoXml("calendar", "1.0.0"),
    }),
  );
  return root;
}

describe("CLI", () => {
  it("validate exits 0 on a valid tree", async () => {
    const root = await fixtureRepo();
    const { stdout } = await exec("npx", ["tsx", "src/cli/validate.ts", join(root, "apps")], {
      cwd: toolsDir,
    });
    expect(stdout).toMatch(/1 release.*valid|OK/i);
  });

  it("validate exits non-zero with a clear message on id mismatch", async () => {
    const root = await mkdtemp(join(tmpdir(), "cli-bad-"));
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    const relDir = join(root, "apps", "calendar", "releases", "1.0.0");
    await mkdir(relDir, { recursive: true });
    cleanups.push(
      await makeTarball(join(relDir, "package.tar.gz"), {
        rootDir: "wrong",
        infoXml: infoXml("wrong", "1.0.0"),
      }),
    );
    await expect(
      exec("npx", ["tsx", "src/cli/validate.ts", join(root, "apps")], { cwd: toolsDir }),
    ).rejects.toMatchObject({ stderr: expect.stringMatching(/id mismatch/i) });
  });

  it("generate-api writes apps.json under the out dir", async () => {
    const root = await fixtureRepo();
    const out = join(root, "_site");
    await exec(
      "npx",
      ["tsx", "src/cli/generate-api.ts", "--apps", join(root, "apps"), "--out", out],
      { cwd: toolsDir },
    );
    const apps = JSON.parse(await readFile(join(out, "api/v1/apps.json"), "utf8"));
    expect(apps[0].id).toBe("calendar");
    expect(apps[0].rating).toEqual({ "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, mean: 0 });
  });

  it("generate-api does not copy the package tarball (served as a GitHub Release asset)", async () => {
    const root = await fixtureRepo();
    const out = join(root, "_site");
    await exec(
      "npx",
      ["tsx", "src/cli/generate-api.ts", "--apps", join(root, "apps"), "--out", out],
      { cwd: toolsDir, env: { ...process.env, GITHUB_REPOSITORY: "owner/repo" } },
    );

    // The tarball is distributed as a Release asset, not copied into _site.
    await expect(
      access(join(out, "apps", "calendar", "releases", "1.0.0", "package.tar.gz")),
    ).rejects.toMatchObject({ code: "ENOENT" });

    // The advertised download URL points at the Release asset on github.com.
    const apps = JSON.parse(await readFile(join(out, "api/v1/apps.json"), "utf8"));
    expect(apps[0].releases[0].download).toBe(
      "https://github.com/owner/repo/releases/download/calendar/calendar-1.0.0.tar.gz",
    );
  });

  it("generate-api rewrites ingested screenshots to same-origin URLs and copies the files", async () => {
    // Ingested screenshots live next to the package in the (immutable) release
    // dir; build a temp tree with one so the published apps/ stays untouched.
    const root = await fixtureRepo();
    const shotsDir = join(root, "apps", "calendar", "releases", "1.0.0", "screenshots");
    await mkdir(shotsDir, { recursive: true });
    await writeFile(join(shotsDir, "01.png"), PNG);

    const out = join(root, "_site");
    await exec(
      "npx",
      ["tsx", "src/cli/generate-api.ts", "--apps", join(root, "apps"), "--out", out],
      { cwd: toolsDir, env: { ...process.env, MARKETPLACE_BASE_URL: "https://site" } },
    );

    const apps = JSON.parse(await readFile(join(out, "api/v1/apps.json"), "utf8"));
    expect(apps[0].screenshots).toEqual([
      { url: "https://site/apps/calendar/releases/1.0.0/screenshots/01.png" },
    ]);
    const copied = await readFile(
      join(out, "apps", "calendar", "releases", "1.0.0", "screenshots", "01.png"),
    );
    expect(copied.equals(PNG)).toBe(true);
  });
});
