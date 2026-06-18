/**
 * Types for the publisher registry. Publishers are an opt-in layer over the
 * existing app/extension catalogs: a `publishers/<slug>/publisher.json` claims a
 * set of app and extension ids and, when enabled, gets a public page at
 * `/publishers/<slug>`. The classic ownCloud API and the oCIS feed are untouched.
 */

/** Aggregate counts across a publisher's owned apps and extensions. */
export interface PublisherStats {
  apps: number;
  extensions: number;
  /** Sum of all-time downloads across every owned app and extension. */
  downloads: number;
}

/**
 * Metadata parsed from a single publisher.json. `logo` here is the *filename*
 * of an image sitting next to the JSON (the ingestion source); the generated
 * ApiPublisher carries the same-origin URL instead.
 */
export interface PublisherInfo {
  slug: string;
  name: string;
  /** Whether the publisher has a public page. Defaults to false (opt-in). */
  enabled: boolean;
  website?: string;
  description?: string;
  /** Filename of the logo image in the publisher dir (e.g. "logo.png"). */
  logo?: string;
  /** Owned classic-app folder ids (the `apps/<id>` slug). */
  apps: string[];
  /** Owned extension folder ids (the `extensions/<extId>` slug). */
  extensions: string[];
}

/**
 * A publisher entry in the generated api/v1/publishers.json array. Only enabled
 * publishers are emitted, so presence in the feed means the page exists. `logo`
 * is a same-origin URL into the served tree (not the source filename).
 */
export interface ApiPublisher {
  slug: string;
  name: string;
  enabled: boolean;
  website?: string;
  description?: string;
  logo?: string;
  apps: string[];
  extensions: string[];
  stats: PublisherStats;
}
