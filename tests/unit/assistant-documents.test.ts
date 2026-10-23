import { describe, expect, it } from "vitest";

import { assistantTools } from "@/lib/ai/claude";
import { assistantReplySchema } from "@/lib/ai/reply-schema";
import { SENDABLE_DOC_STATUSES, SENDABLE_DOC_TYPES } from "@/lib/ai/tools/registry";

const names = (documents: boolean) => assistantTools(true, false, documents).map((t) => t.name);

describe("assistant documents (Phase 4)", () => {
  it("offers findMyDocuments only when the business allows it", () => {
    expect(names(true)).toContain("findMyDocuments");
    expect(names(false)).not.toContain("findMyDocuments");
    // Tools stay sorted (cacheable prefix) with send_reply last.
    expect(names(true).at(-1)).toBe("send_reply");
  });

  it("sends only issued invoices and receipts — never drafts, voided documents or quotations", () => {
    expect([...SENDABLE_DOC_TYPES]).toEqual(["invoice", "receipt"]);
    expect(SENDABLE_DOC_STATUSES).not.toContain("draft");
    expect(SENDABLE_DOC_STATUSES).not.toContain("voided");
  });

  it("send_documents is optional, at most 3", () => {
    const base = { reply: "Voici", reply_language: "fr", customer_languages: ["fr"], language_request: null, catalog_product_ids: [], needs_human: false, handoff_reason: null };
    expect(assistantReplySchema.safeParse(base).success).toBe(true);
    expect(assistantReplySchema.safeParse({ ...base, send_documents: ["a", "b", "c"] }).success).toBe(true);
    expect(assistantReplySchema.safeParse({ ...base, send_documents: ["a", "b", "c", "d"] }).success).toBe(false);
  });
});
