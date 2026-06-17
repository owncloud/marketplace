import { readFile } from "node:fs/promises";
import { ValidationError } from "../types.js";
import { parseExtensionYaml } from "./extension-yaml.js";
import type { ExtensionInfo } from "./types.js";
import type { ExtensionRef } from "./scan-extensions.js";

/**
 * Validate one extension release: the extension.yaml parses and is schema-valid,
 * and the release's `version` matches the `releases/<version>/` directory name.
 * Returns the parsed ExtensionInfo on success; throws ValidationError otherwise.
 *
 * Note: unlike the classic app id (derived from the folder name), an extension's
 * reverse-DNS `id` need NOT equal its folder name (`extId`) — the folder is just a
 * short, filesystem-friendly slug used for the release tag and asset name. Id
 * consistency across an extension's releases is enforced separately, in
 * assertConsistentIds, once all releases of an extension are known.
 */
export async function validateExtensionRelease(ref: ExtensionRef): Promise<ExtensionInfo> {
  let text: string;
  try {
    text = await readFile(ref.yamlPath, "utf8");
  } catch {
    throw new ValidationError(
      `extension "${ref.extId}" release ${ref.version} is missing extension.yaml`,
    );
  }
  const info = parseExtensionYaml(text);

  if (info.version !== ref.version) {
    throw new ValidationError(
      `version mismatch: folder is ".../releases/${ref.version}/" but extension.yaml ` +
        `version is "${info.version}"`,
    );
  }
  return info;
}

/**
 * Assert that every release of a single extension (same folder `extId`) declares
 * the same reverse-DNS `id`. The id is what oCIS keys on, so it must be stable
 * across versions; a typo in one release would otherwise split the catalog entry.
 */
export function assertConsistentIds(extId: string, infos: ExtensionInfo[]): void {
  const ids = new Set(infos.map((i) => i.id));
  if (ids.size > 1) {
    throw new ValidationError(
      `extension "${extId}" declares conflicting ids across releases: ${[...ids].join(", ")}`,
    );
  }
}
