import { describe, it, expect, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseNameStatus } from "../src/cli/check-changeset.js";
import { makeTarball } from "./helpers/make-tarball.js";

const exec = promisify(execFile);
const toolsDir = fileURLToPath(new URL("..", import.meta.url));
const cli = join(toolsDir, "src/cli/check-changeset.ts");
// Use the project-local tsx binary so the CLI runs without a network fetch
// (the temp repos have no node_modules of their own).
const tsx = join(toolsDir, "node_modules/.bin/tsx");

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

/** Run `git -C <repoDir> <args>` with gpg signing disabled for commits. */
function gitC(repoDir: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return exec("git", ["-C", repoDir, "-c", "commit.gpgsign=false", ...args]);
}

/** Create a fresh temp git repo (no signing, dummy identity). */
async function newRepo(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "changeset-"));
  cleanups.push(() => rm(repo, { recursive: true, force: true }));
  await gitC(repo, ["init", "-q", "-b", "master"]);
  await gitC(repo, ["config", "user.email", "t@example.com"]);
  await gitC(repo, ["config", "user.name", "Test"]);
  await gitC(repo, ["config", "commit.gpgsign", "false"]);
  return repo;
}

async function writeFileEnsuringDir(repo: string, rel: string, content: string): Promise<void> {
  const abs = join(repo, rel);
  await mkdir(join(abs, ".."), { recursive: true });
  await writeFile(abs, content);
}

/** Drive the real check-changeset CLI against the temp repo. */
function runCheck(repo: string, baseRef: string): Promise<{ stdout: string; stderr: string }> {
  return exec(tsx, [cli, baseRef], { cwd: repo });
}

function infoXml(version: string, minVersion: string): string {
  return `<?xml version="1.0"?><info><id>foo</id><name>Foo</name>
    <description>d</description><licence>AGPL</licence><author>me</author>
    <version>${version}</version><category>tools</category>
    <dependencies><owncloud min-version="${minVersion}" max-version="11.99.99"/></dependencies></info>`;
}

/** Write a real release package.tar.gz into the repo at the given version. */
async function addReleaseTarball(repo: string, version: string, minVersion: string): Promise<void> {
  const dir = join(repo, "apps", "foo", "releases", version);
  await mkdir(dir, { recursive: true });
  cleanups.push(
    await makeTarball(join(dir, "package.tar.gz"), {
      rootDir: "foo",
      infoXml: infoXml(version, minVersion),
    }),
  );
}

