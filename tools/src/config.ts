/**
 * Base URL of the published site. Baked into absolute URLs in the API.
 * Overridable via MARKETPLACE_BASE_URL for local builds / custom domains.
 */
export const BASE_URL = (
  process.env.MARKETPLACE_BASE_URL ?? "https://owncloud.github.io/appstore"
).replace(/\/$/, "");

/**
 * ownCloud platform versions for which a per-version apps.json is generated
 * (back-compat with the existing market client). Extend as releases ship.
 */
export const KNOWN_PLATFORM_VERSIONS = ["10.0.0", "10.11.0", "11.0.0"];
