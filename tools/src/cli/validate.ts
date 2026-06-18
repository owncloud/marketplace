import { scanApps } from "../scan.js";
import { validateRelease } from "../validate.js";
import { ValidationError } from "../types.js";
import { scanExtensions } from "../ext/scan-extensions.js";
import { validateExtensionRelease, assertConsistentIds } from "../ext/validate-extension.js";
import { scanPublishers } from "../publishers/scan-publishers.js";
import { validatePublisher, assertOwnershipIntegrity } from "../publishers/validate-publisher.js";
import type { ExtensionInfo } from "../ext/types.js";
import type { PublisherInfo } from "../publishers/types.js";

/**
 * Usage: tsx src/cli/validate.ts [appsDir] [extDir] [publishersDir]
 * Validates every release under appsDir (default "apps"), every extension
 * release under extDir (default "extensions"), and every publisher under
 * publishersDir (default "publishers"). Exits non-zero with a publisher-friendly
 * message on the first failure.
 */
async function main(): Promise<void> {
  const appsDir = process.argv[2] ?? "apps";
  const extDir = process.argv[3] ?? "extensions";
  const publishersDir = process.argv[4] ?? "publishers";

  const refs = await scanApps(appsDir);
  for (const ref of refs) {
    await validateRelease(ref);
  }

  const extRefs = await scanExtensions(extDir);
  const byExt = new Map<string, ExtensionInfo[]>();
  for (const ref of extRefs) {
    const info = await validateExtensionRelease(ref);
    const list = byExt.get(ref.extId) ?? [];
    list.push(info);
    byExt.set(ref.extId, list);
  }
  for (const [extId, infos] of byExt) assertConsistentIds(extId, infos);

  const publisherRefs = await scanPublishers(publishersDir);
  const publisherInfos: PublisherInfo[] = [];
  for (const ref of publisherRefs) publisherInfos.push(await validatePublisher(ref));
  assertOwnershipIntegrity(
    publisherInfos,
    new Set(refs.map((r) => r.appId)),
    new Set(extRefs.map((r) => r.extId)),
  );

  if (refs.length === 0 && extRefs.length === 0 && publisherRefs.length === 0) {
    console.log("No releases found — nothing to validate.");
    return;
  }
  console.log(
    `OK: ${refs.length} app release(s), ${extRefs.length} extension release(s) ` +
      `and ${publisherRefs.length} publisher(s) valid.`,
  );
}

main().catch((err: unknown) => {
  if (err instanceof ValidationError) {
    console.error(`Validation failed: ${err.message}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
