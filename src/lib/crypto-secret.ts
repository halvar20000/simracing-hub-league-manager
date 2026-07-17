// Symmetric encryption for small secrets stored at rest (e.g. a per-plan
// Garage 61 API token). AES-256-GCM. The key comes from GARAGE61_ENC_KEY, a
// 32-byte key given as 64 hex chars or base64. Stored format is a single
// string: "v1:<ivB64>:<tagB64>:<cipherB64>". Server-only — never import into
// client code, and never return a decrypted secret to the browser.

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const PREFIX = "v1";

function readKey(): Buffer | null {
  const raw = process.env.GARAGE61_ENC_KEY;
  if (!raw || raw.trim() === "") return null;
  const s = raw.trim();
  // Accept 64 hex chars or base64 that decodes to 32 bytes.
  if (/^[0-9a-fA-F]{64}$/.test(s)) return Buffer.from(s, "hex");
  try {
    const b = Buffer.from(s, "base64");
    if (b.length === 32) return b;
  } catch {
    /* fall through */
  }
  return null;
}

export function secretEncryptionAvailable(): boolean {
  return readKey() !== null;
}

/** Encrypt a plaintext secret. Throws if no valid key is configured. */
export function encryptSecret(plain: string): string {
  const key = readKey();
  if (!key) throw new Error("GARAGE61_ENC_KEY is not set or is not 32 bytes.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/** Decrypt a value produced by encryptSecret. Returns null on any failure
 *  (bad key, tampered data, wrong format) so callers can degrade gracefully. */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const key = readKey();
  if (!key) return null;
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  try {
    const iv = Buffer.from(parts[1], "base64");
    const tag = Buffer.from(parts[2], "base64");
    const ct = Buffer.from(parts[3], "base64");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(ct), decipher.final()]);
    return out.toString("utf8");
  } catch {
    return null;
  }
}
