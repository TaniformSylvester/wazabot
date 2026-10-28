-- WazaBolt — documents on WhatsApp outside the 24-hour window.
--
-- WhatsApp only accepts approved templates once 24 hours have passed since the
-- customer's last message. A new standard template, "document" (a PDF in the
-- header and a short message, English and French), is submitted with the
-- other notification templates; once Meta approves it, invoices, receipts,
-- statements and report cards can be sent at any time.
--
-- Additive: the template kinds accept one more value. Nothing is removed or
-- rewritten.

alter table public.whatsapp_templates drop constraint whatsapp_templates_kind_check;
alter table public.whatsapp_templates add constraint whatsapp_templates_kind_check
  check (kind in ('order_confirmed', 'order_ready', 'order_out_for_delivery', 'order_delivered',
                  'appointment_booked', 'appointment_reminder', 'appointment_cancelled', 'follow_up',
                  'document'));
