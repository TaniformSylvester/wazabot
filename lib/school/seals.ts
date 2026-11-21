import "server-only";

import sharp from "sharp";

import type { PdfLogo } from "@/lib/documents/pdf/render";
import { logServerError } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * The principal's signature and the school stamp on report cards. Kept in the
 * private "school-seals" bucket: only the server reads and writes it (service
 * role), after the caller's role was checked. Never a public URL; previews are
 * short-lived signed links shown to the school's owners and managers only.
 */

export const SEAL_KINDS = ["signature", "stamp"] as const;
export type SealKind = (typeof SEAL_KINDS)[number];
export const SEAL_COLUMN = { signature: "principal_signature_path", stamp: "school_stamp_path" } as const;
export const SEAL_BUCKET = "school-seals";
export const MAX_SEAL_BYTES = 2 * 1024 * 1024;
export const SEAL_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function isSealKind(v: unknown): v is SealKind {
  return typeof v === "string" && (SEAL_KINDS as readonly string[]).includes(v);
}

/** Only files the server put in this school's own folder for this kind. */
export function sealPathOk(path: string | null | undefined, businessId: string, kind: SealKind): path is string {
  return !!path && path.startsWith(`${businessId}/${kind}/`) && !path.includes("..");
}

/**
 * An upload → a clean PNG (sharp decodes it, so anything that isn't really an
 * image is refused; metadata is dropped; transparency is kept). A signature is
 * at most 900×300, a stamp 600×600 — enough for print, small in the PDF.
 */
export async function normalizeSeal(bytes: Uint8Array, kind: SealKind): Promise<Buffer | null> {
  if (!bytes.length || bytes.length > MAX_SEAL_BYTES) return null;
  try {
    const [w, h] = kind === "signature" ? [900, 300] : [600, 600];
    return await sharp(bytes, { limitInputPixels: 40_000_000, failOn: "error" }).rotate().resize(w, h, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  } catch {
    return null;
  }
}

/** The school's signature and stamp, ready for the PDF (null when not set, unreadable or not configured). */
export async function loadSchoolSeals(businessId: string): Promise<{ signature: PdfLogo; stamp: PdfLogo }> {
  const none = { signature: null, stamp: null };
  const admin = createAdminClient();
  if (!admin) return none;
  const { data, error } = await admin.from("school_settings").select("principal_signature_path, school_stamp_path").eq("business_id", businessId).maybeSingle();
  if (error || !data) return none;
  const load = async (path: string | null, kind: SealKind): Promise<PdfLogo> => {
    if (!sealPathOk(path, businessId, kind)) return null;
    const { data: file, error: dlError } = await admin.storage.from(SEAL_BUCKET).download(path);
    if (dlError || !file) {
      logServerError("school.seals.download", dlError);
      return null;
    }
    const png = await normalizeSeal(new Uint8Array(await file.arrayBuffer()), kind);
    return png ? { data: png, format: "png" } : null;
  };
  const [signature, stamp] = await Promise.all([load(data.principal_signature_path, "signature"), load(data.school_stamp_path, "stamp")]);
  return { signature, stamp };
}

/** Short-lived links to preview the images on the settings page (owners and managers only — the caller checks). */
export async function sealPreviewUrls(businessId: string, paths: { signature: string | null; stamp: string | null }): Promise<{ signature: string | null; stamp: string | null }> {
  const admin = createAdminClient();
  const sign = async (path: string | null, kind: SealKind) => {
    if (!admin || !sealPathOk(path, businessId, kind)) return null;
    const { data, error } = await admin.storage.from(SEAL_BUCKET).createSignedUrl(path, 300);
    if (error) logServerError("school.seals.preview", error);
    return data?.signedUrl ?? null;
  };
  const [signature, stamp] = await Promise.all([sign(paths.signature, "signature"), sign(paths.stamp, "stamp")]);
  return { signature, stamp };
}

/** The settings page's previews: reads the school's paths, then signs them (owners and managers only — the caller checks). */
export async function schoolSealPreviews(businessId: string): Promise<{ signature: string | null; stamp: string | null }> {
  const admin = createAdminClient();
  if (!admin) return { signature: null, stamp: null };
  const { data } = await admin.from("school_settings").select("principal_signature_path, school_stamp_path").eq("business_id", businessId).maybeSingle();
  return sealPreviewUrls(businessId, { signature: data?.principal_signature_path ?? null, stamp: data?.school_stamp_path ?? null });
}
