import { describe, expect, it } from "vitest";

import { analyzeInboundMessage, detectLanguage, resolveReplyLanguage } from "@/lib/ai/language";
import { fixedMessage, languagePacks } from "@/lib/ai/language/packs";
import { buildBusinessPrompt, buildPlatformPrompt, buildTurnContext } from "@/lib/ai/prompts/system-prompt";
import { assistantReplySchema, replyLanguageMismatch } from "@/lib/ai/reply-schema";
import { defaultResponseStyle, type LanguageSettings } from "@/lib/ai/style";
import { LANGUAGE_CODES, languages } from "@/lib/i18n/languages";

const all: LanguageSettings = { mode: "auto", defaultLanguage: "en", enabledLanguages: ["en", "fr", "wes"] };

describe("resolveReplyLanguage", () => {
  it("replies in the detected language and remembers it as an inferred preference", () => {
    const d = resolveReplyLanguage({ settings: all, detection: detectLanguage("Bonjour, c'est combien ?") });
    expect(d).toMatchObject({ language: "fr", reason: "detected", preferenceUpdate: { language: "fr", source: "inferred" } });
  });

  it("honours an explicit request above everything except fixed mode", () => {
    const d = resolveReplyLanguage({
      settings: all,
      detection: detectLanguage("Bonjour, répondez en anglais svp"),
      explicitRequest: "en",
      customerPreference: { language: "fr", source: "explicit_request" },
    });
    expect(d).toMatchObject({ language: "en", reason: "explicit_request", preferenceUpdate: { source: "explicit_request" } });
  });

  it("keeps an explicit preference even when the customer writes in another language", () => {
    const d = resolveReplyLanguage({
      settings: all,
      detection: detectLanguage("Bonjour, vous avez la robe ?"),
      customerPreference: { language: "en", source: "explicit_request" },
    });
    expect(d).toMatchObject({ language: "en", reason: "customer_preference" });
  });

  it("lets confident detection override a merely inferred preference", () => {
    const d = resolveReplyLanguage({
      settings: all,
      detection: detectLanguage("Abeg how much for dis one?"),
      customerPreference: { language: "en", source: "inferred" },
    });
    expect(d).toMatchObject({ language: "wes", reason: "detected" });
  });

  it("stays in the conversation language on short messages", () => {
    const d = resolveReplyLanguage({ settings: all, detection: detectLanguage("ok 👍"), conversationLanguage: "fr" });
    expect(d).toMatchObject({ language: "fr", reason: "conversation" });
  });

  it("falls back from Pidgin to English when Pidgin is not enabled", () => {
    const d = resolveReplyLanguage({
      settings: { mode: "auto", defaultLanguage: "fr", enabledLanguages: ["fr", "en"] },
      detection: detectLanguage("Weti be di price for dis shoe?"),
    });
    expect(d).toMatchObject({ language: "en", fallbackFrom: "wes" });
  });

  it("falls back to the default when neither the language nor its fallback is enabled", () => {
    const d = resolveReplyLanguage({
      settings: { mode: "auto", defaultLanguage: "fr", enabledLanguages: ["fr"] },
      detection: detectLanguage("Hello, how much is this bag?"),
    });
    expect(d).toMatchObject({ language: "fr", fallbackFrom: "en" });
  });

  it("always uses the default language in fixed mode", () => {
    const d = resolveReplyLanguage({
      settings: { ...all, mode: "fixed", defaultLanguage: "fr" },
      detection: detectLanguage("Hello"),
      explicitRequest: "en",
    });
    expect(d).toMatchObject({ language: "fr", reason: "business_fixed", preferenceUpdate: null });
  });

  it("analyzeInboundMessage wires detection, request and resolution together", () => {
    const r = analyzeInboundMessage("You fit tok Pidgin?", { settings: all });
    expect(r.explicitRequest).toBe("wes");
    expect(r.decision.language).toBe("wes");
  });
});

describe("prompts", () => {
  it("covers every AI language in the platform prompt", () => {
    const prompt = buildPlatformPrompt();
    for (const code of LANGUAGE_CODES.filter((c) => languages[c].ai)) {
      expect(prompt).toContain(`${languages[code].englishName} (${code})`);
    }
  });

  it("is byte-for-byte stable so it can be cached", () => {
    expect(buildPlatformPrompt()).toBe(buildPlatformPrompt());
  });

  it("adds language-specific formality for the business's languages only", () => {
    const p = buildBusinessPrompt({ name: "MJ Fashion", countryCode: "CM" }, { ...all, enabledLanguages: ["en", "fr"] }, {
      ...defaultResponseStyle,
      formality: "formal",
    });
    expect(p).toContain(languagePacks.fr.formality.formal);
    expect(p).not.toContain(languagePacks.wes.formality.formal);
  });

  it("puts the per-message decision in the turn context", () => {
    const detection = detectLanguage("Bonjour, I want deux robes please");
    const decision = resolveReplyLanguage({ settings: all, detection });
    const ctx = buildTurnContext(decision, detection, { ...defaultResponseStyle, mirrorCodeSwitching: true });
    expect(ctx).toContain(`reply_language: ${languages[decision.language].englishName}`);
    expect(ctx).toContain("mirroring_mixed_language: allowed");
  });
});

describe("language packs", () => {
  it("has every fixed message for every language, with the business placeholder", () => {
    for (const pack of Object.values(languagePacks)) {
      for (const text of Object.values(pack.messages)) expect(text.length).toBeGreaterThan(0);
      expect(fixedMessage(pack.code, "handoff", "MJ Fashion")).toContain("MJ Fashion");
    }
  });
});

describe("reply schema", () => {
  it("accepts a valid reply and detects a language mismatch", () => {
    const reply = assistantReplySchema.parse({
      reply: "Bonjour ! Oui, la robe est disponible.",
      reply_language: "fr",
      customer_languages: ["fr", "en"],
      language_request: null,
      catalog_product_ids: [],
      needs_human: false,
      handoff_reason: null,
    });
    expect(replyLanguageMismatch("fr", reply)).toBeNull();
    expect(replyLanguageMismatch("en", reply)).toEqual({ expected: "en", actual: "fr" });
  });
});
