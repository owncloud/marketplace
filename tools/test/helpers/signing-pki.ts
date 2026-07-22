import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import crypto from "node:crypto";
import { canonicalV2, legacyEncodeV1, type Hashes } from "../../src/signing/canonical-manifest.js";

/**
 * A synthetic ownCloud-style code-signing PKI for tests. Real G1/G2 leaves can't
 * be issued (we don't hold the CA keys), so we stand up our own root +
 * intermediate + leaf hierarchies with openssl and point the verifier's
 * trustRootsDir at them. The layout mirrors the vendored trust-roots/ dir.
 */
export interface TestPki {
  /** Directory laid out like src/signing/trust-roots/ — pass as trustRootsDir. */
  trustRootsDir: string;
  /** Produce a v1 (legacy RSA-PSS sha1/mgf512/salt0) signature.json for a manifest. */
  signV1(hashes: Hashes): string;
  /** Produce a v2 (ocsign) signature.json for a manifest. */
  signV2(hashes: Hashes, alg: "ecdsa-p384-sha384" | "rsa-pss-sha384"): string;
  /** A well-formed leaf PEM that does NOT chain to any trusted root. */
  foreignLeafPem: string;
  cleanup(): void;
}

export function makeTestPki(): TestPki {
  const dir = mkdtempSync(join(tmpdir(), "pki-"));
  const ossl = (args: string[], input?: Buffer): Buffer =>
    // stdio: capture stdout (some commands emit the signature there); silence
    // stderr, which openssl floods with key-generation progress dots.
    execFileSync("openssl", args, { cwd: dir, input, stdio: ["pipe", "pipe", "ignore"] });
  const read = (f: string): Buffer => readFileSync(join(dir, f));

  const makeRoot = (name: string, keyArgs: string[], subj: string): void => {
    ossl([
      "req",
      "-x509",
      "-newkey",
      ...keyArgs,
      "-keyout",
      `${name}.key`,
      "-out",
      `${name}.crt`,
      "-days",
      "3650",
      "-nodes",
      "-subj",
      subj,
      "-addext",
      "basicConstraints=critical,CA:TRUE",
      "-addext",
      "keyUsage=critical,keyCertSign,cRLSign",
    ]);
  };
  const makeSigned = (
    name: string,
    keyArgs: string[],
    subj: string,
    caName: string,
    isCa: boolean,
  ): void => {
    ossl([
      "req",
      "-newkey",
      ...keyArgs,
      "-keyout",
      `${name}.key`,
      "-out",
      `${name}.csr`,
      "-nodes",
      "-subj",
      subj,
    ]);
    writeFileSync(
      join(dir, `${name}.ext`),
      isCa
        ? "basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n"
        : "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\n",
    );
    ossl([
      "x509",
      "-req",
      "-in",
      `${name}.csr`,
      "-CA",
      `${caName}.crt`,
      "-CAkey",
      `${caName}.key`,
      "-CAcreateserial",
      "-out",
      `${name}.crt`,
      "-days",
      "3650",
      "-extfile",
      `${name}.ext`,
    ]);
  };

  // G1 hierarchy (RSA, legacy scheme). G2 hierarchy (EC P-384 CAs; a leaf per alg).
  makeRoot("g1root", ["rsa:2048"], "/CN=Test G1 Root");
  makeSigned("g1int", ["rsa:2048"], "/CN=Test G1 Intermediate", "g1root", true);
  makeSigned("g1leaf", ["rsa:2048"], "/CN=testapp", "g1int", false);
  makeRoot("g2root", ["ec", "-pkeyopt", "ec_paramgen_curve:P-384"], "/CN=Test G2 Root");
  makeSigned(
    "g2int",
    ["ec", "-pkeyopt", "ec_paramgen_curve:P-384"],
    "/CN=Test G2 Intermediate",
    "g2root",
    true,
  );
  makeSigned(
    "g2leafec",
    ["ec", "-pkeyopt", "ec_paramgen_curve:P-384"],
    "/CN=testapp",
    "g2int",
    false,
  );
  makeSigned("g2leafrsa", ["rsa:2048"], "/CN=testapp", "g2int", false);
  // A foreign leaf under an unrelated CA (for chain-rejection tests).
  makeRoot("foreignroot", ["rsa:2048"], "/CN=Foreign Root");
  makeSigned("foreignleaf", ["rsa:2048"], "/CN=testapp", "foreignroot", false);

  // Lay out the trust-roots dir the verifier expects.
  const trustRootsDir = join(dir, "trust-roots");
  mkdirSync(trustRootsDir, { recursive: true });
  writeFileSync(
    join(trustRootsDir, "owncloud-codesigning-g1.pem"),
    Buffer.concat([read("g1int.crt"), Buffer.from("\n"), read("g1root.crt")]),
  );
  writeFileSync(join(trustRootsDir, "owncloud-codesigning-g2-root.pem"), read("g2root.crt"));
  writeFileSync(join(trustRootsDir, "owncloud-codesigning-g2-intermediate.pem"), read("g2int.crt"));

  const g2IntPem = read("g2int.crt").toString("utf8");

  return {
    trustRootsDir,
    foreignLeafPem: read("foreignleaf.crt").toString("utf8"),

    signV1(hashes: Hashes): string {
      const message = legacyEncodeV1(hashes);
      writeFileSync(join(dir, "v1data.bin"), message);
      // Node can't produce mixed-MGF PSS; openssl signs with the legacy params
      // (sha1 digest, MGF1-SHA-512, salt 0). Raw signature goes to stdout.
      const sig = ossl([
        "dgst",
        "-sha1",
        "-sign",
        "g1leaf.key",
        "-sigopt",
        "rsa_padding_mode:pss",
        "-sigopt",
        "rsa_mgf1_md:sha512",
        "-sigopt",
        "rsa_pss_saltlen:0",
        "v1data.bin",
      ]);
      return JSON.stringify({
        hashes,
        signature: sig.toString("base64"),
        certificate: read("g1leaf.crt").toString("utf8"),
      });
    },

    signV2(hashes: Hashes, alg): string {
      const M = canonicalV2(hashes);
      let signature: Buffer;
      let leaf: string;
      if (alg === "ecdsa-p384-sha384") {
        signature = crypto.sign("sha384", M, {
          key: crypto.createPrivateKey(read("g2leafec.key")),
          dsaEncoding: "der",
        });
        leaf = read("g2leafec.crt").toString("utf8");
      } else {
        signature = crypto.sign("sha384", M, {
          key: crypto.createPrivateKey(read("g2leafrsa.key")),
          padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
        });
        leaf = read("g2leafrsa.crt").toString("utf8");
      }
      return JSON.stringify({
        v: 2,
        alg,
        hashes,
        signature: signature.toString("base64"),
        certificates: { leaf, chain: [g2IntPem] },
      });
    },

    cleanup(): void {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
