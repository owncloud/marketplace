import { scanApps } from "../scan.js";
import { validateRelease } from "../validate.js";
import { ValidationError } from "../types.js";

/**
 * Usage: tsx src/cli/validate.ts [appsDir]
 * Validates every release under appsDir (default "apps"). Exits non-zero with a
 * publisher-friendly message on the first failure.
 */
async function main(): Promise<void> {
  const appsDir = process.argv[2] ?? "apps";
  const refs = await scanApps(appsDir);
  if (refs.length === 0) {
    console.log("No releases found — nothing to validate.");
    return;
  }
  for (const ref of refs) {
    await validateRelease(ref);
  }
  console.log(`OK: ${refs.length} release(s) valid.`);
}

main().catch((err: unknown) => {
  if (err instanceof ValidationError) {
    console.error(`Validation failed: ${err.message}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
