# WazaBolt — Phase 4 report: WhatsApp assistant and documents

Phase 4 of `WAZABOLT_EXPANSION_PLAN.md`, built 23 October 2026. When a customer asks on WhatsApp
for an invoice or a receipt, the assistant sends them the PDF — only documents the business has
already issued **to that customer**, rendered by the same documents engine.

Owner decisions applied:
- **Existing documents only.** The assistant never creates, issues or changes a document. If none exists, it tells the customer the team will prepare it and flags the conversation for the team. It keeps answering.
- **On by default** for businesses using the assistant. Owners and admins can switch it off under AI Assistant → "Send invoices and receipts".
- **Invoices and payment receipts only,** including school fee invoices and their receipts sent to a parent. Quotations and statements stay with the team.

No price, plan or limit changed. Sending a document doesn't create a document, so it never counts toward the Free plan's 20 saved documents.

## 1. What's implemented

- **Tool `findMyDocuments`** (`lib/ai/tools/registry.ts`):
  - Returns THIS customer's issued invoices and receipts, newest first, at most 5. Optional filters: one order number or one document number.
  - The query is limited to this business and to the conversation's customer (`customer_id`).
  - Only types `invoice` and `receipt`, with status issued, partially paid or paid. Drafts, voided documents and quotations are never returned.
  - If nothing matches, it flags the conversation for the team (`human_requested`, the assistant stays on). In the test chat (dry run) nothing is flagged.
  - The tool is only offered to the model when the setting is on.
- **Reply field `send_documents`** (at most 3 document ids).
  - The server keeps only ids that `findMyDocuments` returned **in this turn**.
  - Before sending, it checks again: same business, same customer, invoice or receipt, issued status.
  - So a document id the model makes up, or names for another customer, is never sent. This is tested end to end.
- **Sending** (`lib/ai/pipeline.ts`):
  - Happens after the assistant's text reply, inside the 24-hour window. The assistant only ever replies inside it.
  - The PDF is rendered by `renderDocumentPdf` (the business's logo, the document's own language and template), uploaded to WhatsApp, and sent as a document message. The caption reads "Invoice INV-2026-000001 — Business".
  - Each PDF is recorded on the conversation as an assistant message, linked to the document in the inbox.
  - It's counted as a free service message and audited (`document.sent_whatsapp`, `by: assistant`).
  - A failed send is recorded as failed. Nothing is reported as sent unless WhatsApp accepted it.
- **Prompt:** one rule in the platform prompt. It says how to use the tool and to never invent a document or promise a date.
- **Settings:** AI Assistant → "Send invoices and receipts" (EN/FR), with a short explanation.
- **Human handover is unchanged.**
  - With the setting off, these requests go to the team.
  - "Talk to a person" still hands over.
  - Staff can still send any document from the dashboard (Phase 2).

## 2. Files

- **Database:**
  - `supabase/migrations/20261023120000_whatsapp_documents.sql` (new).
  - `supabase/tests/whatsapp_documents.sql` (new, 3 checks).
  - `package.json` (`test:db`).
  - `types/supabase.ts` (regenerated).
- **Assistant:**
  - `lib/ai/tools/registry.ts`: `findMyDocuments`, `SENDABLE_DOC_TYPES`, `SENDABLE_DOC_STATUSES`.
  - `lib/ai/reply-schema.ts`: `send_documents`.
  - `lib/ai/claude.ts`: the tool is offered only when allowed; the document ids each turn returned are collected.
  - `lib/ai/service.ts`: `documentIds` on the result.
  - `lib/ai/context.ts`: the `sendDocuments` setting.
  - `lib/ai/pipeline.ts`: `sendCustomerDocuments`.
  - `lib/ai/prompts/system-prompt.ts`.
- **UI:**
  - `app/[lang]/dashboard/ai/page.tsx` and `lib/validation/app.ts` (the setting).
  - `messages/en.ts`, `messages/fr.ts`.
  - A comment in the conversation page; documents sent by the assistant already show there.
- **Tests:**
  - `tests/unit/assistant-documents.test.ts` (new).
  - Fixtures in `tests/unit/{claude-responder,reply-budget,rules}.test.ts` and `lib/simulation/businesses.ts`.
  - `tests/e2e/fake-anthropic.mjs`: a document request scenario.
  - `tests/e2e/ai.e2e.mjs`: section 2c.
- **Docs:** this file, and `WAZABOLT_EXPANSION_PLAN.md` (Phase 4 marked built).

## 3. Database changes (one additive migration)

- `ai_settings.send_documents boolean not null default true`.
  - Owners and admins can update it (column grant; the existing "admins update" policy applies).
  - Existing businesses get `true`.

Nothing else changes.

## 4. Environment variables

None new.

## 5. Setup

1. Run `supabase/migrations/20261023120000_whatsapp_documents.sql` in the Supabase SQL Editor.
2. Deploy.

Nothing to configure. Owners who don't want it switch it off in AI Assistant settings.

## 6. Tests performed

- **SQL** (`supabase/tests/whatsapp_documents.sql`, 3 checks): on by default; an agent can't change it; the owner switches it off.
- **SQL, all suites:** 187 checks pass.
- **Unit:**
  - The tool is offered only when allowed, and `send_reply` stays last.
  - Only issued invoices and receipts are sendable.
  - `send_documents` is optional and capped at 3.
  - All unit tests pass (220).
- **End to end** (`tests/e2e/ai.e2e.mjs` section 2c, with fake WhatsApp and Claude):
  - No invoice yet: the assistant creates nothing. It says the team will prepare it, the conversation is flagged, and the assistant keeps answering.
  - The team issues the order's invoice; another customer has his own invoice.
  - "The invoice for ORD-00001?": `findMyDocuments` for that order, then a reply. The PDF is uploaded and sent as a WhatsApp document (real PDF, named after the document number).
  - The PDF is recorded on the conversation as the assistant's, with the document id, and audited.
  - The other customer's invoice, named by id by the model, is **not** sent.
  - Switched off: the tool isn't offered, nothing is sent, the request goes to the team.
  - The setting shows as on by default on the AI Assistant page.
- **Full regression of every suite:** see the hand-over message.

## 7. Known limitations

- **Inside the 24-hour window only,** like every assistant reply. Outside it, WhatsApp needs an approved template with a document, which isn't set up yet (same as Phase 2).
- **The test chat** has no real customer, so `findMyDocuments` finds nothing there and nothing is sent. The real flow is covered by the end-to-end test above.
- **One customer per WhatsApp number.** Documents are matched to the conversation's customer record. A parent whose school fee invoices were billed to another customer record (another number) won't get them from this number.
- **Statements and quotations** are not sent by the assistant (as decided). Staff can send them from the dashboard.

## 8. Outstanding and next steps

1. Owner: run the migration, then approve the push.
2. ~~Document-language fallback inconsistency~~: fixed 25 October 2026 (English for non-French businesses everywhere), see `docs/wazabolt-cleanups-oct2026.md`.
3. Possible next steps:
   - An approved WhatsApp template with a document, so documents can be sent outside the 24-hour window.
   - Phase 5 (industry modules), only once demand is confirmed.
