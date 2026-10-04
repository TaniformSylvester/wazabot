import "server-only";

import { siteConfig } from "@/config/site";
import { logServerError } from "@/lib/log";

/*
 * Transactional email through Resend's HTTP API. The key (RESEND_API_KEY) is
 * server-only; without it emails are skipped and logged, never failing the
 * action that triggered them. RESEND_API_URL is for tests (a local fake).
 */

export type Email = { to: string; subject: string; html: string; text: string };

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(email: Email): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[email] skipped (RESEND_API_KEY not set): ${email.subject}`);
    return false;
  }
  const base = (process.env.RESEND_API_URL || "https://api.resend.com").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: siteConfig.email.from, reply_to: siteConfig.email.replyTo, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { name?: string; message?: string } | null;
      logServerError("email.send", { code: String(res.status), message: `${body?.name ?? ""} ${body?.message ?? ""}`.trim().slice(0, 200) });
      return false;
    }
    return true;
  } catch (e) {
    logServerError("email.send", { code: "network", message: e instanceof Error ? e.name : "error" });
    return false;
  }
}

/** Escapes text for the HTML body. */
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * WazaBolt's email frame: logo, a title, rows of content (already-escaped
 * HTML), an optional button. Table layout and inline styles for email apps.
 */
export function emailLayout(opts: { title: string; intro: string; rows?: [string, string][]; button?: { label: string; href: string }; footer: string }) {
  const site = siteConfig.url.replace(/\/$/, "");
  const rows = (opts.rows ?? [])
    .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#526262;font-size:13px;white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:6px 0;color:#102a2a;font-size:14px;">${v}</td></tr>`)
    .join("");
  const button = opts.button
    ? `<p style="margin:24px 0 0;"><a href="${esc(opts.button.href)}" style="display:inline-block;background:#16b878;color:#102a2a;font-weight:bold;font-size:14px;text-decoration:none;padding:12px 20px;border-radius:999px;">${esc(opts.button.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#f4f6f5;font-family:Arial,Helvetica,sans-serif;color:#102a2a;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="width:100%;max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #dfe6e3;">
<tr><td style="padding:24px 24px 0;"><img src="${site}/logo/wazabolt-icon-192.png" width="40" height="40" alt="WazaBolt" style="display:block;border:0;border-radius:10px;"></td></tr>
<tr><td style="padding:16px 24px 24px;">
<h1 style="margin:0 0 8px;font-size:20px;line-height:26px;color:#102a2a;">${esc(opts.title)}</h1>
<p style="margin:0 0 12px;font-size:14px;line-height:21px;color:#2d5757;">${opts.intro}</p>
${rows ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0">${rows}</table>` : ""}
${button}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #dfe6e3;font-size:12px;line-height:18px;color:#526262;">${opts.footer}</td></tr>
</table></body></html>`;
}
