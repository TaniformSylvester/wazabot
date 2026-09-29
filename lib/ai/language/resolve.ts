import { languages, type LanguageCode } from "@/lib/i18n/languages";
import type { LanguageSettings } from "@/lib/ai/style";

import { CONFIDENT_THRESHOLD, type DetectionResult } from "./detect";

/**
 * Decides which language the assistant replies in. Pure and deterministic, so
 * the decision can be logged, tested and explained to the business.
 *
 * Priority (highest first):
 *   1. Business set "fixed" mode      → always the business default language
 *   2. Customer asks for a language   → that language (saved as their preference)
 *   3. Saved preference that the customer asked for, or the business set
 *   4. Confident detection of this message
 *   5. The language the conversation is already in
 *   6. A preference we inferred earlier
 *   7. The business default language
 *
 * Every candidate must be enabled for the business; if not, its fallback
 * (Pidgin → English) is used when enabled, else the business default.
 */

export type PreferenceSource = "explicit_request" | "set_by_business" | "inferred";

export type CustomerLanguagePreference = {
  language: LanguageCode;
  source: PreferenceSource;
};

export type ResolveInput = {
  settings: LanguageSettings;
  detection: DetectionResult;
  explicitRequest?: LanguageCode | null;
  customerPreference?: CustomerLanguagePreference | null;
  conversationLanguage?: LanguageCode | null;
};

export type ResolveReason =
  | "business_fixed"
  | "explicit_request"
  | "customer_preference"
  | "detected"
  | "conversation"
  | "inferred_preference"
  | "business_default";

export type LanguageDecision = {
  language: LanguageCode;
  reason: ResolveReason;
  /** Set when the wanted language isn't enabled and a fallback was used instead. */
  fallbackFrom: LanguageCode | null;
  /** Mirror the customer's language mix in the reply (only when allowed by the business). */
  mixedInput: boolean;
  /** Preference to save on the customer, when the decision should stick. */
  preferenceUpdate: CustomerLanguagePreference | null;
};

export function resolveReplyLanguage(input: ResolveInput): LanguageDecision {
  const { settings, detection, explicitRequest, customerPreference, conversationLanguage } = input;
  const enabled = new Set(settings.enabledLanguages);
  enabled.add(settings.defaultLanguage);

  const decide = (
    wanted: LanguageCode,
    reason: ResolveReason,
    preferenceUpdate: CustomerLanguagePreference | null = null,
  ): LanguageDecision => {
    const language = allowed(wanted, enabled, settings.defaultLanguage);
    return {
      language,
      reason,
      fallbackFrom: language === wanted ? null : wanted,
      mixedInput: detection.mixed,
      preferenceUpdate,
    };
  };

  if (settings.mode === "fixed") return decide(settings.defaultLanguage, "business_fixed");

  if (explicitRequest) {
    return decide(explicitRequest, "explicit_request", { language: explicitRequest, source: "explicit_request" });
  }

  if (customerPreference && customerPreference.source !== "inferred") {
    return decide(customerPreference.language, "customer_preference");
  }

  if (detection.primary && detection.confidence >= CONFIDENT_THRESHOLD) {
    const update =
      customerPreference?.language === detection.primary
        ? null
        : ({ language: detection.primary, source: "inferred" } as const);
    return decide(detection.primary, "detected", update);
  }

  if (conversationLanguage) return decide(conversationLanguage, "conversation");
  if (customerPreference) return decide(customerPreference.language, "inferred_preference");
  return decide(settings.defaultLanguage, "business_default");
}

function allowed(wanted: LanguageCode, enabled: Set<LanguageCode>, fallback: LanguageCode): LanguageCode {
  let candidate: LanguageCode | null = wanted;
  const seen = new Set<LanguageCode>();
  while (candidate && !seen.has(candidate)) {
    if (enabled.has(candidate)) return candidate;
    seen.add(candidate);
    candidate = languages[candidate].fallback;
  }
  return fallback;
}
