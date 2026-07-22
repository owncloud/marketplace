import { describe, it, expect } from "vitest";
import { canonicalV2, legacyEncodeV1 } from "../src/signing/canonical-manifest.js";

describe("canonicalV2", () => {
  it("matches the ocsign golden vector byte-for-byte", () => {
    // From owncloud/ocsign testdata/golden/tree-cruft: the hashes map (input)
    // and its canonical serialization (expected output), retrieved 2026-07-22.
    const hashes = {
      "appinfo/info.xml":
        "2fafbce4571514444b5edd26e4ff01e42ddf0e81aacc15fda63f304ff019cff260bd4e5625aac4ac9efe81cbf38086f920ff3b7ba264048b7d62185cbded402a",
      "js/app.js":
        "b5a224757740965d14836f0fdbd774b10dc07acb2da3e996aedab31c28540d17307b4a1057e51ae82ebb6f775bab7d1d02283575800699983a7d91605791d81c",
      "js/mimetypelist.js":
        "9e22dd578eccf272bc2e4fd8fa562c0cf0878cb2d985359f59afa2494de80d3b310693eb0e68846a42c8a00be1a7e997a308904f04a90bbe52371ca19bc0177a",
    };
    const expected =
      '{"appinfo/info.xml":"2fafbce4571514444b5edd26e4ff01e42ddf0e81aacc15fda63f304ff019cff260bd4e5625aac4ac9efe81cbf38086f920ff3b7ba264048b7d62185cbded402a","js/app.js":"b5a224757740965d14836f0fdbd774b10dc07acb2da3e996aedab31c28540d17307b4a1057e51ae82ebb6f775bab7d1d02283575800699983a7d91605791d81c","js/mimetypelist.js":"9e22dd578eccf272bc2e4fd8fa562c0cf0878cb2d985359f59afa2494de80d3b310693eb0e68846a42c8a00be1a7e997a308904f04a90bbe52371ca19bc0177a"}';
    expect(canonicalV2(hashes).toString("utf8")).toBe(expected);
  });

  it("sorts keys by raw byte order regardless of insertion order", () => {
    const out = canonicalV2({ b: "2", a: "1", "a/b": "3" }).toString("utf8");
    // '/' (0x2f) < any letter, so "a/b" sorts before "a"? No: compare byte-wise:
    // "a" vs "a/b": "a" is a prefix, shorter sorts first. Then "a/b", then "b".
    expect(out).toBe('{"a":"1","a/b":"3","b":"2"}');
  });

  it('escapes only " \\ and control chars, leaving / and UTF-8 verbatim', () => {
    const out = canonicalV2({ 'a"b\\c/d': "x" }).toString("utf8");
    expect(out).toBe('{"a\\"b\\\\c/d":"x"}');
  });
});

describe("legacyEncodeV1", () => {
  it("emits compact JSON with escaped forward slashes (PHP json_encode)", () => {
    const out = legacyEncodeV1({ "ajax/admin.php": "ab", "x.php": "cd" }).toString("utf8");
    expect(out).toBe('{"ajax\\/admin.php":"ab","x.php":"cd"}');
  });

  it("preserves insertion order", () => {
    const out = legacyEncodeV1({ z: "1", a: "2" }).toString("utf8");
    expect(out).toBe('{"z":"1","a":"2"}');
  });
});
