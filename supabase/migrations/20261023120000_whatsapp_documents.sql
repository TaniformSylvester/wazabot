-- =============================================================================
-- Phase 4 — WhatsApp assistant and documents (owner decisions, 23 October 2026).
-- Additive: one setting.
--
-- The assistant may send a customer, on WhatsApp, the invoices and payment
-- receipts the business has already issued to that customer (school fee
-- invoices to a parent included). It never creates or changes a document:
-- if none exists, it says the team will prepare it and flags the conversation.
-- Quotations and statements stay with the team.
--
-- On by default for businesses using the assistant; owners and admins can
-- switch it off (AI Assistant settings).
-- =============================================================================

alter table public.ai_settings
  add column send_documents boolean not null default true;

comment on column public.ai_settings.send_documents is 'The WhatsApp assistant may send the customer their issued invoices and receipts.';

grant update (send_documents) on public.ai_settings to authenticated;
