import { ValidationError } from "../types.js";
import type { Hashes } from "./canonical-manifest.js";

/**
 * The two signature.json schema generations, discriminated by shape.
 *
 * - v1 ("G1", legacy `occ integrity:sign-app`): { hashes, signature, certificate }.
 *   The signed bytes are the *compact* `json_encode(hashes)`.
 * - v2 ("G2", ocsign): { v:2, alg, hashes, signature, certificates:{leaf,chain[]} }.
 *   The signed bytes are the canonical manifest M (see canonicalV2).
 *
 * In both cases the signed message is a serialization of the `hashes` map, which
 * verify reconstructs (canonicalV2 / legacyEncodeV1) from the parsed map. That
 * reconstruction is safe here because the gate independently recomputes every
 * file hash (Gate 2) before the crypto check, so the map it serializes is the
 * true file-hash set, and the serializers are byte-conformance-tested against
 * the producers' own vectors.
 */
export type ParsedSignature =
  | {
      kind: "v1";
      hashes: Hashes;
      /**
       * The hash keys in the exact order they appear in signature.json. The v1
       * signed message is a reconstruction of PHP's `json_encode($hashes)`, which
       * preserves array order; a plain parsed object reorders integer-like keys,
       * so we carry the file's literal order to reproduce the signed bytes.
       */
      keyOrder: string[];
      /** base64 RSA-PSS signature. */
      signature: string;
      /** PEM leaf certificate. */
      certificate: string;
    }
  | {
      kind: "v2";
      alg: "ecdsa-p384-sha384" | "rsa-pss-sha384";
      hashes: Hashes;
      /** base64 signature (DER ECDSA or RSA-PSS). */
      signature: string;
      /** PEM leaf certificate. */
      leaf: string;
      /** PEM intermediate certificate(s), in chain order. */
      chain: string[];
    };

const V2_ALGS = new Set(["ecdsa-p384-sha384", "rsa-pss-sha384"]);

/**
 * Parse and shape-detect a signature.json document. Throws ValidationError with
 * a publisher-facing message on malformed JSON, missing/mistyped fields, or an
 * unknown schema/algorithm.
 */
export function parseSignatureJson(text: string): ParsedSignature {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (err) {
    throw new ValidationError(
      `appinfo/signature.json is not valid JSON: ${(err as Error).message}`,
    );
  }
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    throw new ValidationError("appinfo/signature.json must be a JSON object");
  }
  const obj = doc as Record<string, unknown>;

  // Schema v2 is identified by its version marker / envelope fields; anything
  // else is treated as the legacy v1 shape.
  if ("v" in obj || "certificates" in obj || "alg" in obj) {
    return parseV2(obj);
  }
  return parseV1(obj, text);
}

function parseV1(obj: Record<string, unknown>, text: string): ParsedSignature {
  const hashes = requireHashes(obj.hashes);
  const signature = requireNonEmptyString(obj.signature, "signature");
  const certificate = requireNonEmptyString(obj.certificate, "certificate");
  // Recover the file's literal key order (see ParsedSignature.keyOrder). Fall
  // back to parsed-object order if the scan can't line up with the parsed keys.
  const scanned = scanHashKeyOrder(text);
  const keyOrder =
    scanned !== undefined && sameKeySet(scanned, hashes) ? scanned : Object.keys(hashes);
  return { kind: "v1", hashes, keyOrder, signature, certificate };
}

/**
 * Return the keys of the top-level `hashes` object in the order they appear in
 * the raw JSON text, or undefined if the structure can't be located. Needed
 * because JSON.parse reorders integer-like keys, but the v1 signed message
 * follows PHP's array (insertion) order. String-aware so braces/quotes inside
 * key or value strings don't confuse the scan.
 */
function scanHashKeyOrder(text: string): string[] | undefined {
  const marker = /"hashes"\s*:\s*\{/g;
  const m = marker.exec(text);
  if (m === null) return undefined;
  let i = m.index + m[0].length; // first byte after the opening "{"
  const keys: string[] = [];
  let expectKey = true;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "}") break; // end of the hashes object
    if (ch === '"') {
      const { value, end } = readJsonString(text, i);
      if (end === -1) return undefined; // unterminated string → give up
      if (expectKey) keys.push(value);
      i = end;
      continue;
    }
    if (ch === ":") expectKey = false;
    else if (ch === ",") expectKey = true;
    i++;
  }
  return keys;
}

/**
 * Read a JSON string starting at the opening quote `text[start]`. Returns the
 * unescaped value and the index just past the closing quote (`end`), or
 * `end === -1` if the string is unterminated.
 */
function readJsonString(text: string, start: number): { value: string; end: number } {
  let i = start + 1;
  let raw = '"';
  while (i < text.length) {
    const ch = text[i];
    raw += ch;
    if (ch === "\\") {
      // Copy the escaped char verbatim; JSON.parse below un-escapes it.
      if (i + 1 < text.length) raw += text[i + 1];
      i += 2;
      continue;
    }
    if (ch === '"') {
      try {
        return { value: JSON.parse(raw) as string, end: i + 1 };
      } catch {
        return { value: "", end: -1 };
      }
    }
    i++;
  }
  return { value: "", end: -1 };
}

function sameKeySet(order: string[], hashes: Hashes): boolean {
  const keys = Object.keys(hashes);
  if (order.length !== keys.length) return false;
  const set = new Set(order);
  return set.size === order.length && keys.every((k) => set.has(k));
}

function parseV2(obj: Record<string, unknown>): ParsedSignature {
  if (obj.v !== 2) {
    throw new ValidationError(
      `appinfo/signature.json declares unsupported schema version ${JSON.stringify(obj.v)} (expected 2)`,
    );
  }
  const alg = requireNonEmptyString(obj.alg, "alg");
  if (!V2_ALGS.has(alg)) {
    throw new ValidationError(`appinfo/signature.json declares unsupported alg "${alg}"`);
  }
  const hashes = requireHashes(obj.hashes);
  const signature = requireNonEmptyString(obj.signature, "signature");

  const certs = obj.certificates;
  if (typeof certs !== "object" || certs === null || Array.isArray(certs)) {
    throw new ValidationError("appinfo/signature.json is missing the certificates object");
  }
  const certsObj = certs as Record<string, unknown>;
  const leaf = requireNonEmptyString(certsObj.leaf, "certificates.leaf");
  const chainRaw = certsObj.chain ?? [];
  if (!Array.isArray(chainRaw) || chainRaw.some((c) => typeof c !== "string")) {
    throw new ValidationError(
      "appinfo/signature.json certificates.chain must be an array of PEM strings",
    );
  }
  return {
    kind: "v2",
    alg: alg as "ecdsa-p384-sha384" | "rsa-pss-sha384",
    hashes,
    signature,
    leaf,
    chain: chainRaw as string[],
  };
}

function requireHashes(value: unknown): Hashes {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError("appinfo/signature.json is missing a valid hashes object");
  }
  const out: Hashes = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v !== "string") {
      throw new ValidationError(`appinfo/signature.json hash for "${k}" is not a string`);
    }
    out[k] = v;
  }
  return out;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ValidationError(`appinfo/signature.json is missing required field "${field}"`);
  }
  return value;
}
