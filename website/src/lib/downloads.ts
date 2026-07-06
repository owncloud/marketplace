import type { Downloads } from "./catalog.ts";

/** The download surfaces, in display order, that key into a Downloads object. */
export type SurfaceKey = Exclude<keyof Downloads, "generatedAt">;

/** Display metadata for one download surface (the data itself lives in Downloads). */
export interface SurfaceMeta {
  key: SurfaceKey;
  name: string;
  tagline: string;
  repo: string;
}

/**
 * Display order and labels for the download surfaces, shared by the downloads
 * landing page and the per-product release-history subpages so the two stay in
 * lockstep. Each `key` maps to a field on the published Downloads object.
 */
export const SURFACES: readonly SurfaceMeta[] = [
  { key: "ocis", name: "ownCloud Infinite Scale", tagline: "oCIS, the next-generation ownCloud", repo: "owncloud/ocis" },
  { key: "server", name: "ownCloud Classic", tagline: "ownCloud Classic, the PHP server", repo: "owncloud/core" },
  { key: "client", name: "Desktop Client", tagline: "Sync files on Windows, macOS and Linux", repo: "owncloud/client" },
  { key: "android", name: "Android", tagline: "ownCloud for phones and tablets", repo: "owncloud/android" },
  { key: "ios", name: "iOS", tagline: "ownCloud for iPhone and iPad", repo: "owncloud/ios-app" },
] as const;
