import { describe, it, expect, afterEach, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import crypto from "node:crypto";
import * as tar from "tar";
import { verifyReleaseSignature } from "../src/signing/verify-signature.js";
import { ValidationError } from "../src/types.js";
import { makeTestPki, type TestPki } from "./helpers/signing-pki.js";
import type { Hashes } from "../src/signing/canonical-manifest.js";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

const pki: TestPki = makeTestPki();
afterAll(() => pki.cleanup());

const APP_ID = "testapp";
/** App file tree used across tests (paths relative to the app root). */
const FILES: Record<string, string> = {
  "appinfo/info.xml": "<info><id>testapp</id></info>",
  "js/app.js": "console.log('hi');\n",
  "lib/thing.php": "<?php // thing\n",
};

function sha512Hex(s: string): string {
  return crypto.createHash("sha512").update(Buffer.from(s, "utf8")).digest("hex");
}

function manifestOf(files: Record<string, string>): Hashes {
  const h: Hashes = {};
  for (const [k, v] of Object.entries(files)) h[k] = sha512Hex(v);
  return h;
}

/**
 * Build an app tarball under a temp dir: writes `files` plus
 * `appinfo/signature.json` (= signatureJson) under `<APP_ID>/`, optionally adds
 * symlinks (`symlinks`: link path -> target path, both relative to the app
 * root), tars it, and returns the tarball path. Registers cleanup.
 */
async function buildTarball(
  files: Record<string, string>,
  signatureJson: string,
  symlinks: Record<string, string> = {},
): Promise<string> {
  const staging = await mkdtemp(join(tmpdir(), "sig-stage-"));
  cleanups.push(() => rm(staging, { recursive: true, force: true }));
  const appDir = join(staging, APP_ID);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(appDir, rel);
    await mkdir(join(full, ".."), { recursive: true });
    await writeFile(full, content);
  }
  for (const [linkRel, targetRel] of Object.entries(symlinks)) {
    const linkFull = join(appDir, linkRel);
    await mkdir(join(linkFull, ".."), { recursive: true });
    // Relative link target, resolved against the link's own directory.
    const rel = relative(join(linkFull, ".."), join(appDir, targetRel));
    await symlink(rel, linkFull);
  }
  await mkdir(join(appDir, "appinfo"), { recursive: true });
  await writeFile(join(appDir, "appinfo", "signature.json"), signatureJson);

  const out = join(staging, "package.tar.gz");
  await tar.c({ gzip: true, file: out, cwd: staging }, [APP_ID]);
  return out;
}

const opts = () => ({ trustRootsDir: pki.trustRootsDir });

describe("verifyReleaseSignature — positive", () => {
  it("accepts a valid v1 (legacy G1) signature", async () => {
    const sig = pki.signV1(manifestOf(FILES));
    const tarball = await buildTarball(FILES, sig);
    await expect(verifyReleaseSignature(tarball, opts())).resolves.toBeUndefined();
  });

  it("accepts a valid v2 ECDSA-P384 (G2) signature", async () => {
    const sig = pki.signV2(manifestOf(FILES), "ecdsa-p384-sha384");
    const tarball = await buildTarball(FILES, sig);
    await expect(verifyReleaseSignature(tarball, opts())).resolves.toBeUndefined();
  });

  it("accepts a valid v2 RSA-PSS-SHA384 (G2) signature", async () => {
    const sig = pki.signV2(manifestOf(FILES), "rsa-pss-sha384");
    const tarball = await buildTarball(FILES, sig);
    await expect(verifyReleaseSignature(tarball, opts())).resolves.toBeUndefined();
  });

  it("ignores OS cruft files not present in the manifest", async () => {
    const sig = pki.signV1(manifestOf(FILES));
    const withCruft = { ...FILES, ".DS_Store": "junk", "foo/Thumbs.db": "junk" };
    const tarball = await buildTarball(withCruft, sig);
    await expect(verifyReleaseSignature(tarball, opts())).resolves.toBeUndefined();
  });

  it("accepts a v1 signature that hashes a symlink's target content (legacy signer followed symlinks)", async () => {
    // Real classic apps ship e.g. vendor/bin/phpunit -> ../phpunit/.../phpunit.
    // The v1 signer followed the link and hashed the TARGET file's bytes under
    // the link's path, so the manifest key is the link but its hash is the
    // target content.
    const target = "vendor/phpunit/phpunit/phpunit";
    const files = { ...FILES, [target]: "#!/usr/bin/env php\n<?php // phpunit\n" };
    const manifest = manifestOf(files);
    // Add the symlink entry: same content hash as the target.
    manifest["vendor/bin/phpunit"] = manifest[target];
    const sig = pki.signV1(manifest);
    const tarball = await buildTarball(files, sig, { "vendor/bin/phpunit": target });
    await expect(verifyReleaseSignature(tarball, opts())).resolves.toBeUndefined();
  });

  it("ignores symlinks for v2 (ocsign never follows them)", async () => {
    // A v2 manifest does not list symlinks; a symlink present in the package
    // must not be treated as an extra unlisted file.
    const sig = pki.signV2(manifestOf(FILES), "ecdsa-p384-sha384");
    const tarball = await buildTarball(FILES, sig, { "vendor/bin/phpunit": "js/app.js" });
    await expect(verifyReleaseSignature(tarball, opts())).resolves.toBeUndefined();
  });
});

