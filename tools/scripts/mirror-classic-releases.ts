/**
 * Create/refresh the GitHub releases on owncloud/core that the downloads page
 * links to for classic ownCloud Server. owncloud/core has the version *tags*
 * but no GitHub *releases*; this mirrors every distributed file for each
 * supported version from download.owncloud.com and attaches them as release
 * assets, so fetch-downloads can resolve the classic surface from releases like
 * every other surface.
 *
 * For each version we mirror three things, all discovered from the download
 * server's directory index rather than hardcoded (so per-version differences
 * are handled and nothing is missed):
 *   1. the per-version archives `owncloud-<version>.{tar.bz2,zip}`;
 *   2. their checksum/signature sidecars (`.sha256`, `.md5`, `.asc` — e.g.
 *      10.15.1 has no `.asc`);
 *   3. the matching "complete" bundle `owncloud-complete-<date>.{tar.bz2,zip}`
 *      (+ its sidecars). Complete bundles are date-stamped, not version-stamped,
 *      and the stamp does NOT track the version archive's date (10.15.0's
 *      archive is dated 2024-08-05 but its bundle is `20240724`). They are
 *      matched by Last-Modified instead: a version archive and its complete
 *      bundle are built in the same release run, minutes apart, while the next
 *      nearest bundle is weeks away — so nearest-Last-Modified is unambiguous.
 *
 * One-off / repeatable maintainer operation (outward-facing, public upstream
 * repo). Requires the `gh` CLI authenticated with write access to the target
 * repo, and that each `v<version>` tag already exists there (it does). Safe to
 * re-run: a missing release is created, an existing one is topped up, and every
 * asset is uploaded with --clobber so the result is identical each time.
 *
 * Usage:
 *   npx tsx scripts/mirror-classic-releases.ts            # create/refresh on owncloud/core
 *   npx tsx scripts/mirror-classic-releases.ts --dry-run  # print actions only
 *   REPO=me/core npx tsx scripts/mirror-classic-releases.ts  # target a fork
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const exec = promisify(execFile);

const REPO = process.env.REPO ?? "owncloud/core";
const BASE = "https://download.owncloud.com/server/stable";
const DRY_RUN = process.argv.includes("--dry-run");

/** Max Last-Modified gap (ms) between a version archive and its complete bundle. */
const BUNDLE_MATCH_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Supported classic Server versions to mirror (every 10.15.x and 10.16.x patch). */
const VERSIONS = [
  "10.15.0",
  "10.15.1",
  "10.15.2",
  "10.15.3",
  "10.16.0",
  "10.16.1",
  "10.16.2",
  "10.16.3",
];

/**
 * Discover every file the download server publishes for `stem` from the
 * directory index. Matches `owncloud-<stem>.<ext>` and its checksum/signature
 * sidecars (`.sha256`, `.md5`, `.asc`) exactly — anchored so `10.16.1` never
 * picks up `10.16.10` — and ignores unrelated entries. `stem` is a version
 * (`10.16.3`) or a complete-bundle id (`complete-20260522`). Returns the
 * distinct file names sorted; the result is empty when the stem is absent.
 */
function selectFiles(indexHtml: string, stem: string): string[] {
  const escaped = stem.replace(/\./g, "\\.");
  // owncloud-<stem> followed by an archive extension, optionally a sidecar.
  const re = new RegExp(`owncloud-${escaped}\\.(?:tar\\.bz2|zip)(?:\\.(?:sha256|md5|asc))?`, "g");
  return [...new Set(indexHtml.match(re) ?? [])].sort();
}

/** All complete-bundle ids present in the index, e.g. "complete-20260522". */
function completeBundleIds(indexHtml: string): string[] {
  const ids = [...indexHtml.matchAll(/owncloud-(complete-\d+)\.(?:tar\.bz2|zip)/g)].map(
    (m) => m[1],
  );
  return [...new Set(ids)].sort();
}

/** Fetch the download server's directory index HTML. */
async function fetchIndex(): Promise<string> {
  const res = await fetch(`${BASE}/`);
  if (!res.ok) throw new Error(`GET ${res.status} for ${BASE}/`);
  return res.text();
}

/** The Last-Modified of a file as epoch ms, or null if unavailable. */
async function lastModified(name: string): Promise<number | null> {
  const res = await fetch(`${BASE}/${name}`, { method: "HEAD" });
  if (!res.ok) return null;
  const lm = res.headers.get("last-modified");
  if (!lm) return null;
  const t = Date.parse(lm);
  return Number.isNaN(t) ? null : t;
}

