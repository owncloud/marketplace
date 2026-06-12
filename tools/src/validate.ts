import semver from "semver";
import { type AppInfo, ValidationError } from "./types.js";
import { isValidCategory } from "./categories.js";
import { parseInfoXml } from "./info-xml.js";
import { readInfoXmlFromTarball } from "./package-reader.js";
import { MIN_PLATFORM_VERSION } from "./config.js";
import type { ReleaseRef } from "./scan.js";

/**
 * Validate one release: the tarball parses, its info.xml is schema-valid, the
 * folder appId/version match info.xml, and every category is supported.
 * Returns the parsed AppInfo on success; throws ValidationError otherwise.
 *
 * NOTE: the ownCloud platform floor is NOT checked here. This runs over the
 * whole catalog (including already-published, immutable releases), and the
 * floor must only gate *new* submissions — see validatePlatformFloor, invoked
 * from check-changeset for added releases.
 */
export async function validateRelease(ref: ReleaseRef): Promise<AppInfo> {
  const xml = await readInfoXmlFromTarball(ref.tarballPath);
  const info = parseInfoXml(xml);

  if (info.id !== ref.appId) {
    throw new ValidationError(
      `app id mismatch: folder is "apps/${ref.appId}/" but info.xml <id> is "${info.id}"`,
    );
  }
  if (info.version !== ref.version) {
    throw new ValidationError(
      `version mismatch: folder is ".../releases/${ref.version}/" but info.xml <version> is "${info.version}"`,
    );
  }
  if (info.categories.length === 0) {
    throw new ValidationError(`app "${info.id}" declares no <category> in info.xml`);
  }
  for (const cat of info.categories) {
    if (!isValidCategory(cat)) {
      throw new ValidationError(
        `app "${info.id}" uses unknown category "${cat}" (not a supported marketplace category)`,
      );
    }
  }
  return info;
}

/**
 * Enforce the supported ownCloud platform floor on a release. Applied only to
 * newly-submitted releases (not the whole catalog), so historical releases
 * published before the floor was raised remain valid and immutable.
 */
export function validatePlatformFloor(info: AppInfo): void {
  const min = semver.coerce(info.platformMin);
  if (!min) {
    throw new ValidationError(
      `app "${info.id}" has an unparseable owncloud min-version "${info.platformMin}"`,
    );
  }
  if (semver.lt(min, MIN_PLATFORM_VERSION)) {
    throw new ValidationError(
      `app "${info.id}" requires ownCloud min-version >= 11 (info.xml declares "${info.platformMin}")`,
    );
  }
}

export interface ChangedPath {
  path: string;
  /** Git status letter: A(dded), M(odified), D(eleted), R(enamed). */
  status: "A" | "M" | "D" | "R";
}

const RELEASE_FILE_RE = /^apps\/([^/]+)\/releases\/([^/]+)\/.+/;

function releaseDirOf(path: string): string | null {
  const m = RELEASE_FILE_RE.exec(path);
  return m ? `apps/${m[1]}/releases/${m[2]}` : null;
}

/**
 * Enforce release immutability and no-collision over a set of changed paths.
 * `existsOnMaster(releaseDir)` returns true if that release is already published.
 */
export function validateChangeset(
  changed: ChangedPath[],
  existsOnMaster: (releaseDir: string) => boolean,
): void {
  for (const change of changed) {
    const releaseDir = releaseDirOf(change.path);
    if (releaseDir === null) continue; // not an app release file; ignore

    if (change.status === "M" || change.status === "D" || change.status === "R") {
      throw new ValidationError(
        `published releases are immutable: "${change.path}" may not be modified or deleted ` +
          `(${releaseDir} is already published — submit a new version instead)`,
      );
    }
    // status === "A": adding. Reject if the release already exists on master.
    if (existsOnMaster(releaseDir)) {
      throw new ValidationError(
        `release collision: ${releaseDir} already exists on master and cannot be re-published`,
      );
    }
  }
}