describe("verifyReleaseSignature — Gate 1 (missing signature.json)", () => {
  it("rejects a package with no appinfo/signature.json", async () => {
    const staging = await mkdtemp(join(tmpdir(), "sig-stage-"));
    cleanups.push(() => rm(staging, { recursive: true, force: true }));
    const appDir = join(staging, APP_ID, "appinfo");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, "info.xml"), FILES["appinfo/info.xml"]);
    const out = join(staging, "package.tar.gz");
    await tar.c({ gzip: true, file: out, cwd: staging }, [APP_ID]);
    await expect(verifyReleaseSignature(out, opts())).rejects.toThrow(
      /not signed|signature\.json/i,
    );
  });
});

describe("verifyReleaseSignature — Gate 2 (manifest mismatch)", () => {
  it("rejects when a hashed file was modified after signing", async () => {
    const sig = pki.signV1(manifestOf(FILES));
    const tampered = { ...FILES, "js/app.js": "console.log('MALICIOUS');\n" };
    const tarball = await buildTarball(tampered, sig);
    await expect(verifyReleaseSignature(tarball, opts())).rejects.toThrow(
      /manifest mismatch|does not match/i,
    );
  });

  it("rejects when an extra unlisted file is added", async () => {
    const sig = pki.signV1(manifestOf(FILES));
    const withExtra = { ...FILES, "lib/backdoor.php": "<?php system($_GET['c']);\n" };
    const tarball = await buildTarball(withExtra, sig);
    await expect(verifyReleaseSignature(tarball, opts())).rejects.toThrow(
      /manifest mismatch|not in/i,
    );
  });

  it("rejects when a manifest-listed file is missing from the package", async () => {
    const sig = pki.signV1(manifestOf(FILES));
    const missing = { ...FILES };
    delete missing["lib/thing.php"]; // signed but absent from the package
    const tarball = await buildTarball(missing, sig);
    await expect(verifyReleaseSignature(tarball, opts())).rejects.toThrow(
      /manifest mismatch|missing/i,
    );
  });
});

describe("verifyReleaseSignature — Gate 3 (crypto)", () => {
  it("rejects a v1 signature with a flipped signature byte", async () => {
    const parsed = JSON.parse(pki.signV1(manifestOf(FILES)));
    const raw = Buffer.from(parsed.signature, "base64");
    raw[0] ^= 0xff;
    parsed.signature = raw.toString("base64");
    const tarball = await buildTarball(FILES, JSON.stringify(parsed));
    await expect(verifyReleaseSignature(tarball, opts())).rejects.toThrow(
      /signature is not valid/i,
    );
  });

  it("rejects a v2 signature with a flipped signature byte", async () => {
    const parsed = JSON.parse(pki.signV2(manifestOf(FILES), "ecdsa-p384-sha384"));
    const raw = Buffer.from(parsed.signature, "base64");
    raw[10] ^= 0xff;
    parsed.signature = raw.toString("base64");
    const tarball = await buildTarball(FILES, JSON.stringify(parsed));
    await expect(verifyReleaseSignature(tarball, opts())).rejects.toThrow(
      /signature is not valid/i,
    );
  });

  it("rejects a leaf that does not chain to a trusted root", async () => {
    // Valid-looking v2 envelope but the leaf is from a foreign CA, so both the
    // signature (wrong key) and the chain fail; either way it must reject.
    const parsed = JSON.parse(pki.signV2(manifestOf(FILES), "ecdsa-p384-sha384"));
    parsed.certificates.leaf = pki.foreignLeafPem;
    const tarball = await buildTarball(FILES, JSON.stringify(parsed));
    await expect(verifyReleaseSignature(tarball, opts())).rejects.toThrow(ValidationError);
  });

  it("rejects an unknown alg", async () => {
    const parsed = JSON.parse(pki.signV2(manifestOf(FILES), "ecdsa-p384-sha384"));
    parsed.alg = "ed25519";
    const tarball = await buildTarball(FILES, JSON.stringify(parsed));
    await expect(verifyReleaseSignature(tarball, opts())).rejects.toThrow(/unsupported alg/i);
  });
});