/**
 * Resolve which complete-bundle id belongs to `version`, by nearest archive
 * Last-Modified within BUNDLE_MATCH_WINDOW_MS. `bundleTimes` maps each bundle id
 * to its archive Last-Modified (epoch ms). Returns null when the version archive
 * has no Last-Modified or no bundle falls inside the window.
 */
function matchCompleteBundle(
  versionArchiveTime: number | null,
  bundleTimes: Map<string, number>,
): string | null {
  if (versionArchiveTime === null) return null;
  let best: string | null = null;
  let bestGap = Infinity;
  for (const [id, t] of bundleTimes) {
    const gap = Math.abs(t - versionArchiveTime);
    if (gap < bestGap) {
      bestGap = gap;
      best = id;
    }
  }
  return best !== null && bestGap <= BUNDLE_MATCH_WINDOW_MS ? best : null;
}

/** True if a release for `tag` already exists on the target repo. */
async function releaseExists(tag: string): Promise<boolean> {
  try {
    await exec("gh", ["release", "view", tag, "--repo", REPO]);
    return true;
  } catch {
    return false;
  }
}

/** Download `name` from the server to `dest`, failing on any non-2xx response. */
async function download(name: string, dest: string): Promise<void> {
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`GET ${res.status} for ${BASE}/${name}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

async function mirror(version: string, files: string[]): Promise<void> {
  const tag = `v${version}`;
  const staging = await mkdtemp(join(tmpdir(), `core-${version}-`));
  try {
    const assets: string[] = [];
    for (const name of files) {
      const dest = join(staging, name);
      console.log(`↓ ${BASE}/${name}`);
      if (!DRY_RUN) await download(name, dest);
      assets.push(dest);
    }

    // Create the release if missing, otherwise reuse it; either way upload every
    // asset with --clobber so re-runs are idempotent and existing releases that
    // are missing files (e.g. checksums, complete bundle) get topped up.
    if (DRY_RUN) {
      console.log(
        `+ would ensure release ${tag} on ${REPO} and upload ${assets.length} asset(s) (--clobber)`,
      );
      return;
    }
    if (!(await releaseExists(tag))) {
      await exec("gh", [
        "release",
        "create",
        tag,
        "--repo",
        REPO,
        "--verify-tag", // reuse the existing tag; never move it
        "--title",
        `ownCloud ${version}`,
        "--notes",
        `Classic ownCloud Server ${version}. Files mirrored from ${BASE}.`,
      ]);
      console.log(`+ ${tag}: created on ${REPO}`);
    } else {
      console.log(`= ${tag}: release exists on ${REPO}, updating assets`);
    }
    await exec("gh", ["release", "upload", tag, "--repo", REPO, "--clobber", ...assets]);
    console.log(`↑ ${tag}: uploaded ${assets.length} asset(s)`);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

/** Resolve the full file list (version files + matched complete bundle) per version. */
async function resolveFiles(indexHtml: string): Promise<Map<string, string[]>> {
  // Last-Modified of every complete bundle's archive, fetched once and shared.
  const bundleTimes = new Map<string, number>();
  for (const id of completeBundleIds(indexHtml)) {
    const t = await lastModified(`owncloud-${id}.tar.bz2`);
    if (t !== null) bundleTimes.set(id, t);
  }

  const byVersion = new Map<string, string[]>();
  for (const version of VERSIONS) {
    const versionFiles = selectFiles(indexHtml, version);
    if (versionFiles.length === 0) {
      throw new Error(`no files found for ${version} in the download index`);
    }
    const archiveTime = await lastModified(`owncloud-${version}.tar.bz2`);
    const bundleId = matchCompleteBundle(archiveTime, bundleTimes);
    if (!bundleId) {
      console.warn(
        `! ${version}: no matching complete bundle found; mirroring per-version files only`,
      );
    }
    const bundleFiles = bundleId ? selectFiles(indexHtml, bundleId) : [];
    byVersion.set(version, [...versionFiles, ...bundleFiles]);
  }
  return byVersion;
}

async function main(): Promise<void> {
  console.log(
    `Mirroring ${VERSIONS.length} classic release(s) to ${REPO}${DRY_RUN ? " (dry run)" : ""}`,
  );
  const indexHtml = await fetchIndex();
  const filesByVersion = await resolveFiles(indexHtml);
  // Sequential: each downloads a few hundred MB and uploads it; no need to parallelize.
  for (const version of VERSIONS) await mirror(version, filesByVersion.get(version) ?? []);
  console.log("Done.");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