describe("check-changeset CLI (integration, real git repos)", () => {
  it("case 1: adding a brand-new release passes (exit 0, 'Changeset OK')", async () => {
    const repo = await newRepo();
    // base commit: an unrelated file
    await writeFileEnsuringDir(repo, "README.md", "base\n");
    await gitC(repo, ["add", "."]);
    await gitC(repo, ["commit", "-q", "-m", "base"]);
    const base = (await gitC(repo, ["rev-parse", "HEAD"])).stdout.trim();

    // branch: add a new release (a real package so the floor gate can read it)
    await gitC(repo, ["checkout", "-q", "-b", "feature"]);
    await addReleaseTarball(repo, "1.0.0", "11.0.0");
    await gitC(repo, ["add", "."]);
    await gitC(repo, ["commit", "-q", "-m", "add release"]);

    const { stdout } = await runCheck(repo, base);
    expect(stdout).toMatch(/Changeset OK/i);
  });

  it("case 2: modifying a file in a published release is rejected (immutable)", async () => {
    const repo = await newRepo();
    await writeFileEnsuringDir(repo, "apps/foo/releases/1.0.0/package.tar.gz", "pkg\n");
    await gitC(repo, ["add", "."]);
    await gitC(repo, ["commit", "-q", "-m", "publish 1.0.0"]);
    const base = (await gitC(repo, ["rev-parse", "HEAD"])).stdout.trim();

    await gitC(repo, ["checkout", "-q", "-b", "feature"]);
    await writeFileEnsuringDir(repo, "apps/foo/releases/1.0.0/package.tar.gz", "tampered\n");
    await gitC(repo, ["add", "."]);
    await gitC(repo, ["commit", "-q", "-m", "tamper"]);

    await expect(runCheck(repo, base)).rejects.toMatchObject({
      stderr: expect.stringMatching(/immutable/i),
    });
  });

  it("case 3 (regression): renaming a file OUT of a published release is rejected", async () => {
    const repo = await newRepo();
    await writeFileEnsuringDir(repo, "apps/foo/releases/1.0.0/package.tar.gz", "pkg\n");
    await gitC(repo, ["add", "."]);
    await gitC(repo, ["commit", "-q", "-m", "publish 1.0.0"]);
    const base = (await gitC(repo, ["rev-parse", "HEAD"])).stdout.trim();

    await gitC(repo, ["checkout", "-q", "-b", "feature"]);
    await gitC(repo, [
      "mv",
      "apps/foo/releases/1.0.0/package.tar.gz",
      "apps/foo/somewhere-else.gz",
    ]);
    await gitC(repo, ["commit", "-q", "-m", "rename out of release"]);

    await expect(runCheck(repo, base)).rejects.toMatchObject({
      stderr: expect.stringMatching(/immutable/i),
    });
  });

  it("case 4: re-adding a release that already exists on base is rejected (collision)", async () => {
    const repo = await newRepo();
    await writeFileEnsuringDir(repo, "apps/foo/releases/1.0.0/package.tar.gz", "pkg\n");
    await gitC(repo, ["add", "."]);
    await gitC(repo, ["commit", "-q", "-m", "publish 1.0.0"]);
    const base = (await gitC(repo, ["rev-parse", "HEAD"])).stdout.trim();

    // Branch: delete then re-add the same release dir with a new file, so the
    // diff against base shows an Added path inside an already-published dir.
    await gitC(repo, ["checkout", "-q", "-b", "feature"]);
    await gitC(repo, ["rm", "-q", "apps/foo/releases/1.0.0/package.tar.gz"]);
    await gitC(repo, ["commit", "-q", "-m", "remove"]);
    await writeFileEnsuringDir(repo, "apps/foo/releases/1.0.0/extra.txt", "new\n");
    await gitC(repo, ["add", "."]);
    await gitC(repo, ["commit", "-q", "-m", "re-add into published dir"]);

    await expect(runCheck(repo, base)).rejects.toMatchObject({
      stderr: expect.stringMatching(/collision|already|exists|immutable/i),
    });
  });

  it("case 5: a newly-added release below the platform floor is rejected", async () => {
    const repo = await newRepo();
    await writeFileEnsuringDir(repo, "README.md", "base\n");
    await gitC(repo, ["add", "."]);
    await gitC(repo, ["commit", "-q", "-m", "base"]);
    const base = (await gitC(repo, ["rev-parse", "HEAD"])).stdout.trim();

    await gitC(repo, ["checkout", "-q", "-b", "feature"]);
    await addReleaseTarball(repo, "1.0.0", "10.0.0");
    await gitC(repo, ["add", "."]);
    await gitC(repo, ["commit", "-q", "-m", "add sub-11 release"]);

    await expect(runCheck(repo, base)).rejects.toMatchObject({
      stderr: expect.stringMatching(/min-version.*11/i),
    });
  });

  it("case 6: a newly-added release at the platform floor passes", async () => {
    const repo = await newRepo();
    await writeFileEnsuringDir(repo, "README.md", "base\n");
    await gitC(repo, ["add", "."]);
    await gitC(repo, ["commit", "-q", "-m", "base"]);
    const base = (await gitC(repo, ["rev-parse", "HEAD"])).stdout.trim();

    await gitC(repo, ["checkout", "-q", "-b", "feature"]);
    await addReleaseTarball(repo, "1.0.1", "11.0.0");
    await gitC(repo, ["add", "."]);
    await gitC(repo, ["commit", "-q", "-m", "add 11 release"]);

    const { stdout } = await runCheck(repo, base);
    expect(stdout).toMatch(/Changeset OK/i);
  });
});

describe("parseNameStatus (rename-aware diff parsing)", () => {
  it("splits a rename line into D(old) + A(new)", () => {
    const out =
      "R100\tapps/foo/releases/1.0.0/package.tar.gz\tapps/foo/renamed.gz\n" +
      "A\tapps/bar/releases/2.0.0/package.tar.gz\n";
    expect(parseNameStatus(out)).toEqual([
      { path: "apps/foo/releases/1.0.0/package.tar.gz", status: "D" },
      { path: "apps/foo/renamed.gz", status: "A" },
      { path: "apps/bar/releases/2.0.0/package.tar.gz", status: "A" },
    ]);
  });

  it("splits a copy line into D(old) + A(new) too", () => {
    const out = "C075\tapps/foo/releases/1.0.0/a.gz\tapps/foo/releases/1.0.0/b.gz\n";
    expect(parseNameStatus(out)).toEqual([
      { path: "apps/foo/releases/1.0.0/a.gz", status: "D" },
      { path: "apps/foo/releases/1.0.0/b.gz", status: "A" },
    ]);
  });

  it("passes plain A/M/D lines through unchanged", () => {
    const out = "M\tapps/foo/releases/1.0.0/x\nD\tapps/foo/releases/1.0.0/y\n";
    expect(parseNameStatus(out)).toEqual([
      { path: "apps/foo/releases/1.0.0/x", status: "M" },
      { path: "apps/foo/releases/1.0.0/y", status: "D" },
    ]);
  });
});
