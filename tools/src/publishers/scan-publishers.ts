import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export interface PublisherRef {
  slug: string;
  /** Directory: <publishersRoot>/<slug> */
  dir: string;
  /** Absolute path to the publisher's metadata file. */
  jsonPath: string;
}

async function listDirs(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/** Walk <publishersRoot>/{slug}/publisher.json and return every publisher. */
export async function scanPublishers(publishersRoot: string): Promise<PublisherRef[]> {
  try {
    await stat(publishersRoot);
  } catch {
    return [];
  }
  const refs: PublisherRef[] = [];
  for (const slug of await listDirs(publishersRoot)) {
    const dir = join(publishersRoot, slug);
    refs.push({ slug, dir, jsonPath: join(dir, "publisher.json") });
  }
  return refs;
}
