import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { NotConfiguredError } from "@/lib/messaging/ports";

/*
 * Encrypts WhatsApp access tokens before they are stored (AES-256-GCM).
 * The key lives only in the server environment (WHATSAPP_TOKEN_ENCRYPTION_KEY:
 * 32 random bytes, base64 or hex). The database never sees a usable token.
 *
 * Format: v1:<iv>:<auth tag>:<ciphertext>, each base64url.
 */

const VERSION = "v1";

export function encryptionKey(raw = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY): Buffer {
  const value = raw?.trim();
  if (!value) throw new NotConfiguredError("whatsapp_token_encryption");
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (key.length !== 32) throw new NotConfiguredError("whatsapp_token_encryption");
  return key;
}

export function encryptSecret(plain: string, key = encryptionKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(":");
}

export function decryptSecret(sealed: string, key = encryptionKey()): string {
  const [version, iv, tag, data] = sealed.split(":");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("unsupported secret format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** "…wxyz": lets the team recognise a stored token without seeing it. */
export const tokenHint = (token: string) => token.trim().slice(-4);
