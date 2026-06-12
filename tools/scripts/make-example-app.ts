import * as tar from "tar";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const INFO = `<?xml version="1.0"?>
<info>
  <id>example-app</id>
  <name>Example App</name>
  <summary>A demonstration app</summary>
  <description>An example app used to seed and smoke-test the marketplace.</description>
  <licence>AGPL</licence>
  <author>ownCloud GmbH</author>
  <version>1.0.0</version>
  <category>tools</category>
  <screenshot>https://raw.githubusercontent.com/owncloud/screenshots/master/example/1.png</screenshot>
  <dependencies>
    <owncloud min-version="10.0.0" max-version="10.99.99" />
  </dependencies>
</info>
`;

async function main(): Promise<void> {
  const outPath = resolve("../apps/example-app/releases/1.0.0/package.tar.gz");
  const staging = await mkdtemp(join(tmpdir(), "example-"));
  try {
    await mkdir(join(staging, "example-app", "appinfo"), { recursive: true });
    await writeFile(join(staging, "example-app", "appinfo", "info.xml"), INFO);
    await tar.c({ gzip: true, file: outPath, cwd: staging }, ["example-app"]);
    console.log(`Wrote ${outPath}`);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
