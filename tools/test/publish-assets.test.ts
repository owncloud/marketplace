import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { publishAssets, publishExtensionAssets, type Runner } from "../src/cli/publish-assets.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

/** A fixture apps dir with one release per (appId, version) listed. */
async function fixtureApps(releases: Array<[string, string]>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "publish-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  for (const [appId, version] of releases) {
    const dir = join(root, appId, "releases", version);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "package.tar.gz"), `tarball ${appId} ${version}`);
  }
  return root;
}

/** Records every gh invocation; `assets` are the names already on each release. */
function fakeRunner(assets: Record<string, string[]> = {}): {
  runner: Runner;
  calls: string[][];
} {
  const calls: string[][] = [];
  const runner: Runner = async (cmd, args) => {
    calls.push([cmd, ...args]);
    // `gh release view <tag> --json assets --jq .assets[].name`
    if (args[0] === "release" && args[1] === "view" && args.includes("assets")) {
      const tag = args[2];
      return { stdout: (assets[tag] ?? []).join("\n"), stderr: "" };
    }
    return { stdout: "", stderr: "" };
  };
  return { runner, calls };
}

describe("publishAssets", () => {
  it("uploads each tarball under a file basename of <appId>-<version>.tar.gz", async () => {
    // gh derives the asset NAME from the uploaded file's basename — never from
    // the `#label`. The download URL (appAssetUrl) and the download counter
    // (buildAppCounts) both key off that per-version name, so the uploaded file
    // must be named accordingly, not left as the on-disk `package.tar.gz`.
    const apps = await fixtureApps([["example-app", "1.0.0"]]);
    const { runner, calls } = fakeRunner();

    await publishAssets(apps, runner);

    const upload = calls.find((c) => c[0] === "gh" && c[2] === "upload");
    expect(upload).toBeDefined();
    const fileArg = upload![upload!.length - 1];
    // No `#label` suffix abuse — the basename itself carries the asset name.
    expect(fileArg).not.toContain("#");
    expect(basename(fileArg)).toBe("example-app-1.0.0.tar.gz");
  });

  it("skips versions whose per-version asset already exists", async () => {
    const apps = await fixtureApps([
      ["example-app", "1.0.0"],
      ["example-app", "1.0.1"],
    ]);
    // The release already carries 1.0.0 under its correct per-version name.
    const { runner, calls } = fakeRunner({
      "example-app": ["example-app-1.0.0.tar.gz"],
    });

    await publishAssets(apps, runner);

    const uploads = calls
      .filter((c) => c[0] === "gh" && c[2] === "upload")
      .map((c) => basename(c[c.length - 1]));
    expect(uploads).toEqual(["example-app-1.0.1.tar.gz"]);
  });
});

/** A fixture extensions dir with one release per (extId, version) listed. */
async function fixtureExtensions(releases: Array<[string, string]>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "publish-ext-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  for (const [extId, version] of releases) {
    const dir = join(root, extId, "releases", version);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "bundle.zip"), `bundle ${extId} ${version}`);
  }
  return root;
}

describe("publishExtensionAssets", () => {
  it("uploads each bundle under a file basename of <extId>-<version>.zip", async () => {
    const ext = await fixtureExtensions([["draw-io", "0.2.0"]]);
    const { runner, calls } = fakeRunner();

    await publishExtensionAssets(ext, runner);

    const upload = calls.find((c) => c[0] === "gh" && c[2] === "upload");
    expect(upload).toBeDefined();
    const fileArg = upload![upload!.length - 1];
    expect(fileArg).not.toContain("#");
    expect(basename(fileArg)).toBe("draw-io-0.2.0.zip");
  });

  it("skips versions whose per-version asset already exists", async () => {
    const ext = await fixtureExtensions([
      ["draw-io", "0.1.0"],
      ["draw-io", "0.2.0"],
    ]);
    const { runner, calls } = fakeRunner({
      "draw-io": ["draw-io-0.1.0.zip"],
    });

    await publishExtensionAssets(ext, runner);

    const uploads = calls
      .filter((c) => c[0] === "gh" && c[2] === "upload")
      .map((c) => basename(c[c.length - 1]));
    expect(uploads).toEqual(["draw-io-0.2.0.zip"]);
  });
});
