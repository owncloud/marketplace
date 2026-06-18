/**
 * Import oCIS web extensions from owncloud/awesome-ocis's `webApps/apps.json`
 * into this repo's extensions/ catalog. For each app and each of its listed
 * versions it lays out a complete, immutable release directory:
 *
 *   extensions/<slug>/releases/<version>/
 *     ├── bundle.zip          (the upstream release artifact; tar.gz repackaged)
 *     ├── cover.<ext>         (the app's cover image, validated)
 *     ├── screenshots/NN.<ext> (validated, upstream order)
 *     └── extension.yaml      (metadata mapped from apps.json)
 *
 * The folder <slug> is the short, filesystem-friendly id (last dot-segment of
 * the reverse-DNS id); the reverse-DNS id itself goes inside extension.yaml.
 * Bundles are committed (Git LFS via .gitattributes) and later re-hosted as our
 * own GitHub Release assets by publish-assets — upstream URLs are not advertised.
 *
 * Idempotent: a release directory that already exists on disk is skipped
 * untouched (published releases are immutable). Use --only to import a single
 * extension (one PR per app); slug derivation still runs over the full apps.json
 * so a filtered run derives the same slug it would in a full run.
 *
 * Usage:
 *   npx tsx scripts/import-awesome-ocis.ts                 # import all apps
 *   npx tsx scripts/import-awesome-ocis.ts --only draw-io  # one app (slug or id)
 *   npx tsx scripts/import-awesome-ocis.ts --dry-run       # print planned writes
 *   APPS_JSON_URL=… EXT_ROOT=… npx tsx scripts/import-awesome-ocis.ts
 *
 * Network note: version `url`s point at third-party GitHub Release artifacts;
 * some hosts may sit outside a sandbox network allowlist — rerun with the
 * sandbox disabled if a download fails.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, rm, writeFile, stat, readdir, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchAndValidateImage, extForFormat } from "../src/image-validate.js";
import {
  deriveSlugs,
  toExtensionYaml,
  type SourceApp,
  type SourceDocument,
  type SourceVersion,
} from "../src/ext/import-awesome-ocis.js";

const exec = promisify(execFile);

const HERE = dirname(fileURLToPath(import.meta.url));
const APPS_JSON_URL =
  process.env.APPS_JSON_URL ??
  "https://raw.githubusercontent.com/owncloud/awesome-ocis/main/webApps/apps.json";
/** Repo extensions/ dir (scripts/ lives under tools/, so go up two levels). */
const EXT_ROOT = process.env.EXT_ROOT ?? resolve(HERE, "..", "..", "extensions");
const DRY_RUN = process.argv.includes("--dry-run");

/** Value of a `--flag value` pair on argv, or undefined. */
function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Fetch and parse the apps.json document. */
async function fetchAppsJson(): Promise<SourceDocument> {
  const res = await fetch(APPS_JSON_URL);
  if (!res.ok) throw new Error(`GET ${res.status} for ${APPS_JSON_URL}`);
  return (await res.json()) as SourceDocument;
}

