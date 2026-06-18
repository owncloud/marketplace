/**
 * Types for the oCIS web-extension catalog. These are kept deliberately separate
 * from the classic-app types (../types.ts): extensions are a parallel catalog with
 * a parallel API namespace (api/ocis/v1), and the classic ownCloud API is untouched.
 *
 * The output shape (OcisApp / OcisVersion / ...) mirrors oCIS Web's app-store
 * `RawAppSchema` (owncloud/web → packages/web-app-app-store/src/types.ts) so the
 * generated apps.json is a drop-in repository feed: an oCIS admin just adds our URL.
 * We define our own interfaces rather than importing oCIS's Zod schema; a unit test
 * asserts conformance so upstream schema drift is caught.
 */

/** An author of an extension, as oCIS renders it. */
export interface OcisAuthor {
  name: string;
  url?: string;
}

/** An image (cover or screenshot) reference, as oCIS renders it. */
export interface OcisImage {
  url: string;
  caption?: string;
}

/** An external resource link (docs, source, …), as oCIS renders it. */
export interface OcisResource {
  url: string;
  label: string;
  icon?: string;
}

/**
 * One downloadable version of an extension. `version`/`minOCIS`/`url` are the
 * fields oCIS's RawAppSchema consumes; `created`/`downloads` are extra fields
 * oCIS ignores (its schema strips unknown keys) that the marketplace website
 * renders, so a single feed serves both audiences.
 */
export interface OcisVersion {
  version: string;
  /** Minimum compatible oCIS version (semver), when declared. */
  minOCIS?: string;
  /** Direct download URL of the extension bundle ZIP. */
  url: string;
  /** ISO-8601 first-commit date of this release (website only). */
  created?: string;
  /** GitHub Release asset download count for this version (website only). */
  downloads?: number;
}

/** One extension entry in the generated api/ocis/v1/apps.json array. */
export interface OcisApp {
  id: string;
  name: string;
  subtitle: string;
  description?: string;
  license: string;
  /** Versions newest-first. */
  versions: OcisVersion[];
  authors: OcisAuthor[];
  tags: string[];
  coverImage?: OcisImage;
  screenshots?: OcisImage[];
  resources?: OcisResource[];
  /**
   * All-time download total across every version (website only; not part of
   * oCIS's RawAppSchema, which ignores it).
   */
  downloads?: number;
}

/**
 * Metadata parsed from a single release's extension.yaml. One file describes one
 * version of one extension; the app-level fields (name, subtitle, …) of the newest
 * release become the extension's display fields in the generated feed.
 *
 * Screenshots and coverImage are NOT authored here: they are ingested image files
 * on disk (reusing the classic screenshot mechanism), turned into same-origin URLs
 * at build time.
 */
export interface ExtensionInfo {
  id: string;
  name: string;
  subtitle: string;
  description?: string;
  license: string;
  version: string;
  /** Minimum compatible oCIS version, when declared. */
  minOCIS?: string;
  authors: OcisAuthor[];
  tags: string[];
  resources?: OcisResource[];
  /**
   * True when a distinct `cover.<ext>` image file ships in the release dir
   * (beside bundle.zip, outside screenshots/). When false/absent, the generator
   * falls back to the first screenshot as the cover.
   */
  cover?: boolean;
  /** Optional caption for the cover image (only meaningful when `cover` is true). */
  coverCaption?: string;
  /**
   * Optional captions paired positionally to the sorted screenshot files
   * (screenshotCaptions[i] ↔ the i-th `screenshots/NN.<ext>`). A shorter list
   * leaves later screenshots uncaptioned; surplus entries are ignored.
   */
  screenshotCaptions?: string[];
}
