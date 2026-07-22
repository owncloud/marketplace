import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ValidationError } from "../types.js";
import { readTarballEntries, type TarballEntry } from "../package-reader.js";
import { parseSignatureJson, type ParsedSignature } from "./signature-json.js";
import { canonicalV2, legacyEncodeV1 } from "./canonical-manifest.js";
import { verifyRsaPssMixed } from "./rsa-pss.js";

const SIGNATURE_JSON_RE = /(^|\/)appinfo\/signature\.json$/;
const SIGNATURE_JSON_KEY = "appinfo/signature.json";

// OS / file-manager cruft never carried in a manifest by either signer
// (ocsign exclude.go §3.2). Excluded from the on-disk set so their presence
// doesn't count as an "extra, unhashed" file.
const CRUFT_BASENAMES = new Set([".DS_Store", "Thumbs.db", ".directory", ".webapp"]);
const CRUFT_PATTERN = /^\.webapp-owncloud-.*/;

const TRUST_ROOTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "trust-roots");

/** Options for verifyReleaseSignature. */
export interface VerifyOptions {
  /**
   * Directory holding the trusted-root PEMs. Defaults to the vendored
   * `trust-roots/` beside this module. Overridable only so tests can chain
   * against a self-generated CA (no real G2-issued leaves exist yet); production
   * callers must not set it.
   */
  trustRootsDir?: string;
}

/**
 * Verify the ownCloud code-signing signature of one app release tarball. Throws
 * ValidationError (with a publisher-facing message) if any gate fails:
 *
 *  1. the package carries no appinfo/signature.json;
 *  2. the file-hash manifest doesn't match the tarball's actual files;
 *  3. the signature isn't cryptographically valid, or the signing certificate
 *     doesn't chain to a vendored ownCloud code-signing root.
 *
 * Both signature schemas are accepted: v1 (legacy `occ integrity:sign-app`,
 * "G1") and v2 (`ocsign`, "G2"). Resolves on success.
 */
export async function verifyReleaseSignature(
  tarballPath: string,
  opts: VerifyOptions = {},
): Promise<void> {
  const entries = await readTarballEntries(tarballPath);

  // Gate 1: locate the signature file.
  const sigEntry = entries.find((e) => SIGNATURE_JSON_RE.test(e.path));
  if (sigEntry === undefined) {
    throw new ValidationError(
      "package is not signed: no appinfo/signature.json found (sign the app with " +
        "ocsign or `occ integrity:sign-app` before submitting)",
    );
  }
  const rootPrefix = sigEntry.path.slice(0, sigEntry.path.length - SIGNATURE_JSON_KEY.length);

  const parsed = parseSignatureJson(sigEntry.bytes.toString("utf8"));

  // Gate 2: the manifest must match the tarball's files exactly.
  verifyManifest(entries, rootPrefix, parsed.hashes);

  // Gate 3: the signature must verify and the cert must chain to a trusted root.
  await verifyCryptographically(parsed, opts.trustRootsDir ?? TRUST_ROOTS_DIR);
}

/** Gate 2: recompute every file hash and require set- and value-equality. */
function verifyManifest(
  entries: TarballEntry[],
  rootPrefix: string,
  hashes: Record<string, string>,
): void {
  const onDisk = new Map<string, Buffer>();
  for (const e of entries) {
    if (!e.path.startsWith(rootPrefix)) continue;
    const key = e.path.slice(rootPrefix.length);
    if (key === SIGNATURE_JSON_KEY) continue; // excluded from its own manifest
    if (isCruft(key)) continue;
    onDisk.set(key, e.bytes);
  }

  for (const key of onDisk.keys()) {
    if (!(key in hashes)) {
      throw new ValidationError(
        `signature manifest mismatch: file "${key}" is present in the package but not in ` +
          `appinfo/signature.json (the package was modified after signing)`,
      );
    }
  }
  for (const key of Object.keys(hashes)) {
    const bytes = onDisk.get(key);
    if (bytes === undefined) {
      throw new ValidationError(
        `signature manifest mismatch: file "${key}" is listed in appinfo/signature.json but ` +
          `missing from the package`,
      );
    }
    const actual = crypto.createHash("sha512").update(bytes).digest("hex");
    if (!hashEquals(actual, hashes[key])) {
      throw new ValidationError(
        `signature manifest mismatch: file "${key}" does not match its hash in ` +
          `appinfo/signature.json (the file was modified after signing)`,
      );
    }
  }
}

