import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { addedPackagePaths } from "./check-changeset.js";
import { verifyReleaseSignature } from "../signing/verify-signature.js";
import { ValidationError } from "../types.js";

/**
 * Usage: tsx src/cli/check-signatures.ts <baseRef> [repoRoot]
 *
 * Verifies the ownCloud code-signing signature of every app release package
 * newly **added** by the diff of <baseRef>...HEAD. Existing (already-published)
 * releases are not re-checked — the gate applies only to what a submission adds.
 *
 * <repoRoot> defaults to ".." because this CLI is run from the tools/ directory
 * in CI (like validate.ts), while git paths are repo-relative.
 *
 * Exits non-zero with a publisher-friendly message on the first failure.
 */
export async function run(baseRef: string, repoRoot: string): Promise<number> {
  const packages = await addedPackagePaths(baseRef, repoRoot);
  for (const rel of packages) {
    await verifyReleaseSignature(resolve(repoRoot, rel));
  }
  if (packages.length === 0) {
    console.log("No newly-added app releases to verify.");
  } else {
    console.log(`Signatures OK: ${packages.length} newly-added app release(s) verified.`);
  }
  return 0;
}

async function main(): Promise<void> {
  const baseRef = process.argv[2];
  if (!baseRef) throw new Error("usage: check-signatures <baseRef> [repoRoot]");
  const repoRoot = process.argv[3] ?? "..";
  await run(baseRef, repoRoot);
}

// Only run when executed directly as a CLI, not when imported (e.g. by tests).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    if (err instanceof ValidationError) {
      console.error(`Validation failed: ${err.message}`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
}
