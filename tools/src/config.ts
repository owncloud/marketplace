/**
 * Base URL of the published site. Baked into absolute URLs in the API.
 * Overridable via MARKETPLACE_BASE_URL for local builds / custom domains.
 */
export const BASE_URL = (
  process.env.MARKETPLACE_BASE_URL ?? "https://owncloud.github.io/appstore"
).replace(/\/$/, "");

/**
 * The owner/repo (`owner/name`) whose GitHub Releases host the app package
 * assets. Read from GITHUB_REPOSITORY in CI; falls back to the canonical repo
 * for local builds. Read at call time so tests can override the env var.
 */
export function githubRepo(): string {
  return process.env.GITHUB_REPOSITORY ?? "DeepDiver1975/appstore";
}

/** The asset file name for an app release: `<appId>-<version>.tar.gz`. */
export function appAssetName(appId: string, version: string): string {
  return `${appId}-${version}.tar.gz`;
}

/**
 * The GitHub Release asset download URL for an app version. App packages are
 * published as assets on a per-app release tagged `<appId>`; advertising this
 * URL (rather than the GitHub Pages copy) lets GitHub count each download.
 */
export function appAssetUrl(appId: string, version: string): string {
  return `https://github.com/${githubRepo()}/releases/download/${appId}/${appAssetName(appId, version)}`;
}

/** The asset file name for an oCIS web-extension release: `<extId>-<version>.zip`. */
export function extAssetName(extId: string, version: string): string {
  return `${extId}-${version}.zip`;
}

/**
 * The GitHub Release asset download URL for an oCIS web-extension version. The
 * extension bundle ZIPs are published as assets on a per-extension release
 * tagged `<extId>` (mirroring the classic app flow), so advertising this URL
 * lets GitHub count each download and oCIS can fetch the bundle directly.
 */
export function extAssetUrl(extId: string, version: string): string {
  return `https://github.com/${githubRepo()}/releases/download/${extId}/${extAssetName(extId, version)}`;
}

/**
 * Supported classic Server lines, as `major.minor` → highest patch to generate.
 *
 * The Market app fetches `/api/v1/platform/<its exact 3-part version>/apps.json`
 * (`VersionHelper->getPlatformVersion(3)`) and has NO fallback: a version we did
 * not generate is a 404 that makes `occ market:list` and the in-server App Store
 * fail outright. Core ships patch releases without any marketplace change, so an
 * exact enumeration of shipped versions goes stale the day core tags a new patch
 * (owncloud/core#41773: 10.16.4 released, feed 404s).
 *
 * Each line is therefore generated with headroom past its newest release rather
 * than tracking it exactly. The feeds are pure filtered projections of the same
 * catalog (~115 KB each, byte-identical across a line), so unreleased patches
 * cost only disk on the published site and cannot serve anything wrong.
 * Raise a ceiling when core approaches it; add a line when one opens.
 */
const PLATFORM_LINE_MAX_PATCH: Record<string, number> = {
  "10.15": 9,
  "10.16": 9,
};

/**
 * ownCloud platform versions for which a per-version apps.json is generated:
 * every patch of each supported classic line (see PLATFORM_LINE_MAX_PATCH) plus
 * the forward-looking 11.0.0 endpoint. Ascending order.
 */
export const KNOWN_PLATFORM_VERSIONS = [
  ...Object.entries(PLATFORM_LINE_MAX_PATCH).flatMap(([line, maxPatch]) =>
    Array.from({ length: maxPatch + 1 }, (_, patch) => `${line}.${patch}`),
  ),
  "11.0.0",
];
