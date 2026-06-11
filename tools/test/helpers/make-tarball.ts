import * as tar from "tar";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Build a .tar.gz at `outPath` containing `<rootDir>/appinfo/info.xml` (when
 * infoXml is provided) plus any extra files. Returns a cleanup function.
 */
export async function makeTarball(
  outPath: string,
  opts: { rootDir: string; infoXml?: string; extraFiles?: Record<string, string> },
): Promise<() => Promise<void>> {
  const staging = await mkdtemp(join(tmpdir(), "mk-tar-"));
  const appDir = join(staging, opts.rootDir);
  if (opts.infoXml !== undefined) {
    await mkdir(join(appDir, "appinfo"), { recursive: true });
    await writeFile(join(appDir, "appinfo", "info.xml"), opts.infoXml);
  }
  for (const [rel, content] of Object.entries(opts.extraFiles ?? {})) {
    const full = join(appDir, rel);
    await mkdir(join(full, ".."), { recursive: true });
    await writeFile(full, content);
  }
  await tar.c({ gzip: true, file: outPath, cwd: staging }, [opts.rootDir]);
  return async () => {
    await rm(staging, { recursive: true, force: true });
  };
}
