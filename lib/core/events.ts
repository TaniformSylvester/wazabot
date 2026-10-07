import "server-only";

import { logServerError } from "@/lib/log";

/*
 * WazaBolt core → channels.
 *
 * The business workflows (sales, payments, credit) never call WhatsApp, SMS or
 * email directly. They emit a business event here once the database has
 * committed it; channels subscribe to the events they can deliver.
 *
 *   Sale completed      → (future) receipt to the customer on WhatsApp / SMS / email
 *   Payment recorded    → (future) payment confirmation
 *   Credit outstanding  → (future) payment reminder, from a scheduled job
 *
 * No channel is registered yet: this is the boundary for the WhatsApp phase
 * (after Meta approval). Existing order/appointment notifications keep using
 * lib/notifications, which a WhatsApp channel here can reuse.
 * Events carry ids only — a channel loads what it needs, with its own access.
 */

export type BusinessEvent =
  | { type: "sale.completed"; businessId: string; orderId: string; customerId: string | null }
  | { type: "payment.recorded"; businessId: string; customerId: string | null; orderId: string | null; amount: number }
  | { type: "credit.outstanding"; businessId: string; customerId: string; outstanding: number };

export type ChannelName = "whatsapp" | "sms" | "email";

export interface Channel {
  name: ChannelName;
  /** Whether this channel delivers something for the event (e.g. the business enabled WhatsApp receipts). */
  handles(event: BusinessEvent): boolean;
  deliver(event: BusinessEvent): Promise<void>;
}

const channels: Channel[] = [];

/** Registers a delivery channel (none yet). */
export function registerChannel(channel: Channel) {
  if (!channels.some((c) => c.name === channel.name)) channels.push(channel);
}

/**
 * Hands an event to every channel that handles it. A failing channel is
 * logged and never affects the sale or payment, which is already saved.
 */
export async function emit(event: BusinessEvent): Promise<void> {
  for (const channel of channels) {
    if (!channel.handles(event)) continue;
    try {
      await channel.deliver(event);
    } catch (error) {
      logServerError(`events.${channel.name}.${event.type}`, error);
    }
  }
}

/** Test helper: the channels currently registered. */
export const registeredChannels = () => channels.map((c) => c.name);
