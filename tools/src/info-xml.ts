import { XMLParser, XMLValidator } from "fast-xml-parser";
import { type AppInfo, ValidationError } from "./types.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function requireString(value: unknown, field: string): string {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`info.xml is missing required field <${field}>`);
  }
  return value.trim();
}

/**
 * Extract a plain string from a text-bearing field that may be localized.
 * Handles: plain string/number, a localized object `{ "#text", "@_lang" }`,
 * and an array of those (preferring `@_lang === "en"`, then an untagged entry,
 * else the first). Returns undefined when absent/empty.
 */
function localizedText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    const en = value.find((v) => v && typeof v === "object" && v["@_lang"] === "en");
    const untagged = value.find((v) => !(v && typeof v === "object") || v["@_lang"] === undefined);
    return localizedText(en ?? untagged ?? value[0]);
  }
  if (typeof value === "object") {
    return localizedText((value as Record<string, unknown>)["#text"]);
  }
  return undefined;
}

/** Parse and structurally validate an appinfo/info.xml string. */
export function parseInfoXml(xml: string): AppInfo {
  const wellFormed = XMLValidator.validate(xml);
  if (wellFormed !== true) {
    throw new ValidationError(`info.xml is not well-formed XML: ${wellFormed.err.msg}`);
  }

  const doc = parser.parse(xml);
  const info = doc?.info;
  if (!info || typeof info !== "object") {
    throw new ValidationError("info.xml has no root <info> element");
  }

  const deps = info.dependencies;
  const owncloud = deps?.owncloud;
  if (!owncloud || typeof owncloud !== "object") {
    throw new ValidationError(
      "info.xml is missing <dependencies><owncloud min-version max-version/>",
    );
  }
  const platformMin = owncloud["@_min-version"];
  const platformMax = owncloud["@_max-version"];
  if (typeof platformMin !== "string" && typeof platformMin !== "number") {
    throw new ValidationError("info.xml <owncloud> is missing min-version");
  }
  if (typeof platformMax !== "string" && typeof platformMax !== "number") {
    throw new ValidationError("info.xml <owncloud> is missing max-version");
  }

  return {
    id: requireString(info.id, "id"),
    name: requireString(localizedText(info.name), "name"),
    summary: localizedText(info.summary) ?? "",
    description: requireString(localizedText(info.description), "description"),
    license: requireString(info.licence ?? info.license, "licence"),
    author: requireString(info.author, "author"),
    version: requireString(info.version, "version"),
    categories: toArray(info.category).map((c) => String(c).trim()),
    screenshots: toArray(info.screenshot).map((s) => String(s).trim()),
    platformMin: String(platformMin).trim(),
    platformMax: String(platformMax).trim(),
  };
}
