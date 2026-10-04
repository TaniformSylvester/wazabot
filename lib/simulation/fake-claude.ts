import type Anthropic from "@anthropic-ai/sdk";

import { SIMULATION } from "@/config/economics";
import type { CatalogMatchItem } from "@/lib/ai/tools/prefetch";
import type { LanguageCode } from "@/lib/i18n/languages";

/*
 * Stands in for the Messages API during the simulation. It receives the real
 * request the assistant builds (tools, system prompt, history, turn context)
 * and answers like the model would — a lookup or order tool call when the
 * customer's message needs one, then send_reply — with usage figures
 * counted from that request:
 *
 *   input   the uncached part (messages), at SIMULATION.inputCharsPerToken
 *   cache   the prefix (tools + system): read when the business's cache is
 *           still alive, otherwise written (5-minute or 1-hour, as requested);
 *           not cached at all below SIMULATION.minCacheableTokens
 *   output  the tool call's JSON, at SIMULATION.outputCharsPerToken, plus
 *           a small overhead for the tool_use block
 */

export type ScriptKind =
  | "greet"
  | "price"
  | "stock"
  | "hours"
  | "location"
  | "delivery"
  | "browse"
  | "detail"
  | "order"
  | "address"
  | "confirm"
  | "booking"
  | "visit"
  | "complaint"
  | "thanks"
  | "emoji";

/** What the simulation tells the stand-in about the message being answered. */
export type TurnState = {
  now: Date;
  business: string;
  language: LanguageCode;
  kind: ScriptKind;
  replyLength: "short" | "medium" | "detailed";
  catalog: CatalogMatchItem[];
  serviceId: string | null;
  /** Real-estate visits and a share of detailed questions need a person. */
  handOver: boolean;
  /** Picks a sample reply (seeded). */
  pick: <T>(list: readonly T[]) => T;
};

const TOOL_USE_OVERHEAD_TOKENS = 25;
const tokens = (chars: number, perToken: number) => Math.ceil(chars / perToken);

export function createFakeClaude(state: { turn: TurnState | null }) {
  const cache = new Map<string, number>();

  return async function create(params: Anthropic.Beta.MessageCreateParamsNonStreaming): Promise<Anthropic.Beta.BetaMessage> {
    const turn = state.turn;
    if (!turn) throw new Error("simulation: no turn state");
    const system = Array.isArray(params.system) ? params.system : [];
    const prefixChars = JSON.stringify(params.tools ?? []).length + system.reduce((n, b) => n + b.text.length, 0);
    const prefix = tokens(prefixChars, SIMULATION.inputCharsPerToken);
    const uncached = tokens(JSON.stringify(params.messages).length, SIMULATION.inputCharsPerToken);
    const ttlMs = system[0]?.cache_control && "ttl" in system[0].cache_control && system[0].cache_control.ttl === "1h" ? 3_600_000 : 300_000;

    let read = 0;
    let write = 0;
    let input = uncached;
    if (prefix >= SIMULATION.minCacheableTokens) {
      const alive = (cache.get(turn.business) ?? 0) > turn.now.getTime();
      if (alive) read = prefix;
      else write = prefix;
      cache.set(turn.business, turn.now.getTime() + ttlMs);
    } else input += prefix;

    const block = nextBlock(params, turn);
    const output = tokens(JSON.stringify(block.input).length, SIMULATION.outputCharsPerToken) + TOOL_USE_OVERHEAD_TOKENS;
    return {
      id: "msg_sim",
      type: "message",
      role: "assistant",
      model: params.model,
      container: null,
      context_management: null,
      stop_reason: "tool_use",
      stop_sequence: null,
      stop_details: null,
      usage: {
        input_tokens: input,
        output_tokens: output,
        cache_read_input_tokens: read,
        cache_creation_input_tokens: write,
        cache_creation: { ephemeral_5m_input_tokens: ttlMs === 300_000 ? write : 0, ephemeral_1h_input_tokens: ttlMs === 3_600_000 ? write : 0 },
        server_tool_use: null,
        service_tier: "standard",
      },
      content: [{ type: "tool_use", id: `toolu_${Math.random().toString(36).slice(2, 10)}`, name: block.name, input: block.input, caller: { type: "direct" } }],
    } as unknown as Anthropic.Beta.BetaMessage;
  };
}

/** The model's next step: one lookup when the turn needs it (first step only), then send_reply. */
function nextBlock(params: Anthropic.Beta.MessageCreateParamsNonStreaming, turn: TurnState): { name: string; input: Record<string, unknown> } {
  const firstStep = params.messages.at(-1)?.role === "user" && !params.messages.some((m) => Array.isArray(m.content) && m.content.some((b) => typeof b === "object" && b.type === "tool_result"));
  if (firstStep) {
    const top = turn.catalog[0];
    if (turn.kind === "order" && top) {
      const variant = top.variants.find((v) => v.inStock !== false);
      return { name: "createOrder", input: { items: [{ productId: top.productId, ...(variant ? { variantId: variant.variantId } : {}), quantity: 1 }] } };
    }
    if ((turn.kind === "order" || turn.kind === "browse") && !top) return { name: "searchProducts", input: { query: "robe", limit: 5 } };
    if (turn.kind === "booking" && turn.serviceId) return { name: "findAvailableSlots", input: { serviceId: turn.serviceId, days: 3 } };
    if (turn.kind === "delivery") return { name: "getDeliveryFee", input: {} };
  }
  const updateSummary = JSON.stringify(params.messages).includes("update_summary: yes");
  const reply = turn.pick(REPLIES[turn.language][turn.replyLength === "short" ? "short" : "medium"]);
  return {
    name: "send_reply",
    input: {
      reply,
      reply_language: turn.language,
      customer_languages: [turn.language],
      language_request: null,
      catalog_product_ids: turn.catalog.slice(0, 2).map((p) => p.productId),
      needs_human: turn.handOver,
      handoff_reason: turn.handOver ? "The customer needs the team." : null,
      ...(updateSummary ? { summary: turn.pick(SUMMARIES[turn.language]) } : {}),
    },
  };
}