/** Gate 3: verify the signature bytes and the certificate chain. */
async function verifyCryptographically(
  parsed: ParsedSignature,
  trustRootsDir: string,
): Promise<void> {
  const roots = await loadTrustRoots(trustRootsDir);

  if (parsed.kind === "v1") {
    const leaf = parseCert(parsed.certificate, "leaf certificate");
    const message = legacyEncodeV1(parsed.hashes);
    const ok = verifyRsaPssMixed(leaf.publicKey, message, Buffer.from(parsed.signature, "base64"), {
      messageHash: "sha1",
      mgf1Hash: "sha512",
      saltLength: 0,
    });
    if (!ok) {
      throw new ValidationError("signature is not valid: the RSA-PSS signature does not verify");
    }
    // G1 CA expired 2026-01-31; verify the chain structurally but not its time
    // validity, so legacy-signed apps remain acceptable during the G2 rollout.
    verifyChain(leaf, [roots.g1Intermediate], [roots.g1Root], { checkTime: false });
    return;
  }

  // v2
  const leaf = parseCert(parsed.leaf, "leaf certificate");
  const message = canonicalV2(parsed.hashes);
  const sig = Buffer.from(parsed.signature, "base64");
  const ok =
    parsed.alg === "ecdsa-p384-sha384"
      ? crypto.verify("sha384", message, { key: leaf.publicKey, dsaEncoding: "der" }, sig)
      : crypto.verify(
          "sha384",
          message,
          {
            key: leaf.publicKey,
            padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
            saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
          },
          sig,
        );
  if (!ok) {
    throw new ValidationError(
      `signature is not valid: the ${parsed.alg} signature does not verify`,
    );
  }
  const intermediates = parsed.chain.map((pem, i) => parseCert(pem, `chain certificate #${i + 1}`));
  verifyChain(leaf, [...intermediates, roots.g2Intermediate], [roots.g2Root], { checkTime: true });
}

interface TrustRoots {
  g1Intermediate: crypto.X509Certificate;
  g1Root: crypto.X509Certificate;
  g2Intermediate: crypto.X509Certificate;
  g2Root: crypto.X509Certificate;
}
const trustRootsCache = new Map<string, TrustRoots>();

async function loadTrustRoots(dir: string): Promise<TrustRoots> {
  const cached = trustRootsCache.get(dir);
  if (cached !== undefined) return cached;
  const g1 = splitPem(await readFile(join(dir, "owncloud-codesigning-g1.pem"), "utf8"));
  const g2Root = await readFile(join(dir, "owncloud-codesigning-g2-root.pem"), "utf8");
  const g2Int = await readFile(join(dir, "owncloud-codesigning-g2-intermediate.pem"), "utf8");
  const g1Certs = g1.map((pem) => new crypto.X509Certificate(pem));
  // The bundle holds the intermediate then the self-signed root; identify by
  // which one is self-issued rather than relying on order.
  const g1Root = g1Certs.find((c) => c.checkIssued(c));
  const g1Intermediate = g1Certs.find((c) => !c.checkIssued(c));
  if (g1Root === undefined || g1Intermediate === undefined) {
    throw new Error("G1 trust bundle is malformed (expected an intermediate and a root)");
  }
  const roots: TrustRoots = {
    g1Intermediate,
    g1Root,
    g2Intermediate: new crypto.X509Certificate(g2Int),
    g2Root: new crypto.X509Certificate(g2Root),
  };
  trustRootsCache.set(dir, roots);
  return roots;
}

/**
 * Verify that `leaf` chains to one of `roots` via `intermediates`, checking the
 * signature at each hop (and, when checkTime, that every certificate on the path
 * is within its validity window). Throws ValidationError on failure.
 */
function verifyChain(
  leaf: crypto.X509Certificate,
  intermediates: crypto.X509Certificate[],
  roots: crypto.X509Certificate[],
  opts: { checkTime: boolean },
): void {
  const now = Date.now();
  const inWindow = (c: crypto.X509Certificate): boolean =>
    now >= Date.parse(c.validFrom) && now <= Date.parse(c.validTo);

  if (opts.checkTime && !inWindow(leaf)) {
    throw new ValidationError("signing certificate is expired or not yet valid");
  }
  // leaf -> intermediate
  const issuer = intermediates.find((i) => leaf.verify(i.publicKey) && leaf.checkIssued(i));
  if (issuer === undefined) {
    throw new ValidationError(
      "signing certificate does not chain to a trusted ownCloud code-signing authority",
    );
  }
  if (opts.checkTime && !inWindow(issuer)) {
    throw new ValidationError("intermediate certificate is expired or not yet valid");
  }
  // intermediate -> trusted root
  const root = roots.find(
    (r) => issuer.verify(r.publicKey) && issuer.checkIssued(r) && r.checkIssued(r),
  );
  if (root === undefined) {
    throw new ValidationError(
      "signing certificate does not chain to a trusted ownCloud code-signing root",
    );
  }
  if (opts.checkTime && !inWindow(root)) {
    throw new ValidationError("root certificate is expired or not yet valid");
  }
}

function parseCert(pem: string, label: string): crypto.X509Certificate {
  try {
    return new crypto.X509Certificate(pem);
  } catch (err) {
    throw new ValidationError(
      `appinfo/signature.json ${label} is not a valid PEM certificate: ${(err as Error).message}`,
    );
  }
}

function splitPem(bundle: string): string[] {
  const blocks = bundle.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  return blocks ?? [];
}

function isCruft(key: string): boolean {
  const base = key.includes("/") ? key.slice(key.lastIndexOf("/") + 1) : key;
  return CRUFT_BASENAMES.has(base) || CRUFT_PATTERN.test(base);
}

/** Constant-time hex-string comparison for hash digests. */
function hashEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
