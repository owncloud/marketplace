/**
 * Serializers that reproduce the exact bytes an ownCloud code-signing signature
 * was computed over, for the two signature.json schema generations.
 *
 * The signed message is a serialization of the file-hash map. Getting it
 * byte-identical to what the signer produced is the whole game: a single
 * differing byte flips the signature check. Each generation uses a different
 * encoding, transcribed here from the authoritative producers.
 */

/** A file-hash manifest: relative path -> lowercase-hex digest. */
export type Hashes = Record<string, string>;

/**
 * Legacy (schema v1 / "G1") encoding — what PHP `json_encode($hashes)` emits in
 * `occ integrity:sign-app`: compact (no whitespace), keys in insertion order,
 * and forward slashes escaped as `\/` (PHP's default). We reconstruct it from
 * the parsed map, so key order must match the order the keys appear in the
 * signature.json file — see parseSignatureJson, which preserves it.
 */
export function legacyEncodeV1(hashes: Hashes): Buffer {
  // JSON.stringify preserves own-enumerable string-key insertion order, which we
  // seeded from the file's key order. Then escape "/" the way PHP does.
  const compact = JSON.stringify(hashes).replace(/\//g, "\\/");
  return Buffer.from(compact, "utf8");
}

const HEX = "0123456789abcdef";

/**
 * Write one JSON string with the minimal RFC-8259 escaping ocsign uses (spec
 * §3.5): escape only `"`, `\`, and control chars U+0000–U+001F (short forms
 * \b \t \n \f \r, else \u00XX lowercase). `/` and non-ASCII bytes pass through
 * verbatim. Iterates bytes, not code points, matching ocsign's serialize.go.
 */
function writeJsonString(out: number[], s: string): void {
  const bytes = Buffer.from(s, "utf8");
  out.push(0x22); // "
  for (const c of bytes) {
    switch (c) {
      case 0x22:
        out.push(0x5c, 0x22); // \"
        break;
      case 0x5c:
        out.push(0x5c, 0x5c); // \\
        break;
      case 0x08:
        out.push(0x5c, 0x62); // \b
        break;
      case 0x09:
        out.push(0x5c, 0x74); // \t
        break;
      case 0x0a:
        out.push(0x5c, 0x6e); // \n
        break;
      case 0x0c:
        out.push(0x5c, 0x66); // \f
        break;
      case 0x0d:
        out.push(0x5c, 0x72); // \r
        break;
      default:
        if (c < 0x20) {
          out.push(0x5c, 0x75, 0x30, 0x30); // \u00
          out.push(HEX.charCodeAt(c >> 4), HEX.charCodeAt(c & 0x0f));
        } else {
          out.push(c);
        }
    }
  }
  out.push(0x22); // "
}

/**
 * Canonical (schema v2 / "G2") manifest bytes M — ocsign's canonical form (spec
 * §3.5): a compact JSON object with keys sorted by raw UTF-8 byte order, values
 * emitted with minimal escaping, no insignificant whitespace. This is the exact
 * message that was signed.
 *
 * Note: for verification of a real signature.json, the `hashes` value is stored
 * verbatim as these bytes (ocsign's "critical write rule"), so a verifier should
 * prefer signing-checking the raw stored bytes. This function reconstructs M
 * from the parsed map for producing conformance vectors and as a fallback.
 */
export function canonicalV2(hashes: Hashes): Buffer {
  const keys = Object.keys(hashes).sort(byteCompare);
  const out: number[] = [];
  out.push(0x7b); // {
  keys.forEach((key, i) => {
    if (i > 0) out.push(0x2c); // ,
    writeJsonString(out, key);
    out.push(0x3a); // :
    writeJsonString(out, hashes[key]);
  });
  out.push(0x7d); // }
  return Buffer.from(out);
}

/** Compare two strings by their raw UTF-8 bytes (spec §3.5 key ordering). */
function byteCompare(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}
