import crypto from "node:crypto";
import type { KeyObject } from "node:crypto";

/**
 * Verify an RSA-PSS signature where the message-digest hash and the MGF1 hash
 * differ — the legacy ownCloud (schema v1) scheme uses SHA-1 for the message
 * digest but MGF1-SHA-512 with a zero-length salt. Node's `crypto.verify` cannot
 * express a mixed digest/MGF1 pair (its `mgf1Hash` option is silently ignored at
 * verify time), so we recover the encoded message with a raw public-key
 * transform and run EMSA-PSS-VERIFY (RFC 8017 §9.1.2) with the exact parameters.
 *
 * For the uniform-hash cases (v2: SHA-384 message + MGF1-SHA-384) the standard
 * `crypto.verify` path is correct and used directly; this helper exists only for
 * the mixed-hash legacy signatures.
 */
export function verifyRsaPssMixed(
  publicKey: KeyObject,
  message: Buffer,
  signature: Buffer,
  params: { messageHash: string; mgf1Hash: string; saltLength: number },
): boolean {
  const details = publicKey.asymmetricKeyDetails;
  if (publicKey.asymmetricKeyType !== "rsa" || details?.modulusLength === undefined) {
    return false;
  }
  const modBits = details.modulusLength;

  // s^e mod n, left-padded to the modulus size.
  let em: Buffer;
  try {
    em = crypto.publicDecrypt(
      { key: publicKey, padding: crypto.constants.RSA_NO_PADDING },
      signature,
    );
  } catch {
    return false;
  }

  const emBits = modBits - 1;
  const emLen = Math.ceil(emBits / 8);
  // publicDecrypt returns modulus-length bytes; align to emLen.
  const EM = em.length >= emLen ? Buffer.from(em.subarray(em.length - emLen)) : leftPad(em, emLen);

  const hLen = crypto.createHash(params.messageHash).digest().length;
  const sLen = params.saltLength;
  if (EM.length < hLen + sLen + 2) return false;
  if (EM[EM.length - 1] !== 0xbc) return false;

  const maskedDB = EM.subarray(0, EM.length - hLen - 1);
  const H = EM.subarray(EM.length - hLen - 1, EM.length - 1);

  const dbMask = mgf1(H, maskedDB.length, params.mgf1Hash);
  const DB = Buffer.from(maskedDB);
  for (let i = 0; i < DB.length; i++) DB[i] ^= dbMask[i];

  // Zero the leftmost (8*emLen - emBits) bits of DB.
  const zeroBits = 8 * emLen - emBits;
  DB[0] &= 0xff >> zeroBits;

  const psLen = DB.length - sLen - 1;
  for (let i = 0; i < psLen; i++) {
    if (DB[i] !== 0x00) return false;
  }
  if (DB[psLen] !== 0x01) return false;

  const salt = DB.subarray(DB.length - sLen);
  const mHash = crypto.createHash(params.messageHash).update(message).digest();
  const mPrime = Buffer.concat([Buffer.alloc(8), mHash, salt]);
  const hPrime = crypto.createHash(params.messageHash).update(mPrime).digest();
  return H.equals(hPrime);
}

/** MGF1 mask generation function (RFC 8017 Appendix B.2.1). */
function mgf1(seed: Buffer, length: number, hashAlg: string): Buffer {
  const parts: Buffer[] = [];
  let total = 0;
  for (let counter = 0; total < length; counter++) {
    const c = Buffer.alloc(4);
    c.writeUInt32BE(counter, 0);
    const block = crypto.createHash(hashAlg).update(seed).update(c).digest();
    parts.push(block);
    total += block.length;
  }
  return Buffer.concat(parts).subarray(0, length);
}

function leftPad(buf: Buffer, len: number): Buffer {
  if (buf.length >= len) return buf;
  return Buffer.concat([Buffer.alloc(len - buf.length), buf]);
}
