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
 * The store supports ownCloud 11+ only, so only the 11.0.0 endpoint is emitted.
 * Extend as newer releases ship.
 */
export const KNOWN_PLATFORM_VERSIONS = ["11.0.0"];

/**
 * Supported ownCloud platform floor. New releases must declare an owncloud
 * min-version at or above this; enforced on submission (see validatePlatformFloor).
 */
export const MIN_PLATFORM_VERSION = "11.0.0";
