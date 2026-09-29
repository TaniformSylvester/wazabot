import { detectLanguage, type DetectionResult } from "./detect";
import { detectLanguageRequest } from "./explicit-request";
import { resolveReplyLanguage, type LanguageDecision, type ResolveInput } from "./resolve";

export { detectLanguage, CONFIDENT_THRESHOLD, type DetectionResult } from "./detect";
export { detectLanguageRequest } from "./explicit-request";
export {
  resolveReplyLanguage,
  type CustomerLanguagePreference,
  type LanguageDecision,
  type PreferenceSource,
  type ResolveReason,
} from "./resolve";
export { languagePacks, getLanguagePack, fixedMessage } from "./packs";

export type InboundLanguageAnalysis = {
  detection: DetectionResult;
  explicitRequest: ReturnType<typeof detectLanguageRequest>;
  decision: LanguageDecision;
};

/** Everything the inbound-message pipeline needs to know about language, in one call. */
export function analyzeInboundMessage(
  text: string,
  context: Omit<ResolveInput, "detection" | "explicitRequest">,
): InboundLanguageAnalysis {
  const detection = detectLanguage(text);
  const explicitRequest = detectLanguageRequest(text);
  const decision = resolveReplyLanguage({ ...context, detection, explicitRequest });
  return { detection, explicitRequest, decision };
}
