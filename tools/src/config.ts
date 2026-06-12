/**
 * Base URL of the published site. Baked into absolute URLs in the API.
 * Overridable via MARKETPLACE_BASE_URL for local builds / custom domains.
 */
export const BASE_URL = (
  process.env.MARKETPLACE_BASE_URL ?? "https://owncloud.github.io/appstore"
).replace(/\/$/, "");

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
