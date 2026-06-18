/**
 * Pure helpers for importing oCIS web extensions from owncloud/awesome-ocis's
 * `webApps/apps.json` into this repo's extensions/ catalog. The network/disk
 * orchestration lives in scripts/import-awesome-ocis.ts; the slug derivation and
 * the apps.json → extension.yaml mapping are factored out here so they are
 * typechecked and unit-tested without any I/O.
 */
import { stringify as stringifyYaml } from "yaml";
import { EXT_ID_RE } from "./extension-yaml.js";
import type { ExtensionInfo, OcisAuthor, OcisResource } from "./types.js";

/** One version entry as it appears in awesome-ocis apps.json. */
export interface SourceVersion {
  version: string;
  minOCIS?: string;
  url: string;
}

/** One app entry as it appears in awesome-ocis apps.json. */
export interface SourceApp {
  id: string;
  name: string;
  subtitle: string;
  license: string;
  description?: string;
  versions: SourceVersion[];
  authors: OcisAuthor[];
  tags: string[];
  coverImage?: { url: string };
  screenshots?: { url: string; caption?: string }[];
  resources?: OcisResource[];
}

/** The top-level apps.json document. */
export interface SourceDocument {
  apps: SourceApp[];
}

/**
 * Derive the short folder slug for an app from its reverse-DNS id: the last
 * dot-segment (e.g. `com.github.owncloud.web-extensions.draw-io` → `draw-io`).
 * Already lowercase/hyphenated in practice; we still normalise defensively.
 */
function lastSegmentSlug(id: string): string {
  const last = id.split(".").pop() ?? id;
  return last
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The last two dot-segments joined by `-`, used as a collision fallback. */
function twoSegmentSlug(id: string): string {
  const segs = id.split(".");
  const tail = segs.slice(-2).join("-");
  return tail
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Map every app id to a unique folder slug. Uses the last dot-segment; for any
 * slug claimed by two or more distinct ids, the colliders fall back to their
 * last-two-segment form. Throws if even that does not disambiguate (a maintainer
 * must then assign slugs manually). Run over the FULL apps.json so a filtered
 * import derives the same slug it would in a full run.
 */
export function deriveSlugs(apps: SourceApp[]): Map<string, string> {
  for (const app of apps) {
    if (!EXT_ID_RE.test(app.id)) {
      throw new Error(`app id "${app.id}" is not a reverse-DNS identifier`);
    }
  }

  // Group ids by their first-choice (last-segment) slug to spot collisions.
  const byFirstChoice = new Map<string, string[]>();
  for (const app of apps) {
    const slug = lastSegmentSlug(app.id);
    (byFirstChoice.get(slug) ?? byFirstChoice.set(slug, []).get(slug)!).push(app.id);
  }

  const slugById = new Map<string, string>();
  for (const [slug, ids] of byFirstChoice) {
    if (ids.length === 1) {
      slugById.set(ids[0], slug);
    } else {
      for (const id of ids) slugById.set(id, twoSegmentSlug(id));
    }
  }

  // Final uniqueness check across all assigned slugs.
  const seen = new Map<string, string>();
  for (const [id, slug] of slugById) {
    const prior = seen.get(slug);
    if (prior) {
      throw new Error(
        `slug collision: "${slug}" claimed by both "${prior}" and "${id}" — assign manually`,
      );
    }
    seen.set(slug, id);
  }
  return slugById;
}

/**
 * Build the ExtensionInfo for one (app, version) — the in-memory shape of the
 * extension.yaml we will write. App-level display fields come from the app;
 * `version`/`minOCIS` come from the specific version. Screenshot captions are
 * carried over positionally and a `cover: true` flag is set whenever the source
 * app declares a coverImage (the image file itself is downloaded separately).
 */
export function toExtensionInfo(app: SourceApp, version: SourceVersion): ExtensionInfo {
  const info: ExtensionInfo = {
    id: app.id,
    name: app.name,
    subtitle: app.subtitle,
    license: app.license,
    version: version.version,
    authors: app.authors,
    tags: app.tags,
  };
  if (app.description) info.description = app.description;
  if (version.minOCIS) info.minOCIS = version.minOCIS;
  if (app.resources && app.resources.length > 0) info.resources = app.resources;
  if (app.coverImage) info.cover = true;
  // Captions pair positionally to the screenshots (screenshotCaptions[i] ↔ the
  // i-th screenshot). Empty captions can't be represented (the parser rejects
  // empty strings), so we only carry captions when EVERY screenshot has one;
  // a partial set would misalign. awesome-ocis captions every screenshot.
  const shots = app.screenshots ?? [];
  const captions = shots.map((s) => s.caption?.trim()).filter((c): c is string => !!c);
  if (shots.length > 0 && captions.length === shots.length) {
    info.screenshotCaptions = captions;
  }
  return info;
}

/** Serialise an ExtensionInfo to extension.yaml text. */
export function toExtensionYaml(app: SourceApp, version: SourceVersion): string {
  return stringifyYaml(toExtensionInfo(app, version));
}
