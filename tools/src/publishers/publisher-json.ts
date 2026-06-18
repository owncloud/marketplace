import { ValidationError } from "../types.js";
import type { PublisherInfo } from "./types.js";

/**
 * A publisher slug: lowercase, starts with a letter or digit, then letters,
 * digits or hyphens. It is the URL segment (`/publishers/<slug>`) and must equal
 * the folder name, so it has to be filesystem- and URL-safe.
 */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`publisher.json is missing required field "${field}"`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** An http(s) URL, validated by the URL parser; throws on anything else. */
function optionalHttpUrl(value: unknown, field: string): string | undefined {
  const str = optionalString(value);
  if (str === undefined) return undefined;
  let url: URL;
  try {
    url = new URL(str);
  } catch {
    throw new ValidationError(`publisher.json "${field}" is not a valid URL: "${str}"`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ValidationError(`publisher.json "${field}" must be an http(s) URL — got "${str}"`);
  }
  return str;
}

/** Parse the optional `apps`/`extensions` arrays: each entry a non-empty string. */
function parseIdList(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ValidationError(`publisher.json "${field}" must be a list of ids`);
  }
  return value.map((id) => {
    if (typeof id !== "string" || id.trim() === "") {
      throw new ValidationError(`publisher.json "${field}" entries must be non-empty strings`);
    }
    return id.trim();
  });
}

/** Parse and structurally validate a publisher.json string. */
export function parsePublisherJson(text: string): PublisherInfo {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (err) {
    throw new ValidationError(`publisher.json is not valid JSON: ${String(err)}`);
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new ValidationError("publisher.json must be a mapping of fields");
  }
  const obj = doc as Record<string, unknown>;

  const slug = requireString(obj.slug, "slug");
  if (!SLUG_RE.test(slug)) {
    throw new ValidationError(
      `publisher.json "slug" must be lowercase letters, digits and hyphens ` +
        `(e.g. owncloud) — got "${slug}"`,
    );
  }

  if (obj.enabled !== undefined && typeof obj.enabled !== "boolean") {
    throw new ValidationError(`publisher.json "enabled" must be a boolean`);
  }

  const info: PublisherInfo = {
    slug,
    name: requireString(obj.name, "name"),
    enabled: obj.enabled === true,
    apps: parseIdList(obj.apps, "apps"),
    extensions: parseIdList(obj.extensions, "extensions"),
  };
  const website = optionalHttpUrl(obj.website, "website");
  if (website) info.website = website;
  const description = optionalString(obj.description);
  if (description) info.description = description;
  const logo = optionalString(obj.logo);
  if (logo) info.logo = logo;

  return info;
}