/** Sample replies of the length each setting produces (see tests/unit/reply-budget.test.ts). */
const REPLIES: Record<LanguageCode, { short: string[]; medium: string[] }> = {
  fr: {
    short: [
      "Bonjour ! Oui, la robe wax rouge est disponible en M et L, à 15 000 FCFA. Voulez-vous que je vous la réserve ?",
      "Avec plaisir ! La livraison à Bonamoussadi coûte 1 500 FCFA, le jour même pour toute commande avant 14 h. Je prépare la commande ?",
      "C'est noté : 1 robe wax rouge, taille M, 15 000 FCFA + 1 500 FCFA de livraison, soit 16 500 FCFA. Paiement par Orange Money, MTN MoMo ou à la livraison.",
      "Désolée pour ce retard. Je transmets tout de suite votre message à l'équipe, quelqu'un vous répond dans quelques minutes.",
      "Nous avons de la place samedi à 10 h et à 14 h pour des tresses (environ 3 h, 8 000 FCFA hors mèches). Quelle heure vous convient ?",
    ],
    medium: [
      "Bonjour ! Pour un étudiant, nous avons un studio à Bonduma à 35 000 FCFA par mois, près de l'université, et un studio meublé à Check Point à 50 000 FCFA (chauffe-eau et Wi-Fi). Pour entrer : le loyer de la période convenue avec le propriétaire, un mois de commission et un mois de caution. Voulez-vous organiser une visite ?",
      "Oui, l'eau et l'électricité ne sont pas comprises : chaque logement a son compteur. La visite coûte 2 000 FCFA, déduits de la commission si vous prenez le logement. Nous faisons les visites du lundi au samedi de 9 h à 17 h. Quel jour vous arrangerait ?",
    ],
  },
  en: {
    short: [
      "Hello! Yes, the ndolé with plantain is ready today at 2,500 FCFA. Delivery to Nkwen is 500 FCFA. Shall I take your order?",
      "Noted: 2 plates of jollof rice with chicken, 5,000 FCFA + 500 FCFA delivery to Nkwen. Pay by MoMo before delivery or cash on arrival. Confirm?",
      "We close at 10 pm today. You can still order until 9:30 pm for delivery.",
      "Sorry about this. I've passed your message to the team and someone will get back to you shortly.",
      "Yes, it's 100% cotton and comes in M, L and XL. Would you like me to reserve one for you?",
    ],
    medium: [
      "Hello! We have a 2-bedroom apartment in Molyko at 75,000 FCFA a month: two bedrooms, sitting room, kitchen and 2 toilets, with separate water and light meters. To move in you pay the rent for the period agreed with the landlord, one month's agency fee and one month's deposit. Would you like to visit it?",
      "Visits are Monday to Saturday from 9 am to 5 pm, on appointment, and cost 2,000 FCFA (deducted from the agency fee if you take the house). Bring an ID card. Which day suits you? I'll ask the team to confirm the time.",
    ],
  },
  wes: {
    short: [
      "Hello! Yes, ndolé dey today, na 2 500 FCFA with plantain. Delivery for Nkwen na 500 FCFA. You wan make I write your order?",
      "Ok, I don write am: 2 plates jollof rice, 5 000 FCFA plus 500 FCFA delivery. You fit pay with MoMo or cash when e reach. E fine?",
      "We dey close for 10 pm today. You fit still order until 9:30.",
      "Sorry for dis wahala. I don pass your message to the team, dem go answer you now now.",
      "Yes, e be cotton and e dey for M, L and XL. You wan make I keep one for you?",
    ],
    medium: [
      "Hello! We get studio for Bonduma, 35 000 FCFA for month, near di university, and furnished studio for Check Point, 50 000 FCFA. To enter, you go pay di rent wey you agree with di landlord, one month agency fee and one month deposit. You wan go see am?",
      "Water and light no dey inside: each house get e own meter. Visit na 2 000 FCFA, and we go remove am from agency fee if you take di house. Which day fit you?",
    ],
  },
};

const SUMMARIES: Record<LanguageCode, string[]> = {
  fr: ["Cliente intéressée par la robe wax rouge en M, livraison à Bonamoussadi (1 500 FCFA), paiement Orange Money. Commande pas encore confirmée."],
  en: ["Customer asked about ndolé and jollof rice for 2, delivery to Nkwen (500 FCFA), will pay by MoMo. Order not yet confirmed."],
  wes: ["Customer want 2 plates jollof rice, delivery for Nkwen 500 FCFA, go pay MoMo. Order never confirm yet."],
};
