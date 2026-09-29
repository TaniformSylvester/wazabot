import { describe, expect, it } from "vitest";

import { CONFIDENT_THRESHOLD, detectLanguage } from "@/lib/ai/language/detect";
import { detectLanguageRequest } from "@/lib/ai/language/explicit-request";

describe("detectLanguage", () => {
  it.each([
    ["Hello, do you have this dress in size M? How much is it?", "en"],
    ["Good morning, is the red bag still available?", "en"],
    ["Bonjour, vous avez cette robe en taille M ? C'est combien ?", "fr"],
    ["bjr svp c combien la livraison a bonamoussadi", "fr"],
    ["Merci beaucoup", "fr"],
    ["Je voudrais commander deux paires de chaussures", "fr"],
    ["Abeg how much for dis robe? Wuna get size M?", "wes"],
    ["Weti be di price for dis shoe?", "wes"],
    ["A di come tomorrow for take ma order", "wes"],
    ["How much e be for this bag?", "wes"],
    ["Tenki massa, i don receive am", "wes"],
  ] as const)("%s → %s", (text, expected) => {
    const result = detectLanguage(text);
    expect(result.primary).toBe(expected);
    expect(result.confidence).toBeGreaterThanOrEqual(CONFIDENT_THRESHOLD);
  });

  it("treats a single greeting as a confident signal", () => {
    expect(detectLanguage("Bonjour").primary).toBe("fr");
    expect(detectLanguage("Bonjour").confidence).toBeGreaterThanOrEqual(CONFIDENT_THRESHOLD);
    expect(detectLanguage("Hello").primary).toBe("en");
  });

  it("returns no language for messages without words", () => {
    for (const text of ["👍", "ok", "15000", "   "]) {
      const r = detectLanguage(text);
      expect(r.primary).toBeNull();
      expect(r.confidence).toBe(0);
    }
  });

  it("is not confident on a single ambiguous word", () => {
    expect(detectLanguage("how").confidence).toBeLessThan(CONFIDENT_THRESHOLD);
  });

  it("flags French/English code-switching as mixed", () => {
    const r = detectLanguage("Bonjour, je veux order two robes please, c'est combien la delivery?");
    expect(r.mixed).toBe(true);
    expect(new Set([r.primary, r.secondary])).toEqual(new Set(["fr", "en"]));
  });

  it("does not call Pidgin mixed just because it uses English words", () => {
    const r = detectLanguage("Abeg, how much for dis bag? I want am today");
    expect(r.primary).toBe("wes");
    expect(r.secondary).not.toBe("en");
  });

  it("detects Pidgin mixed with French", () => {
    const r = detectLanguage("Abeg wuna get la robe rouge? C'est combien s'il vous plait");
    expect(r.mixed).toBe(true);
    expect(new Set([r.primary, r.secondary])).toEqual(new Set(["wes", "fr"]));
  });

  it("ignores accents and curly apostrophes", () => {
    expect(detectLanguage("C’est très bien, merci").primary).toBe("fr");
    expect(detectLanguage("cest tres bien merci").primary).toBe("fr");
  });
});

describe("detectLanguageRequest", () => {
  it.each([
    ["Please reply in English", "en"],
    ["Can you speak French?", "fr"],
    ["En français svp", "fr"],
    ["Parlez-vous anglais ?", "en"],
    ["You fit tok Pidgin?", "wes"],
    ["Abeg ansa me for pidgin", "wes"],
    ["English please", "en"],
    ["French?", "fr"],
    ["I no sabi French, abeg tok English", "en"],
    ["Répondez en anglais s'il vous plaît", "en"],
  ] as const)("%s → %s", (text, expected) => {
    expect(detectLanguageRequest(text)).toBe(expected);
  });

  it.each([
    "I don't speak French",
    "Je ne parle pas anglais",
    "Do you have the French style dress?",
    "How much for the english breakfast tea",
    "Bonjour, c'est combien ?",
  ])("no request: %s", (text) => {
    expect(detectLanguageRequest(text)).toBeNull();
  });
});
