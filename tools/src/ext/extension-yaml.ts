import { parse as parseYaml } from "yaml";
import { ValidationError } from "../types.js";
import type { ExtensionInfo, OcisAuthor, OcisResource } from "./types.js";

/**
 * A reverse-DNS-ish extension id: dot-separated lowercase segments, each starting
 * with a letter, e.g. `com.github.owncloud.web-extensions.draw-io`. oCIS uses such
 * ids to namespace extensions; requiring the form keeps ids globally unique and
 * collision-resistant across publishers.
 */
const EXT_ID_RE = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

function requireString(value: unknown, field: string): string {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`extension.yaml is missing required field "${field}"`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Parse the `authors` list: at least one entry, each with a non-empty name. */
function parseAuthors(value: unknown): OcisAuthor[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError('extension.yaml must declare at least one "authors" entry');
  }
  return value.map((raw) => {
    if (!raw || typeof raw !== "object") {
      throw new ValidationError('extension.yaml "authors" entries must be objects with a name');
    }
    const obj = raw as Record<string, unknown>;
    const author: OcisAuthor = { name: requireString(obj.name, "authors[].name") };
    const url = optionalString(obj.url);
    if (url) author.url = url;
    return author;
  });
}

/** Parse the `tags` list: at least one non-empty string tag. */
function parseTags(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError('extension.yaml must declare at least one "tags" entry');
  }
  return value.map((t) => {
    if (typeof t !== "string" || t.trim() === "") {
      throw new ValidationError('extension.yaml "tags" entries must be non-empty strings');
    }
    return t.trim();
  });
}

/** Parse the optional `resources` list: each entry needs a url and a label. */
function parseResources(value: unknown): OcisResource[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new ValidationError('extension.yaml "resources" must be a list');
  }
  return value.map((raw) => {
    if (!raw || typeof raw !== "object") {
      throw new ValidationError('extension.yaml "resources" entries must be objects');
    }
    const obj = raw as Record<string, unknown>;
    const resource: OcisResource = {
      url: requireString(obj.url, "resources[].url"),
      label: requireString(obj.label, "resources[].label"),
    };
    const icon = optionalString(obj.icon);
    if (icon) resource.icon = icon;
    return resource;
  });
}

/** Parse and structurally validate an extension.yaml string. */
export function parseExtensionYaml(text: string): ExtensionInfo {
  let doc: unknown;
  try {
    doc = parseYaml(text);
  } catch (err) {
    throw new ValidationError(`extension.yaml is not valid YAML: ${String(err)}`);
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new ValidationError("extension.yaml must be a mapping of fields");
  }
  const obj = doc as Record<string, unknown>;

  const id = requireString(obj.id, "id");
  if (!EXT_ID_RE.test(id)) {
    throw new ValidationError(
      `extension.yaml "id" must be a reverse-DNS identifier ` +
        `(lowercase dot-separated segments, e.g. com.example.my-extension) — got "${id}"`,
    );
  }

  const info: ExtensionInfo = {
    id,
    name: requireString(obj.name, "name"),
    subtitle: requireString(obj.subtitle, "subtitle"),
    license: requireString(obj.license, "license"),
    version: requireString(obj.version, "version"),
    authors: parseAuthors(obj.authors),
    tags: parseTags(obj.tags),
  };
  const description = optionalString(obj.description);
  if (description) info.description = description;
  const minOCIS = optionalString(obj.minOCIS);
  if (minOCIS) info.minOCIS = minOCIS;
  const resources = parseResources(obj.resources);
  if (resources) info.resources = resources;

  return info;
}
