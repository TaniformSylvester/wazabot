import { describe, expect, it } from "vitest";

import { MAX_OUTPUT_TOKENS } from "@/config/economics";
import { assistantTools } from "@/lib/ai/claude";
import type { BusinessContext } from "@/lib/ai/context";
import { buildBusinessPrompt, buildKnowledgePrompt, buildPlatformPrompt } from "@/lib/ai/prompts/system-prompt";

/*
 * Token budgets, measured offline. There is no tokenizer here, so token counts
 * are estimated from characters, always on the safe side:
 *   output (must fit under max_tokens)       → 3 characters per token (over-counts)
 *   cached prefix (must reach Haiku's 4,096) → 4 characters per token (under-counts)
 * Production figures come from claude_calls (output_tokens, cache_read_tokens).
 */
const outTokens = (s: string) => Math.ceil(s.length / 3);
const prefixTokens = (s: string) => Math.floor(s.length / 4);

const sendReply = (reply: string, lang: string) =>
  JSON.stringify({ reply, reply_language: lang, customer_languages: [lang], language_request: null, catalog_product_ids: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"], needs_human: false, handoff_reason: null });

const replies = {
  short: {
    fr: "Bonsoir ! Oui, la robe wax rouge est disponible en taille M (2 pièces), à 15 000 FCFA. La livraison à Bonamoussadi coûte 1 500 FCFA. Je vous la réserve ?",
    en: "Good evening! Yes, the red wax dress is available in size M (2 left) at 15,000 FCFA. Delivery to Bonamoussadi is 1,500 FCFA. Shall I reserve it for you?",
    wes: "Good evening! Yes, the red wax dress dey for size M (2 remain), na 15 000 FCFA. Delivery for Bonamoussadi na 1 500 FCFA. You wan make I keep am for you?",
  },
  medium: {
    fr: "Bonjour ! Voici nos robes wax disponibles :\n- Robe wax rouge, tailles M et L : 15 000 FCFA\n- Robe wax bleue, taille S : 13 500 FCFA\n- Robe longue imprimée, tailles M à XL : 22 000 FCFA\nLa livraison à Douala coûte 1 500 FCFA et prend 24 h. Nous sommes ouverts du lundi au samedi, de 8 h à 18 h. Laquelle vous intéresse ?",
    en: "Hello! Here are the wax dresses we have:\n- Red wax dress, sizes M and L: 15,000 FCFA\n- Blue wax dress, size S: 13,500 FCFA\n- Long printed dress, sizes M to XL: 22,000 FCFA\nDelivery in Douala is 1,500 FCFA and takes 24 hours. We're open Monday to Saturday, 8 am to 6 pm. Which one would you like?",
  },
  detailed: {
    fr: "Bonjour et merci pour votre message ! Voici le détail de notre offre de couture sur mesure :\n- Robe simple : 18 000 FCFA, prête en 5 jours\n- Robe de soirée : 35 000 FCFA, prête en 10 jours\n- Ensemble pagne (haut + jupe) : 25 000 FCFA, prêt en 7 jours\nLe tissu n'est pas compris : vous pouvez apporter le vôtre ou choisir dans notre boutique (à partir de 6 000 FCFA les 6 yards). Il faut prendre les mesures en boutique, à Akwa, rue Joss, du lundi au samedi de 8 h à 18 h, ou nous pouvons venir chez vous à Douala pour 2 000 FCFA. Un acompte de 50 % est demandé à la commande, le reste à la livraison, par Orange Money ou MTN MoMo. Les retouches sont gratuites pendant 7 jours. Voulez-vous prendre rendez-vous pour les mesures ?",
  },
} as const;

describe("output budget (max_tokens)", () => {
  for (const [length, byLang] of Object.entries(replies)) {
    for (const [lang, text] of Object.entries(byLang)) {
      it(`a ${length} reply in ${lang} fits under ${MAX_OUTPUT_TOKENS[length as keyof typeof MAX_OUTPUT_TOKENS]} tokens with room to spare`, () => {
        const used = outTokens(sendReply(text, lang));
        const cap = MAX_OUTPUT_TOKENS[length as keyof typeof MAX_OUTPUT_TOKENS];
        console.log(`[budget] ${length}/${lang}: ~${used} output tokens (cap ${cap}, 200 would ${used > 200 ? "CUT IT OFF" : "fit"})`);
        expect(used).toBeLessThanOrEqual(cap * 0.8);
      });
    }
  }
});

const day = { closed: false, open: "08:00", close: "18:00" };
/** The smallest realistic business: name, city, hours, nothing else. */
const minimal: BusinessContext = {
  business: { id: "b", name: "Ets Ngo", description: null, industry: null, city: "Bafoussam", address: null, phone: null, website: null, countryCode: "CM", currency: "XAF", timezone: "Africa/Douala", openingHours: { mon: day, tue: day, wed: day, thu: day, fri: day } as BusinessContext["business"]["openingHours"], openNow: true },
  settings: { aiEnabled: true, tone: "friendly", replyLength: "short", greeting: null, fallbackMessage: null, afterHoursMode: "reply_normally", afterHoursMessage: null, humanHandoverEnabled: true, salesMode: false, photoUnderstanding: false },
  language: { mode: "auto", defaultLanguage: "fr", enabledLanguages: ["fr"] },
  style: { tone: "friendly", formality: "neutral", emojiLevel: "none", replyLength: "short", mirrorCodeSwitching: false, styleNotes: "" },
  faqs: [],
  documents: [],
  activeProductCount: 0,
  booking: { enabled: false, services: [] },
};

describe("cached prefix (Haiku caches only from 4,096 tokens)", () => {
  it("even the smallest business's prefix (tools + platform + business) is long enough to cache", () => {
    const tools = JSON.stringify(assistantTools(minimal.settings.photoUnderstanding, minimal.booking.enabled));
    const system = buildPlatformPrompt() + buildBusinessPrompt({ name: minimal.business.name, countryCode: "CM" }, minimal.language, minimal.style) + buildKnowledgePrompt(minimal);
    const tokens = prefixTokens(tools + system);
    console.log(`[budget] smallest cached prefix: ≥${tokens} tokens (tools ${prefixTokens(tools)}, system ${prefixTokens(system)})`);
    expect(tokens).toBeGreaterThanOrEqual(4096);
  });
});

describe("heavy knowledge base and the uncached part of a request", () => {
  const faqs = Array.from({ length: 60 }, (_, i) => ({ question: `Livrez-vous à la ville numéro ${i} et en combien de jours ?`, answer: `Oui, livraison en 2 jours pour 2 500 FCFA, paiement Orange Money ou MTN MoMo à la livraison (zone ${i}).` }));
  const documents = Array.from({ length: 20 }, (_, i) => ({ type: "policy", title: `Politique ${i}`, content: `Retours acceptés sous 7 jours si l'article n'est pas porté, remboursement en bon d'achat. `.repeat(45).slice(0, 4000) }));
  const heavy: BusinessContext = { ...minimal, faqs, documents, booking: { enabled: true, services: [] } };

  it("only ~12,000 characters of FAQs and policies stay in the cached prompt", () => {
    const before = faqs.reduce((n, f) => n + f.question.length + f.answer.length, 0) + documents.reduce((n, d) => n + d.content.length, 0);
    const system = buildKnowledgePrompt(heavy);
    console.log(`[budget] heavy knowledge: ${Math.ceil(before / 3.6)} tokens written by the business → ~${Math.ceil(system.length / 3.6)} tokens in the cached prompt`);
    expect(system.length).toBeLessThan(14_000);
    expect(system).toContain("more FAQs or policies exist");
  });

  it("a typical turn's uncached part (6 messages, turn context, 8 products, 3 extra items) stays under 2,500 tokens", async () => {
    const { ClaudeResponder } = await import("@/lib/ai/claude");
    const { analyzeInboundMessage } = await import("@/lib/ai/language");
    const history = [
      "Bonjour, vous avez des robes en wax pour un mariage ?",
      "Bonjour ! Oui, nous avons plusieurs robes en wax : la robe longue imprimée à 22 000 FCFA et la robe wax rouge à 15 000 FCFA. Laquelle vous intéresse ?",
      "La rouge, en taille M. Vous livrez à Buea ? C'est combien la livraison ?",
      "Oui, nous livrons à Buea en 2 jours pour 2 500 FCFA. La robe wax rouge est disponible en M. Je vous la réserve ?",
      "Oui svp, et aussi le foulard assorti si vous l'avez",
      "Le foulard assorti est à 4 000 FCFA. Voulez-vous que je prépare la commande pour la robe et le foulard ?",
    ].map((text, i) => ({ role: (i % 2 ? "assistant" : "customer") as "customer", text, at: "2026-10-01T10:00:00Z" }));
    const conversation = { conversationId: "c", aiEnabled: true, language: null, customer: { id: "cu", whatsappPhone: "237670000001", name: "Brenda", city: "Buea", preferredLanguage: null, preferredLanguageSource: null, tags: ["vip"] }, history: [...history, { role: "customer" as const, text: "Ok je prends les deux, livrés à Molyko. Retour possible si la taille ne va pas ?", at: "2026-10-01T10:05:00Z" }], hasEarlier: true, summary: "Brenda cherche une robe en wax pour un mariage, taille M, livraison à Buea." };
    const catalog = Array.from({ length: 8 }, (_, i) => ({ productId: `1111111${i}-1111-4111-8111-111111111111`, name: `Robe wax modèle ${i}`, description: "Robe en wax 100 % coton, coupe droite, longueur genou, fermeture éclair au dos.", category: "Robes", price: 15000 + i * 500, currency: "XAF", inStock: true, hasPhoto: true, variants: [{ variantId: `2222222${i}-2222-4222-8222-222222222222`, label: "Taille: M", price: 15000, inStock: true }, { variantId: `3333333${i}-3333-4333-8333-333333333333`, label: "Taille: L", price: 15000, inStock: false }] }));
    let request = "";
    const create = async (p: { messages: unknown; system: unknown; tools: unknown }) => {
      request = JSON.stringify(p.messages);
      return { id: "m", type: "message", role: "assistant", model: "claude-haiku-4-5", stop_reason: "tool_use", usage: { input_tokens: 0, output_tokens: 0 }, content: [{ type: "tool_use", id: "t", name: "send_reply", input: { reply: "x", reply_language: "fr", customer_languages: ["fr"], language_request: null, catalog_product_ids: [], needs_human: false, handoff_reason: null } }] };
    };
    const a = analyzeInboundMessage(conversation.history.at(-1)!.text, { settings: heavy.language });
    await new ClaudeResponder(create as never).generate({ business: heavy, conversation, decision: a.decision, detection: a.detection, now: new Date("2026-10-05T10:00:00Z"), tools: {} as never, catalog });
    const tokens = outTokens(request); // 3 chars per token: over-counts
    console.log(`[budget] uncached part of a typical request: ~${tokens} tokens (≤ ${Math.ceil(request.length / 3.6)} at 3.6 chars/token)`);
    expect(request).toContain("<more_business_info>");
    expect(tokens).toBeLessThanOrEqual(2500);
  });
});
