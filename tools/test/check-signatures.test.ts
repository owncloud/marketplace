import { describe, it, expect, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeTarball } from "./helpers/make-tarball.js";

const exec = promisify(execFile);
const toolsDir = fileURLToPath(new URL("..", import.meta.url));
const cli = join(toolsDir, "src/cli/check-signatures.ts");
const tsx = join(toolsDir, "node_modules/.bin/tsx");

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

function gitC(repoDir: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return exec("git", ["-C", repoDir, "-c", "commit.gpgsign=false", ...args]);
}

async function newRepo(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "checksig-"));
  cleanups.push(() => rm(repo, { recursive: true, force: true }));
  await gitC(repo, ["init", "-q", "-b", "master"]);
  await gitC(repo, ["config", "user.email", "t@example.com"]);
  await gitC(repo, ["config", "user.name", "Test"]);
  await gitC(repo, ["config", "commit.gpgsign", "false"]);
  return repo;
}

async function addReleaseTarball(repo: string, version: string): Promise<void> {
  const dir = join(repo, "apps", "foo", "releases", version);
  await mkdir(dir, { recursive: true });
  cleanups.push(
    await makeTarball(join(dir, "package.tar.gz"), {
      rootDir: "foo",
      infoXml: "<info><id>foo</id></info>",
      // No appinfo/signature.json — an unsigned package.
    }),
  );
}

/** Drive the real CLI against a temp repo; repoRoot="." since git paths are repo-relative there. */
function runCheck(repo: string, baseRef: string): Promise<{ stdout: string; stderr: string }> {
  return exec(tsx, [cli, baseRef, "."], { cwd: repo });
}

describe("check-signatures CLI (grandfathering)", () => {
  it("is a no-op when no release package is newly added", async () => {
    const repo = await newRepo();
    // Base commit already contains the release; HEAD adds only an unrelated file.
    await addReleaseTarball(repo, "1.0.0");
    await gitC(repo, ["add", "."]);
    await gitC(repo, ["commit", "-qm", "base with existing release"]);
    const base = (await gitC(repo, ["rev-parse", "HEAD"])).stdout.trim();
    await mkdir(join(repo, "docs"), { recursive: true });
    await writeFile(join(repo, "docs/x.md"), "hi");
    await gitC(repo, ["add", "."]);
    await gitC(repo, ["commit", "-qm", "unrelated change"]);

    const { stdout } = await runCheck(repo, base);
    expect(stdout).toMatch(/no newly-added app releases/i);
  });

  it("rejects a newly-added unsigned release (exit 1, Gate 1)", async () => {
    const repo = await newRepo();
    await gitC(repo, ["commit", "-qm", "empty", "--allow-empty"]);
    const base = (await gitC(repo, ["rev-parse", "HEAD"])).stdout.trim();
    await addReleaseTarball(repo, "1.0.0"); // unsigned
    await gitC(repo, ["add", "."]);
    await gitC(repo, ["commit", "-qm", "add unsigned release"]);

    await expect(runCheck(repo, base)).rejects.toMatchObject({ code: 1 });
    // And the message is publisher-facing.
    const err = await runCheck(repo, base).catch((e: { stderr: string }) => e.stderr);
    expect(err).toMatch(/Validation failed:.*not signed/is);
  });
});