/** Download `url` into a Buffer, failing on any non-2xx response. */
async function downloadBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`GET ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Produce a `bundle.zip` at `destZip` from the artifact at `url`. A `.zip` is
 * written verbatim. A `.tar.gz`/`.tgz` is extracted and re-zipped, preserving
 * the archive's internal paths exactly so oCIS still loads the bundle.
 */
async function writeBundle(url: string, destZip: string): Promise<void> {
  const lower = url.toLowerCase();
  const buf = await downloadBuffer(url);
  if (lower.endsWith(".zip")) {
    await writeFile(destZip, buf);
    return;
  }
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) {
    const work = await mkdtemp(join(tmpdir(), "import-tar-"));
    try {
      const tarPath = join(work, "src.tar.gz");
      const extractDir = join(work, "extracted");
      await mkdir(extractDir, { recursive: true });
      await writeFile(tarPath, buf);
      // Extract, then zip the extracted tree's contents (zip -r . from inside it
      // preserves the same top-level entries the tar had).
      await exec("tar", ["-xzf", tarPath, "-C", extractDir]);
      await exec("zip", ["-r", "-q", destZip, "."], { cwd: extractDir });
    } finally {
      await rm(work, { recursive: true, force: true });
    }
    return;
  }
  throw new Error(`unsupported bundle artifact (expected .zip or .tar.gz): ${url}`);
}

/** Download + validate an image to `destDir/<name>.<ext>`; returns the file name. */
async function writeImage(url: string, destDir: string, name: string): Promise<string> {
  const { meta, bytes } = await fetchAndValidateImage(url);
  const file = `${name}.${extForFormat(meta.format)}`;
  await writeFile(join(destDir, file), bytes);
  return file;
}

/** True if `path` exists on disk. */
async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Import one (app, version): write the full release dir, or skip if it exists. */
async function importVersion(
  app: SourceApp,
  slug: string,
  version: SourceVersion,
): Promise<boolean> {
  const releaseDir = join(EXT_ROOT, slug, "releases", version.version);
  if (await exists(releaseDir)) {
    console.log(`= ${slug}@${version.version}: release dir exists, skipping`);
    return false;
  }
  if (DRY_RUN) {
    console.log(`+ would import ${slug}@${version.version} from ${version.url}`);
    return true;
  }

  // Stage in a temp dir, then move into place, so a failure mid-import never
  // leaves a half-written (and immutable-once-committed) release directory.
  const staging = await mkdtemp(join(tmpdir(), `import-${slug}-`));
  try {
    console.log(`↓ ${slug}@${version.version}: bundle ${version.url}`);
    await writeBundle(version.url, join(staging, "bundle.zip"));

    if (app.coverImage) {
      console.log(`↓ ${slug}@${version.version}: cover ${app.coverImage.url}`);
      await writeImage(app.coverImage.url, staging, "cover");
    }

    const shots = app.screenshots ?? [];
    if (shots.length > 0) {
      const shotsDir = join(staging, "screenshots");
      await mkdir(shotsDir, { recursive: true });
      for (let i = 0; i < shots.length; i++) {
        const name = String(i + 1).padStart(2, "0");
        console.log(`↓ ${slug}@${version.version}: screenshot ${shots[i].url}`);
        await writeImage(shots[i].url, shotsDir, name);
      }
    }

    await writeFile(join(staging, "extension.yaml"), toExtensionYaml(app, version), "utf8");

    await mkdir(dirname(releaseDir), { recursive: true });
    await moveDir(staging, releaseDir);
    console.log(`+ ${slug}@${version.version}: imported`);
    return true;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

/** Recursively copy `src` into a fresh `dest` directory (cross-device safe). */
async function moveDir(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  for (const entry of await readdir(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) await moveDir(from, to);
    else await copyFile(from, to);
  }
}

async function main(): Promise<void> {
  const only = argValue("--only");
  const doc = await fetchAppsJson();
  const slugById = deriveSlugs(doc.apps); // over the FULL set, for stable slugs

  let selected = doc.apps;
  if (only) {
    selected = doc.apps.filter((a) => a.id === only || slugById.get(a.id) === only);
    if (selected.length === 0) {
      const known = doc.apps.map((a) => `${slugById.get(a.id)} (${a.id})`).join(", ");
      throw new Error(`--only "${only}" matched no app. Known: ${known}`);
    }
  }

  console.log(`Importing ${selected.length} app(s) into ${EXT_ROOT}${DRY_RUN ? " (dry run)" : ""}`);
  let imported = 0;
  let skipped = 0;
  for (const app of selected) {
    const slug = slugById.get(app.id)!;
    for (const version of app.versions) {
      if (await importVersion(app, slug, version)) imported++;
      else skipped++;
    }
  }
  console.log(`Done: ${imported} release(s) imported, ${skipped} already present.`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
