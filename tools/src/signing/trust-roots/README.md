# ownCloud code-signing trust roots

These PEM files are the trust anchors the submission signature gate
(`tools/src/signing/verify-signature.ts`) chains app `appinfo/signature.json`
leaf certificates up to. They are vendored (committed) so verification is
hermetic and needs no network access in CI.

Retrieved **2026-07-22**.

## Files

| File                                       | Generation               | Source                                                                                        | Contents                                                                                                                                                   |
| ------------------------------------------ | ------------------------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `owncloud-codesigning-g1.pem`              | **G1** (`ownCloud Inc.`) | `owncloud/core` → `resources/codesigning/root.crt`                                            | Bundle: the G1 _intermediate_ ("ownCloud Code Signing Intermediate Authority") **and** the self-signed G1 _root_ ("ownCloud Code Signing Root Authority"). |
| `owncloud-codesigning-g2-root.pem`         | **G2** (`ownCloud GmbH`) | `owncloud/developer-certificates` → `resources/codesigning/roots/root-g2.crt`                 | Self-signed G2 root ("ownCloud Code Signing Root CA G2"), EC P-384.                                                                                        |
| `owncloud-codesigning-g2-intermediate.pem` | **G2**                   | `owncloud/developer-certificates` → `resources/codesigning/intermediates/intermediate-g2.crt` | G2 intermediate ("ownCloud Code Signing Intermediate CA G2").                                                                                              |

> The `developer-certificates` files are stored via Git LFS, so the GitHub _raw_
> URL returns a 404 pointer — they were fetched through the GitHub Contents API
> (`gh api .../contents/... --jq .content | base64 -d`).

## Validity and the G1 policy

- **G1** root + intermediate **expired 2026-01-31**. Existing app leaf
  certificates issued under G1 remain valid until ~2027, but the CA itself is
  past its `notAfter`. By project decision the gate **verifies the G1 chain
  structurally** (signature linkage leaf → intermediate → root) **but does not
  enforce CA time-validity**, so legacy `occ integrity:sign-app` signatures keep
  passing during the G2 rollout.
- **G2** root is valid **2026-07-15 → 2051**; the intermediate through 2031. G2
  signatures (schema v2, produced by `owncloud/ocsign`) are verified with full
  time-validity.

## Updating

When ownCloud rotates a CA, refresh the corresponding file from the source repo
above and update the retrieval date and validity notes here. Do not hand-edit the
PEM bytes.
