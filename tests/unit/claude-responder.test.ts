import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";

import { AiRefusalError, ClaudeResponder, assistantTools, historyToMessages } from "@/lib/ai/claude";
import type { BusinessContext, ConversationContext } from "@/lib/ai/context";
import { analyzeInboundMessage } from "@/lib/ai/language";
import type { GenerateInput } from "@/lib/ai/service";

/*
 * The Claude tool loop, with a scripted stand-in for the Messages API (no
 * network, no cost) and an in-memory stand-in for the database.
 */

const PRODUCT = "11111111-1111-4111-8111-111111111111";

/** Chainable query stub: every builder method returns itself; awaiting it yields { data }. */
function fakeDb(data: unknown) {
  const proxy: unknown = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") return (resolve: (v: unknown) => void) => resolve({ data, error: null });
      return () => proxy;
    },
    apply: () => proxy,
  });
  return proxy as GenerateInput["tools"]["db"];
}

const business: BusinessContext = {
  business: {
    id: "b1",
    name: "Awa Styles",
    description: "Ankara dresses",
    industry: "fashion",
    city: "Douala",
    address: null,
    phone: null,
    website: null,
    countryCode: "CM",
    currency: "XAF",
    timezone: "Africa/Douala",
    openingHours: { mon: { closed: false, open: "08:00", close: "18:00" } },
    openNow: true,
  },
  settings: {
    aiEnabled: true,
    tone: "friendly",
    replyLength: "short",
    greeting: "Bienvenue chez Awa Styles !",
    fallbackMessage: null,
    afterHoursMode: "reply_normally",
    afterHoursMessage: null,
    humanHandoverEnabled: true,
    salesMode: true,
    photoUnderstanding: true,
  },
  language: { mode: "auto", defaultLanguage: "fr", enabledLanguages: ["fr", "en", "wes"] },
  style: { tone: "friendly", formality: "neutral", emojiLevel: "light", replyLength: "short", mirrorCodeSwitching: false, styleNotes: "" },
  faqs: [{ question: "Livrez-vous à Buea ?", answer: "Oui, 2 500 XAF." }],
  documents: [],
  activeProductCount: 1,
  booking: { enabled: false, services: [] },
};

const conversation: ConversationContext = {
  conversationId: "c1",
  aiEnabled: true,
  language: null,
  customer: { id: "cu1", whatsappPhone: "237670000001", name: "Brenda", city: null, preferredLanguage: null, preferredLanguageSource: null, tags: [] },
  history: [{ role: "customer", text: "Bonjour, c'est combien la robe Ankara ?", at: "2026-10-01T10:00:00Z" }],
  hasEarlier: false,
  summary: null,
};

function input(dbData: unknown = []): GenerateInput {
  const analysis = analyzeInboundMessage(conversation.history[0].text, { settings: business.language });
  return {
    business,
    conversation,
    decision: analysis.decision,
    detection: analysis.detection,
    now: new Date("2026-10-05T10:00:00Z"),
    tools: { db: fakeDb(dbData), businessId: "b1", conversationId: "c1", customerId: "cu1" },
  };
}

const usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50, cache_creation_input_tokens: 10 };
const message = (content: unknown[], stop_reason: string, extra: Record<string, unknown> = {}) =>
  ({ id: "msg", type: "message", role: "assistant", model: "claude-opus-5-5", content, stop_reason, usage, ...extra }) as unknown as Anthropic.Beta.BetaMessage;
const reply = (overrides: Record<string, unknown> = {}) => ({
  reply: "La robe Ankara coûte 15 000 XAF.",
  reply_language: "fr",
  customer_languages: ["fr"],
  language_request: null,
  catalog_product_ids: [PRODUCT],
  needs_human: false,
  handoff_reason: null,
  ...overrides,
});

/** Scripted Messages API: returns the given responses in order and records each request. */
function scripted(responses: Anthropic.Beta.BetaMessage[]) {
  const requests: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
  const create = async (params: Anthropic.Beta.MessageCreateParamsNonStreaming) => {
    requests.push(structuredClone(params));
    const next = responses.shift();
    if (!next) throw new Error("no more scripted responses");
    return next;
  };
  return { create, requests };
}

