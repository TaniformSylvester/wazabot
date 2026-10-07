import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/log", () => ({ logServerError: vi.fn() }));

import { emit, registerChannel, registeredChannels, type BusinessEvent } from "@/lib/core/events";

const sale: BusinessEvent = { type: "sale.completed", businessId: "b", orderId: "o", customerId: "c" };

describe("core business events", () => {
  it("does nothing while no channel is registered (WhatsApp comes later)", async () => {
    expect(registeredChannels()).toEqual([]);
    await expect(emit(sale)).resolves.toBeUndefined();
  });

  it("delivers to channels that handle the event; a failing channel never throws", async () => {
    const delivered: string[] = [];
    registerChannel({ name: "sms", handles: (e) => e.type === "sale.completed", deliver: async (e) => void delivered.push(`sms:${e.type}`) });
    registerChannel({ name: "email", handles: () => true, deliver: async () => Promise.reject(new Error("mail down")) });
    await expect(emit(sale)).resolves.toBeUndefined();
    await emit({ type: "credit.outstanding", businessId: "b", customerId: "c", outstanding: 1000 });
    expect(delivered).toEqual(["sms:sale.completed"]);
    expect(registeredChannels()).toEqual(["sms", "email"]);
  });
});
