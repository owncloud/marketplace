import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { ValidationError } from "../types.js";
import { sniffAndMeasure, enforceImageLimits, DEFAULT_IMAGE_LIMITS } from "../image-validate.js";
import { parsePublisherJson } from "./publisher-json.js";
import type { PublisherInfo } from "./types.js";
import type { PublisherRef } from "./scan-publishers.js";

/**
 * Validate one publisher: the publisher.json parses and is schema-valid, its
 * `slug` matches the folder name, and — when a logo is declared — the logo file
 * exists in the publisher dir and is a supported, in-bounds image. Returns the
 * parsed PublisherInfo on success; throws ValidationError otherwise.
 *
 * The logo is validated with the same sniff/measure/enforce path as ingested
 * screenshots (image-validate.ts), so a corrupt or oversized image is rejected
 * in CI rather than shipped.
 */
export async function validatePublisher(ref: PublisherRef): Promise<PublisherInfo> {
  let text: string;
  try {
    text = await readFile(ref.jsonPath, "utf8");
  } catch {
    throw new ValidationError(`publisher "${ref.slug}" is missing publisher.json`);
  }
  const info = parsePublisherJson(text);

  if (info.slug !== ref.slug) {
    throw new ValidationError(
      `slug mismatch: folder is "publishers/${ref.slug}/" but publisher.json ` +
        `slug is "${info.slug}"`,
    );
  }

  if (info.logo) {
    // The logo must be a plain filename inside the publisher dir, not a path
    // escaping it; otherwise the served-tree copy and same-origin URL break.
    if (basename(info.logo) !== info.logo) {
      throw new ValidationError(
        `publisher "${ref.slug}" logo must be a file name in the publisher ` +
          `directory, not a path — got "${info.logo}"`,
      );
    }
    let bytes: Buffer;
    try {
      bytes = await readFile(join(ref.dir, info.logo));
    } catch {
      throw new ValidationError(
        `publisher "${ref.slug}" declares logo "${info.logo}" but the file is missing`,
      );
    }
    try {
      const meta = sniffAndMeasure(bytes);
      enforceImageLimits(meta, DEFAULT_IMAGE_LIMITS);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ValidationError(`publisher "${ref.slug}" logo "${info.logo}": ${msg}`);
    }
  }

  return info;
}

/**
 * Cross-registry integrity checks over all publishers, given the set of app and
 * extension ids that actually exist in the catalog:
 *   - every owned id resolves to a real app/extension
 *   - no app or extension is claimed by more than one publisher
 *
 * Runs after every publisher.json is parsed and every catalog id is known, so a
 * dangling reference or a double-claim fails the build with a clear message.
 */
export function assertOwnershipIntegrity(
  publishers: PublisherInfo[],
  appIds: Set<string>,
  extIds: Set<string>,
): void {
  const appOwner = new Map<string, string>();
  const extOwner = new Map<string, string>();

  for (const pub of publishers) {
    for (const id of pub.apps) {
      if (!appIds.has(id)) {
        throw new ValidationError(`publisher "${pub.slug}" claims unknown app "${id}"`);
      }
      const existing = appOwner.get(id);
      if (existing) {
        throw new ValidationError(`app "${id}" is claimed by both "${existing}" and "${pub.slug}"`);
      }
      appOwner.set(id, pub.slug);
    }
    for (const id of pub.extensions) {
      if (!extIds.has(id)) {
        throw new ValidationError(`publisher "${pub.slug}" claims unknown extension "${id}"`);
      }
      const existing = extOwner.get(id);
      if (existing) {
        throw new ValidationError(
          `extension "${id}" is claimed by both "${existing}" and "${pub.slug}"`,
        );
      }
      extOwner.set(id, pub.slug);
    }
  }
}
