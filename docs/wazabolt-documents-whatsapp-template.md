# Documents on WhatsApp outside the 24-hour window (28 October 2026)

**Problem.** WhatsApp only accepts a normal message within 24 hours of the customer's last message. After that, only templates approved by Meta can be sent. Until now an invoice, receipt, statement or report card couldn't be sent to a customer (or parent) who hadn't written recently.

**Fix.** There's a new standard template, **Documents** (`wazabolt_document`), in English and French. It has the PDF in its header and this message:

- **English:** "Hello {{1}}, here is your {{2}} from {{3}}. Reply here if you have any questions."
- **French:** « Bonjour {{1}}, voici votre {{2}} de {{3}}. Répondez ici si vous avez des questions. »

The three parameters are filled when sending:

- {{1}}: the customer's name;
- {{2}}: what the document is, for example "invoice INV-2026-000041", "statement of account", or "report card for Ngo Marie (Term 1)";
- {{3}}: the business name.

## How a business gets it

1. Go to **WhatsApp → Notifications → Submit templates to Meta**, the same button as the order and appointment templates. Documents is now one of the rows, so there are 18 templates instead of 16.
2. A document template needs an example file for Meta's review. WazaBolt uploads a one-page sample invoice PDF once, using Meta's resumable upload on the business's own app, then submits the template with category UTILITY.
3. Meta reviews it. The status shows in the table, through **Refresh status** or Meta's webhook.

Businesses that had already submitted their templates just press **Submit templates to Meta** again. Approved templates aren't submitted twice.

## Sending

| When | What is sent |
|---|---|
| Customer wrote in the last 24 hours | The PDF as a normal document message with its caption (unchanged) |
| More than 24 hours, Documents template approved | The PDF with the template, in the customer's language (French for French speakers, English otherwise, or whichever language is approved) |
| More than 24 hours, no approved template | Nothing is sent. The page says why and links to the template setup |

This applies to:

- invoices, receipts and quotations;
- statements of account;
- report cards.

The documents the AI assistant sends are unchanged: it only sends while the customer is chatting, which is inside the window.

On the invoice and statement pages, the WhatsApp panel says when the PDF will go with the template, and the button is on.

## Costs and records

- **Cost.** A template message is a **utility** message. Meta charges it to the business's own WhatsApp account. Messages inside the window are free service messages.
- **Where it shows.** It appears in the customer's conversation with the template's words. It's recorded as `utility` and counted in WhatsApp usage, and the audit log has `channel: "template"`.
- **Nothing faked.** It's only marked as sent once WhatsApp accepts it.

## Changes

- **Migration** `20261028120000_document_template.sql`: the template kinds accept `document`. It's additive and changes no data.
- `lib/notifications/templates.ts`: `TEMPLATE_KINDS` (the notifications plus `document`) and the template definition, with a `DOCUMENT` header.
- `lib/notifications/sample-pdf.ts`: the example PDF for Meta's review.
- `lib/whatsapp/graph.ts`:
  - `uploadExampleFile`: the app id, an upload session, then the bytes;
  - `createTemplate` with a document header;
  - `sendTemplate` with the PDF.
- `lib/documents/whatsapp.ts`: the template is used outside the window.
- The callers pass the label in English and French.
- The WhatsApp panel and the error message explain the template route.

## Tests

- **Unit:** the template follows Meta's rules, renders correctly in both languages, the sample PDF is valid, and the Graph calls are built correctly (upload, create, send).
- **E2E `notifications`:** 18 templates are submitted. The two Documents templates have a DOCUMENT header with the uploaded sample's handle, and one sample PDF was uploaded.
- **E2E `documents-links`:** three days after the customer's last message, with the approved template:
  - the page says the PDF goes with the template;
  - sending uploads the PDF and sends the template, with the PDF in the header and the customer, invoice and business filled in;
  - the message is recorded as a sent utility message and audited.

**Not yet checked on the real network.** The Meta calls were tested against the local fake WhatsApp server. Before relying on it, check it once on a live number: submit the templates, wait for approval, then send an invoice to a customer who hasn't written for more than a day.
