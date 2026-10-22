import "server-only";

import { createHash } from "node:crypto";

import sharp from "sharp";

import { logServerError } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";

import type { PdfLogo } from "./pdf/render";

/*
 * Server helpers shared by the guest generator and business documents:
 * logo processing (re-encoded, never stored for guests) and the guest rate limit.
 */

export const GUEST_PDFS_PER_HOUR = 30;
export const MAX_LOGO_BYTES = 1024 * 1024;
const LOGO_EDGE = 512;

/**
 * A logo from the browser (data URL) → a small PNG for the PDF. sharp decodes
 * it, so anything that isn't really a PNG/JPEG/WebP image is rejected; metadata
 * is dropped. Returns null (no logo) or "invalid".
 */
export async function logoFromDataUrl(dataUrl: unknown): Promise<PdfLogo | "invalid"> {
  if (dataUrl === undefined || dataUrl === null || dataUrl === "") return null;
  if (typeof dataUrl !== "string") return "invalid";
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return "invalid";
  const bytes = Buffer.from(m[2], "base64");
  if (!bytes.length || bytes.length > MAX_LOGO_BYTES) return "invalid";
  return logoFromBytes(bytes);
}

export async function logoFromBytes(bytes: Uint8Array): Promise<PdfLogo | "invalid"> {
  try {
    const data = await sharp(bytes, { limitInputPixels: 40_000_000, failOn: "error" })
      .rotate()
      .resize(LOGO_EDGE, LOGO_EDGE, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    return { data, format: "png" };
  } catch {
    return "invalid";
  }
}

/** A business logo already in WazaBolt's storage (never an arbitrary URL). */
export async function logoFromStorageUrl(url: string | null | undefined): Promise<PdfLogo> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!url || !base || !url.startsWith(`${base}/storage/v1/object/public/`)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > 5 * MAX_LOGO_BYTES) return null;
    const logo = await logoFromBytes(bytes);
    return logo === "invalid" ? null : logo;
  } catch {
    return null;
  }
}

/** The visitor's address, hashed with a server secret and the day: nothing identifying is stored. */
export function guestKey(ip: string, now = new Date()): string {
  const pepper = process.env.CRON_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "wazabolt";
  return createHash("sha256").update(`${pepper}|${now.toISOString().slice(0, 10)}|${ip}`).digest("hex").slice(0, 40);
}

// Fallback when the database can't be reached (or isn't configured): per-instance memory.
const memory = new Map<string, number[]>();

export async function guestAllowed(key: string): Promise<boolean> {
  const admin = createAdminClient();
  if (admin) {
    const { data, error } = await admin.rpc("guest_document_allowed", { p_key: key, p_limit: GUEST_PDFS_PER_HOUR });
    if (!error) return data === true;
    logServerError("documents.guestRateLimit", error);
  }
  const now = Date.now();
  const hits = (memory.get(key) ?? []).filter((t) => now - t < 3_600_000);
  if (hits.length >= GUEST_PDFS_PER_HOUR) return false;
  hits.push(now);
  memory.set(key, hits);
  if (memory.size > 5000) memory.clear();
  return true;
}
