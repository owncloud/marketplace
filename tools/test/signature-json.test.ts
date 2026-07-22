import { describe, it, expect } from "vitest";
import { parseSignatureJson } from "../src/signing/signature-json.js";
import { ValidationError } from "../src/types.js";

describe("parseSignatureJson", () => {
  it("detects the legacy v1 shape", () => {
    const parsed = parseSignatureJson(
      JSON.stringify({ hashes: { "a.php": "aa" }, signature: "c2ln", certificate: "PEM" }),
    );
    expect(parsed.kind).toBe("v1");
    if (parsed.kind === "v1") {
      expect(parsed.hashes).toEqual({ "a.php": "aa" });
      expect(parsed.certificate).toBe("PEM");
    }
  });

  it("detects the v2 shape and parses the chain", () => {
    const parsed = parseSignatureJson(
      JSON.stringify({
        v: 2,
        alg: "ecdsa-p384-sha384",
        hashes: { "a.js": "aa" },
        signature: "c2ln",
        certificates: { leaf: "LEAF", chain: ["INT"] },
      }),
    );
    expect(parsed.kind).toBe("v2");
    if (parsed.kind === "v2") {
      expect(parsed.alg).toBe("ecdsa-p384-sha384");
      expect(parsed.leaf).toBe("LEAF");
      expect(parsed.chain).toEqual(["INT"]);
    }
  });

  it("throws on malformed JSON", () => {
    expect(() => parseSignatureJson("{not json")).toThrow(ValidationError);
  });

  it("throws on an unsupported v2 alg", () => {
    expect(() =>
      parseSignatureJson(
        JSON.stringify({
          v: 2,
          alg: "rsa-sha1",
          hashes: {},
          signature: "x",
          certificates: { leaf: "L" },
        }),
      ),
    ).toThrow(/unsupported alg/i);
  });

  it("throws on an unsupported schema version", () => {
    expect(() =>
      parseSignatureJson(
        JSON.stringify({
          v: 3,
          alg: "ecdsa-p384-sha384",
          hashes: {},
          signature: "x",
          certificates: { leaf: "L" },
        }),
      ),
    ).toThrow(/schema version/i);
  });

  it("throws when v1 is missing a required field", () => {
    expect(() =>
      parseSignatureJson(JSON.stringify({ hashes: { a: "b" }, signature: "x" })),
    ).toThrow(/certificate/i);
  });
});
