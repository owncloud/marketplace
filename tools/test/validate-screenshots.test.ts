import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type Server } from "node:https";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateAddedScreenshots } from "../src/cli/validate-screenshots.js";
import { makeTarball } from "./helpers/make-tarball.js";
import { TEST_TLS_CERT, TEST_TLS_KEY } from "./helpers/tls-cert.js";

const exec = promisify(execFile);

// 1x1 PNG served as the "good" screenshot.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

// info.xml requires https:// screenshot URLs, so the test server is HTTPS with a
// self-signed cert; TLS verification is disabled for this worker's lifetime.
let server: Server;
let port: number;
let prevTlsReject: string | undefined;
beforeAll(async () => {
  prevTlsReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  server = createServer({ key: TEST_TLS_KEY, cert: TEST_TLS_CERT }, (req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (path === "/good.png") {
      res.end(PNG);
    } else if (path === "/bad.png") {
      res.end(Buffer.from("this is definitely not an image"));
    } else {
      res.statusCode = 404;
      res.end("nope");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as { port: number }).port;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (prevTlsReject === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTlsReject;
});

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

function gitC(repoDir: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return exec("git", ["-C", repoDir, "-c", "commit.gpgsign=false", ...args]);
}

async function newRepo(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "screenshots-"));
  cleanups.push(() => rm(repo, { recursive: true, force: true }));
  await gitC(repo, ["init", "-q", "-b", "master"]);
  await gitC(repo, ["config", "user.email", "t@example.com"]);
  await gitC(repo, ["config", "user.name", "Test"]);
  await gitC(repo, ["config", "commit.gpgsign", "false"]);
  return repo;
}

function infoXml(version: string, screenshot: string): string {
  return `<?xml version="1.0"?><info><id>foo</id><name>Foo</name>
    <description>d</description><licence>AGPL</licence><author>me</author>
    <version>${version}</version><category>tools</category>
    <screenshot>${screenshot}</screenshot>
    <dependencies><owncloud min-version="11.0.0" max-version="11.99.99"/></dependencies></info>`;
}

async function addReleaseTarball(repo: string, version: string, screenshot: string): Promise<void> {
  const dir = join(repo, "apps", "foo", "releases", version);
  await mkdir(dir, { recursive: true });
  cleanups.push(
    await makeTarball(join(dir, "package.tar.gz"), {
      rootDir: "foo",
      infoXml: infoXml(version, screenshot),
    }),
  );
}

describe("validateAddedScreenshots", () => {
  const url = (p: string) => `https://127.0.0.1:${port}${p}`;

  it("passes when a newly-added release has a valid screenshot", async () => {
    const repo = await newRepo();
    await writeFile(join(repo, "README.md"), "base\n");
    await gitC(repo, ["add", "."]);
    await gitC(repo, ["commit", "-q", "-m", "base"]);
    const base = (await gitC(repo, ["rev-parse", "HEAD"])).stdout.trim();

    await gitC(repo, ["checkout", "-q", "-b", "feature"]);
    await addReleaseTarball(repo, "1.0.0", url("/good.png"));
    await gitC(repo, ["add", "."]);
    await gitC(repo, ["commit", "-q", "-m", "add release"]);

    await expect(validateAddedScreenshots(base, repo)).resolves.toBe(1);
  });

  it("rejects a newly-added release whose screenshot is not an image", async () => {
    const repo = await newRepo();
    await writeFile(join(repo, "README.md"), "base\n");
    await gitC(repo, ["add", "."]);
    await gitC(repo, ["commit", "-q", "-m", "base"]);
    const base = (await gitC(repo, ["rev-parse", "HEAD"])).stdout.trim();

    await gitC(repo, ["checkout", "-q", "-b", "feature"]);
    await addReleaseTarball(repo, "1.0.0", url("/bad.png"));
    await gitC(repo, ["add", "."]);
    await gitC(repo, ["commit", "-q", "-m", "add release"]);

    await expect(validateAddedScreenshots(base, repo)).rejects.toThrow(/image/i);
  });

  it("validates committed local screenshots in place without fetching info.xml URLs", async () => {
    const repo = await newRepo();
    await writeFile(join(repo, "README.md"), "base\n");
    await gitC(repo, ["add", "."]);
    await gitC(repo, ["commit", "-q", "-m", "base"]);
    const base = (await gitC(repo, ["rev-parse", "HEAD"])).stdout.trim();

    await gitC(repo, ["checkout", "-q", "-b", "feature"]);
    // info.xml points at a dead URL — committed local screenshots must be
    // validated instead of (and without) fetching it.
    await addReleaseTarball(repo, "1.0.0", url("/dead.png"));
    const shotsDir = join(repo, "apps", "foo", "releases", "1.0.0", "screenshots");
    await mkdir(shotsDir, { recursive: true });
    await writeFile(join(shotsDir, "01.png"), PNG);
    await gitC(repo, ["add", "."]);
    await gitC(repo, ["commit", "-q", "-m", "add release with local screenshots"]);

    await expect(validateAddedScreenshots(base, repo)).resolves.toBe(1);
  });

  it("rejects a committed local screenshot that is not a valid image", async () => {
    const repo = await newRepo();
    await writeFile(join(repo, "README.md"), "base\n");
    await gitC(repo, ["add", "."]);
    await gitC(repo, ["commit", "-q", "-m", "base"]);
    const base = (await gitC(repo, ["rev-parse", "HEAD"])).stdout.trim();

    await gitC(repo, ["checkout", "-q", "-b", "feature"]);
    await addReleaseTarball(repo, "1.0.0", url("/good.png"));
    const shotsDir = join(repo, "apps", "foo", "releases", "1.0.0", "screenshots");
    await mkdir(shotsDir, { recursive: true });
    await writeFile(join(shotsDir, "01.png"), Buffer.from("not an image"));
    await gitC(repo, ["add", "."]);
    await gitC(repo, ["commit", "-q", "-m", "add release with bad local screenshot"]);

    await expect(validateAddedScreenshots(base, repo)).rejects.toThrow(/image/i);
  });

  it("does not fetch screenshots of already-published (unchanged) releases", async () => {
    const repo = await newRepo();
    // Publish 1.0.0 whose screenshot URL is a dead path — it must never be fetched.
    await addReleaseTarball(repo, "1.0.0", url("/dead.png"));
    await gitC(repo, ["add", "."]);
    await gitC(repo, ["commit", "-q", "-m", "publish 1.0.0"]);
    const base = (await gitC(repo, ["rev-parse", "HEAD"])).stdout.trim();

    // Add an unrelated, non-release file in the branch.
    await gitC(repo, ["checkout", "-q", "-b", "feature"]);
    await writeFile(join(repo, "NOTES.md"), "notes\n");
    await gitC(repo, ["add", "."]);
    await gitC(repo, ["commit", "-q", "-m", "notes"]);

    // No new releases added → nothing fetched → passes despite the dead URL.
    await expect(validateAddedScreenshots(base, repo)).resolves.toBe(0);
  });
});