describe("Claude responder", () => {
  it("looks up the catalog, then replies through send_reply", async () => {
    const api = scripted([
      message([{ type: "tool_use", id: "t1", name: "searchProducts", input: { query: "Ankara" } }], "tool_use"),
      message([{ type: "tool_use", id: "t2", name: "send_reply", input: reply() }], "tool_use"),
    ]);
    const products = [{ id: PRODUCT, name: "Ankara dress", description: null, category: null, price: 15000, currency: "XAF", stock_quantity: 3, product_variants: [] }];
    // Sonnet (the opt-in model): effort, server-side fallback and a system message are supported.
    const result = await new ClaudeResponder(api.create, "claude-sonnet-5-5").generate(input(products));

    expect(result.reply.reply).toContain("15 000");
    expect(result.productIds.has(PRODUCT)).toBe(true);
    expect(result.toolCalls).toBe(1);
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 40, cacheReadTokens: 100, cacheWriteTokens: 20 });

    const [first, second] = api.requests;
    expect(first.model).toBe("claude-sonnet-5-5");
    expect(first.fallbacks).toBe("default");
    expect(first.betas).toContain("server-side-fallback-2026-07-01");
    expect(first.output_config?.effort).toBe("low");
    expect(first.thinking).toBeUndefined();
    const system = first.system as Anthropic.Beta.BetaTextBlockParam[];
    expect(system.every((b) => b.cache_control?.type === "ephemeral")).toBe(true);
    expect(system[1].text).toContain("Livrez-vous à Buea ?"); // FAQ in the cached business block
    expect(first.messages.at(-1)).toMatchObject({ role: "system" }); // turn context after the customer message
    expect(String(first.messages.at(-1)?.content)).toContain("reply_language: French (fr)");
    // The tool result went back as one user message; the system message stays in place.
    expect(second.messages.at(-1)).toMatchObject({ role: "user", content: [{ type: "tool_result", tool_use_id: "t1" }] });
    expect(String((second.messages.at(-1)?.content as Anthropic.Beta.BetaToolResultBlockParam[])[0].content)).toContain(PRODUCT);
  });

  it("replies on Haiku by default, capped by reply length, with the 1-hour cache when asked", async () => {
    const api = scripted([message([{ type: "tool_use", id: "t1", name: "send_reply", input: reply({ catalog_product_ids: [] }) }], "tool_use")]);
    await new ClaudeResponder(api.create).generate({ ...input(), cacheTtl: "1h" });
    const [first] = api.requests;
    expect(first.model).toBe("claude-haiku-4-5");
    expect(first.max_tokens).toBe(300); // "short" replies
    const system = first.system as Anthropic.Beta.BetaTextBlockParam[];
    expect(system.every((b) => b.cache_control?.type === "ephemeral" && b.cache_control.ttl === "1h")).toBe(true);

    const api5m = scripted([message([{ type: "tool_use", id: "t1", name: "send_reply", input: reply({ catalog_product_ids: [] }) }], "tool_use")]);
    await new ClaudeResponder(api5m.create).generate({ ...input(), business: { ...business, style: { ...business.style, replyLength: "detailed" } } });
    expect(api5m.requests[0].max_tokens).toBe(700);
    expect((api5m.requests[0].system as Anthropic.Beta.BetaTextBlockParam[])[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("on Haiku: no effort, no fallback, turn context inside the customer's turn", async () => {
    const api = scripted([message([{ type: "tool_use", id: "t1", name: "send_reply", input: reply({ catalog_product_ids: [] }) }], "tool_use")]);
    await new ClaudeResponder(api.create, "claude-haiku-4-5").generate(input());
    const [first] = api.requests;
    expect(first.model).toBe("claude-haiku-4-5");
    expect(first.output_config).toBeUndefined();
    expect(first.fallbacks).toBeUndefined();
    expect(first.betas).toBeUndefined();
    expect(first.messages.some((m) => (m.role as string) === "system")).toBe(false);
    const last = first.messages.at(-1)!;
    expect(last.role).toBe("user");
    const blocks = last.content as Anthropic.Beta.BetaTextBlockParam[];
    expect(blocks[0].text).toBe("Bonjour, c'est combien la robe Ankara ?");
    expect(blocks.at(-1)?.text).toContain("reply_language: French (fr)");
  });

  it("records every request's usage for cost logging, even when the loop then fails", async () => {
    const withCache = { input_tokens: 300, output_tokens: 40, cache_read_input_tokens: 4000, cache_creation_input_tokens: 500, cache_creation: { ephemeral_5m_input_tokens: 200, ephemeral_1h_input_tokens: 300 } };
    const api = scripted([
      message([{ type: "tool_use", id: "t1", name: "searchProducts", input: { query: "Ankara" } }], "tool_use", { usage: withCache, model: "claude-haiku-4-5-20251001" }),
      message([], "max_tokens"),
    ]);
    const calls: NonNullable<GenerateInput["calls"]> = [];
    await expect(new ClaudeResponder(api.create, "claude-haiku-4-5").generate({ ...input([]), calls })).rejects.toThrow("max_tokens");
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ model: "claude-haiku-4-5-20251001", inputTokens: 300, outputTokens: 40, cacheReadTokens: 4000, cacheWrite5mTokens: 200, cacheWrite1hTokens: 300 });
  });

  it("sends the running summary once the window is full, and asks to update it", async () => {
    const api = scripted([message([{ type: "tool_use", id: "t1", name: "send_reply", input: reply({ catalog_product_ids: [], summary: "Brenda wants 2 Ankara dresses, size M, delivered to Buea." }) }], "tool_use")]);
    const turns = Array.from({ length: 6 }, (_, i) => ({ role: (i % 2 ? "assistant" : "customer") as "customer", text: `message ${i}`, at: "2026-10-01T10:00:00Z" }));
    const long = { ...conversation, history: turns, hasEarlier: true, summary: "Brenda asked about Ankara dresses." };
    const result = await new ClaudeResponder(api.create).generate({ ...input(), conversation: long });
    const turn = (api.requests[0].messages.at(-1)!.content as Anthropic.Beta.BetaTextBlockParam[]).at(-1)!.text;
    expect(turn).toContain("<earlier_conversation>\nBrenda asked about Ankara dresses.\n</earlier_conversation>");
    expect(turn).toContain("update_summary: yes");
    expect(result.reply.summary).toBe("Brenda wants 2 Ankara dresses, size M, delivered to Buea.");

    const short = scripted([message([{ type: "tool_use", id: "t1", name: "send_reply", input: reply({ catalog_product_ids: [] }) }], "tool_use")]);
    await new ClaudeResponder(short.create).generate(input());
    expect(JSON.stringify(short.requests[0].messages)).not.toContain("update_summary");
  });

  it("asks again when send_reply is malformed", async () => {
    const api = scripted([
      message([{ type: "tool_use", id: "t1", name: "send_reply", input: { reply: "Bonjour" } }], "tool_use"),
      message([{ type: "tool_use", id: "t2", name: "send_reply", input: reply({ catalog_product_ids: [] }) }], "tool_use"),
    ]);
    const result = await new ClaudeResponder(api.create).generate(input());
    expect(result.reply.reply_language).toBe("fr");
    const retry = api.requests[1].messages.at(-1)?.content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(retry[0]).toMatchObject({ is_error: true, tool_use_id: "t1" });
  });

  it("runs lookups before accepting a reply sent in the same turn", async () => {
    const api = scripted([
      message(
        [
          { type: "tool_use", id: "t1", name: "getBusinessHours", input: {} },
          { type: "tool_use", id: "t2", name: "send_reply", input: reply() },
        ],
        "tool_use",
      ),
      message([{ type: "tool_use", id: "t3", name: "send_reply", input: reply({ catalog_product_ids: [] }) }], "tool_use"),
    ]);
    await new ClaudeResponder(api.create).generate(input({ timezone: "Africa/Douala", opening_hours: {} }));
    const results = api.requests[1].messages.at(-1)?.content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(results.map((r) => r.tool_use_id)).toEqual(["t1", "t2"]);
    expect(results[1].is_error).toBe(true);
  });

  it("reports invalid tool input to the model instead of running it", async () => {
    const api = scripted([
      message([{ type: "tool_use", id: "t1", name: "checkProductStock", input: { productId: "not-a-uuid" } }], "tool_use"),
      message([{ type: "tool_use", id: "t2", name: "send_reply", input: reply({ catalog_product_ids: [] }) }], "tool_use"),
    ]);
    const result = await new ClaudeResponder(api.create).generate(input());
    expect(result.productIds.size).toBe(0);
    const results = api.requests[1].messages.at(-1)?.content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(results[0]).toMatchObject({ is_error: true, content: JSON.stringify({ error: "invalid_input" }) });
  });

  it("raises a refusal and accepts a plain-text answer", async () => {
    const refused = scripted([message([], "refusal", { stop_details: { type: "refusal", category: "cyber", explanation: null } })]);
    await expect(new ClaudeResponder(refused.create).generate(input())).rejects.toBeInstanceOf(AiRefusalError);
    const plain = scripted([message([{ type: "text", text: "Bonjour ! Comment puis-je vous aider ?" }], "end_turn")]);
    const result = await new ClaudeResponder(plain.create).generate(input());
    expect(result.reply).toMatchObject({ reply: "Bonjour ! Comment puis-je vous aider ?", reply_language: "fr", needs_human: false });
  });
});

describe("prompt building", () => {
  it("keeps the tool list stable with send_reply last", () => {
    const names = assistantTools().map((t) => t.name);
    expect(names.at(-1)).toBe("send_reply");
    expect(names.slice(0, -1)).toEqual([...names.slice(0, -1)].sort((a, b) => a.localeCompare(b)));
    expect(assistantTools()).toEqual(assistantTools());
  });

  it("turns history into alternating turns that start with the customer", () => {
    const turns = historyToMessages({
      ...conversation,
      history: [
        { role: "agent", text: "Hello from the team", at: "1" },
        { role: "customer", text: "Bonjour", at: "2" },
        { role: "customer", text: "Vous êtes là ?", at: "3" },
        { role: "agent", text: "Oui !", at: "4" },
      ],
    });
    expect(turns).toEqual([
      { role: "user", content: "Bonjour\n\nVous êtes là ?" },
      { role: "assistant", content: "[Reply from a team member]\nOui !" },
    ]);
  });
});
