import { readdir } from "node:fs/promises";
import { join } from "node:path";

/** Image extensions ingestion writes (and the website/API serve). */
const SCREENSHOT_EXT_RE = /\.(png|jpg|webp)$/i;

/** The directory holding a release's ingested screenshot files. */
export function screenshotsDir(releaseDir: string): string {
  return join(releaseDir, "screenshots");
}

/**
 * List a release's ingested screenshot file names (e.g. ["01.png", "02.jpg"]),
 * sorted for deterministic output. Returns [] when the release has no
 * screenshots dir yet (readdir order is unspecified, so we always sort).
 */
export async function listScreenshots(releaseDir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(screenshotsDir(releaseDir));
  } catch {
    return [];
  }
  return entries.filter((name) => SCREENSHOT_EXT_RE.test(name)).sort();
}

/** Matches the distinct cover image file `cover.<ext>` in a release dir root. */
const COVER_RE = /^cover\.(png|jpg|webp)$/i;

/**
 * Find a release's distinct cover image file name (e.g. "cover.png"), or
 * undefined when none ships. The cover lives at the release-dir root (beside
 * bundle.zip), NOT inside screenshots/, so it is never treated as a screenshot.
 */
export async function findCover(releaseDir: string): Promise<string | undefined> {
  let entries: string[];
  try {
    entries = await readdir(releaseDir);
  } catch {
    return undefined;
  }
  return entries.filter((name) => COVER_RE.test(name)).sort()[0];
}
