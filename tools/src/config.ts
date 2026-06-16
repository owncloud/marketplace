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

/**
 * ownCloud platform versions for which a per-version apps.json is generated.
 * Covers the supported classic Server lines (every 10.15.x and 10.16.x patch)
 * plus the forward-looking 11.0.0 endpoint. A client asks for the apps
 * compatible with its exact running version; extend as newer releases ship.
 */
export const KNOWN_PLATFORM_VERSIONS = [
  "10.15.0",
  "10.15.1",
  "10.15.2",
  "10.15.3",
  "10.16.0",
  "10.16.1",
  "10.16.2",
  "10.16.3",
  "11.0.0",
];
