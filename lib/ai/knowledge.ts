import { KNOWLEDGE_CACHED_CHARS, KNOWLEDGE_EXTRA_ITEMS } from "@/config/economics";
import type { BusinessContext } from "@/lib/ai/context";
import { searchWords } from "@/lib/ai/tools/search-words";

/*
 * A business's FAQs and policies, split for the prompt:
 *   cached — the first KNOWLEDGE_CACHED_CHARS characters, by priority (FAQs
 *            first, as the business ordered them, then documents): part of
 *            the cached prefix, so cheap to resend.
 *   extra  — the rest, sent only when it matches what the customer is
 *            talking about (at most KNOWLEDGE_EXTRA_ITEMS), so a large
 *            knowledge base doesn't make every request expensive.
 */

export type KnowledgeItem = { kind: "faq" | "document"; title: string; text: string };

const faqItem = (f: BusinessContext["faqs"][number]): KnowledgeItem => ({ kind: "faq", title: f.question, text: f.answer });
const docItem = (d: BusinessContext["documents"][number]): KnowledgeItem => ({ kind: "document", title: `${d.title} (${d.type})`, text: d.content });
const size = (i: KnowledgeItem) => i.title.length + i.text.length + 8;

export function splitKnowledge(ctx: Pick<BusinessContext, "faqs" | "documents">, budget = KNOWLEDGE_CACHED_CHARS) {
  const cached: { faqs: BusinessContext["faqs"]; documents: BusinessContext["documents"] } = { faqs: [], documents: [] };
  const extra: KnowledgeItem[] = [];
  let used = 0;
  for (const f of ctx.faqs) {
    const item = faqItem(f);
    if (used + size(item) <= budget) {
      cached.faqs.push(f);
      used += size(item);
    } else extra.push(item);
  }
  for (const d of ctx.documents) {
    const item = docItem(d);
    if (used + size(item) <= budget) {
      cached.documents.push(d);
      used += size(item);
    } else extra.push(item);
  }
  return { cached, extra };
}

/** The knowledge items left out of the cached prompt that match the conversation, best first. */
export function relevantExtra(extra: KnowledgeItem[], texts: string[], max = KNOWLEDGE_EXTRA_ITEMS): KnowledgeItem[] {
  const words = searchWords(texts.join(" "), 12);
  if (!words.length || !extra.length) return [];
  const score = (i: KnowledgeItem) => {
    const title = i.title.toLowerCase();
    const text = i.text.toLowerCase();
    return words.reduce((s, w) => s + (title.includes(w) ? 3 : 0) + (text.includes(w) ? 1 : 0), 0);
  };
  return extra
    .map((i) => ({ i, s: score(i) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((x) => x.i);
}
