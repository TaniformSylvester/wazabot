import { describe, expect, it } from "vitest";

import { relevantExtra, splitKnowledge } from "@/lib/ai/knowledge";

describe("knowledge split", () => {
  const faqs = [
    { question: "Livrez-vous à Buea ?", answer: "Oui, 2 500 FCFA." },
    { question: "Acceptez-vous Orange Money ?", answer: "Oui, et MTN MoMo." },
  ];
  const documents = [
    { type: "returns", title: "Retours", content: "Retour sous 7 jours si l'article n'est pas porté." },
    { type: "policy", title: "Garantie chaussures", content: "Les chaussures sont garanties 3 mois contre les défauts de couture." },
  ];

  it("keeps everything cached for a small knowledge base", () => {
    const { cached, extra } = splitKnowledge({ faqs, documents });
    expect(cached.faqs).toHaveLength(2);
    expect(cached.documents).toHaveLength(2);
    expect(extra).toEqual([]);
  });

  it("caches by priority up to the budget; the rest is sent only when relevant", () => {
    const { cached, extra } = splitKnowledge({ faqs, documents }, 120);
    expect(cached.faqs.map((f) => f.question)).toEqual(["Livrez-vous à Buea ?", "Acceptez-vous Orange Money ?"]);
    expect(extra.map((i) => i.title)).toEqual(["Retours (returns)", "Garantie chaussures (policy)"]);
    expect(relevantExtra(extra, ["Les chaussures ont une garantie ?"]).map((i) => i.title)).toEqual(["Garantie chaussures (policy)"]);
    expect(relevantExtra(extra, ["Bonjour"])).toEqual([]);
  });
});
