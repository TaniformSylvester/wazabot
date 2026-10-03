import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { HISTORY_MESSAGES } from "@/config/economics";
import type { Database } from "@/types/database";
import { oneOf, AFTER_HOURS_MODES } from "@/types/database";
import { isOpenAt, parseOpeningHours, type OpeningHours } from "@/lib/business/hours";
import { isLanguageCode, type LanguageCode } from "@/lib/i18n/languages";
import {
  EMOJI_LEVELS,
  FORMALITY_LEVELS,
  LANGUAGE_MODES,
  REPLY_LENGTHS,
  TONES,
  type LanguageSettings,
  type ReplyLength,
  type ResponseStyle,
  type Tone,
} from "@/lib/ai/style";

type Db = SupabaseClient<Database>;

/*
 * Builds what the model is told about a business and a conversation. The
 * backend reads the database (scoped to one business_id) and hands the model
 * plain, bounded data — the model never queries the database itself.
 */

export type BusinessContext = {
  business: {
    id: string;
    name: string;
    description: string | null;
    industry: string | null;
    city: string | null;
    address: string | null;
    phone: string | null;
    website: string | null;
    countryCode: string;
    currency: string;
    timezone: string;
    openingHours: OpeningHours;
    /** null when opening hours aren't set. */
    openNow: boolean | null;
  };
  settings: {
    aiEnabled: boolean;
    tone: Tone;
    replyLength: ReplyLength;
    greeting: string | null;
    fallbackMessage: string | null;
    afterHoursMode: (typeof AFTER_HOURS_MODES)[number];
    afterHoursMessage: string | null;
    humanHandoverEnabled: boolean;
    salesMode: boolean;
    /** Look at customers' photos (off: pass them to the team, no AI cost). */
    photoUnderstanding: boolean;
  };
  /** Reply languages and mode (Languages & style page). */
  language: LanguageSettings;
  /** Full response style, including formality, emoji and owner notes. */
  style: ResponseStyle;
  faqs: { question: string; answer: string }[];
  documents: { type: string; title: string; content: string }[];
  /** Product count only; details come through the searchProducts tool so prices are always current. */
  activeProductCount: number;
  /** Appointments (Stage 6): bookable services when booking is switched on. */
  booking: { enabled: boolean; services: BookableService[] };
};

export type BookableService = { id: string; name: string; description: string | null; durationMinutes: number; price: number | null; currency: string };

/** Hard caps so a large knowledge base can't blow up the prompt. */
const MAX_FAQS = 60;
const MAX_DOCS = 20;
const MAX_DOC_CHARS = 4000;
const MAX_SERVICES = 50;

export async function buildBusinessContext(db: Db, businessId: string, now = new Date()): Promise<BusinessContext | null> {
  const [biz, settings, faqs, docs, products, langs, booking, services] = await Promise.all([
    db.from("businesses").select("*").eq("id", businessId).maybeSingle(),
    db.from("ai_settings").select("*").eq("business_id", businessId).maybeSingle(),
    db.from("faqs").select("question, answer").eq("business_id", businessId).eq("active", true).order("priority", { ascending: false }).limit(MAX_FAQS),
    db.from("knowledge_documents").select("document_type, title, content").eq("business_id", businessId).eq("active", true).limit(MAX_DOCS),
    db.from("products").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("active", true),
    db.from("business_languages").select("language_code").eq("business_id", businessId).order("sort_order", { ascending: true }),
    db.from("booking_settings").select("enabled").eq("business_id", businessId).maybeSingle(),
    db.from("services").select("id, name, description, duration_minutes, price, currency").eq("business_id", businessId).eq("active", true).order("sort_order").order("name").limit(MAX_SERVICES),
  ]);
  const b = biz.data;
  if (!b) return null;
  const s = settings.data;
  const openingHours = parseOpeningHours(b.opening_hours);
  const defaultLanguage = isLanguageCode(b.default_language) ? b.default_language : "en";
  const enabled = (langs.data ?? []).map((l) => l.language_code).filter(isLanguageCode);

  return {
    business: {
      id: b.id,
      name: b.name,
      description: b.description,
      industry: b.industry,
      city: b.city,
      address: b.address,
      phone: b.phone,
      website: b.website,
      countryCode: b.country_code,
      currency: b.currency,
      timezone: b.timezone,
      openingHours,
      openNow: isOpenAt(openingHours, b.timezone, now),
    },
    settings: {
      aiEnabled: s?.ai_enabled ?? true,
      tone: oneOf(TONES, s?.tone, "friendly"),
      replyLength: oneOf(REPLY_LENGTHS, s?.reply_length, "short"),
      greeting: s?.greeting ?? null,
      fallbackMessage: s?.fallback_message ?? null,
      afterHoursMode: oneOf(AFTER_HOURS_MODES, s?.after_hours_mode, "reply_normally"),
      afterHoursMessage: s?.after_hours_message ?? null,
      humanHandoverEnabled: s?.human_handover_enabled ?? true,
      salesMode: s?.sales_mode ?? false,
      photoUnderstanding: s?.photo_understanding ?? true,
    },
    language: {
      mode: oneOf(LANGUAGE_MODES, s?.language_mode, "auto"),
      defaultLanguage,
      enabledLanguages: enabled.length ? enabled : [defaultLanguage],
    },
    style: {
      tone: oneOf(TONES, s?.tone, "friendly"),
      formality: oneOf(FORMALITY_LEVELS, s?.formality, "neutral"),
      emojiLevel: oneOf(EMOJI_LEVELS, s?.emoji_level, "light"),
      replyLength: oneOf(REPLY_LENGTHS, s?.reply_length, "short"),
      mirrorCodeSwitching: s?.mirror_code_switching ?? false,
      styleNotes: s?.style_notes ?? "",
    },
    faqs: faqs.data ?? [],
    documents: (docs.data ?? []).map((d) => ({ type: d.document_type, title: d.title, content: d.content.slice(0, MAX_DOC_CHARS) })),
    activeProductCount: products.count ?? 0,
    booking: {
      enabled: Boolean(booking.data?.enabled) && (services.data ?? []).length > 0,
      services: (services.data ?? []).map((sv) => ({
        id: sv.id,
        name: sv.name,
        description: sv.description,
        durationMinutes: sv.duration_minutes,
        price: sv.price === null ? null : Number(sv.price),
        currency: sv.currency,
      })),
    },
  };
}

export type ConversationContext = {
  conversationId: string;
  aiEnabled: boolean;
  language: LanguageCode | null;
  customer: {
    id: string;
    whatsappPhone: string;
    name: string;
    city: string | null;
    preferredLanguage: LanguageCode | null;
    preferredLanguageSource: string | null;
    tags: string[];
  };
  /** Oldest first; only text the model may read (typed text, captions, transcripts). The last HISTORY_MESSAGES only. */
  history: { role: "customer" | "assistant" | "agent"; text: string; at: string }[];
  /** There are older messages than `history`: they are carried by `summary`. */
  hasEarlier: boolean;
  /** The assistant's running summary of the conversation so far (null until it writes one). */
  summary: string | null;
};

const MEDIA_MARKERS: Record<string, string> = { image: "[photo]", audio: "[voice note]", video: "[video]", document: "[document]", location: "[location]" };

/** Text for the model; photos, voice notes etc. show as a marker (with their caption) so the model knows they were sent. */
function historyText(type: string, text: string) {
  const marker = MEDIA_MARKERS[type];
  return (marker ? `${marker} ${text}` : text).trim();
}

export async function buildConversationContext(db: Db, businessId: string, conversationId: string): Promise<ConversationContext | null> {
  const [conv, msgs] = await Promise.all([
    db
      .from("conversations")
      .select("id, ai_enabled, language, ai_summary, customers(id, whatsapp_phone, name, city, preferred_language, preferred_language_source, tags)")
      .eq("business_id", businessId)
      .eq("id", conversationId)
      .maybeSingle(),
    db
      .from("messages")
      .select("direction, sender_type, message_type, content, caption, created_at")
      .eq("business_id", businessId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      // One more than we send, to know whether there is anything older.
      .limit(HISTORY_MESSAGES + 1),
  ]);
  const c = conv.data;
  if (!c || !c.customers) return null;
  const rows = msgs.data ?? [];
  const history = rows
    .slice(0, HISTORY_MESSAGES)
    .reverse()
    .map((m) => ({
      role: m.sender_type === "customer" ? ("customer" as const) : m.sender_type === "ai" ? ("assistant" as const) : ("agent" as const),
      text: historyText(m.message_type, m.content || m.caption || ""),
      at: m.created_at,
    }))
    .filter((m) => m.text);

  return {
    conversationId: c.id,
    aiEnabled: c.ai_enabled,
    language: isLanguageCode(c.language) ? c.language : null,
    customer: {
      id: c.customers.id,
      whatsappPhone: c.customers.whatsapp_phone,
      name: c.customers.name,
      city: c.customers.city,
      preferredLanguage: isLanguageCode(c.customers.preferred_language) ? c.customers.preferred_language : null,
      preferredLanguageSource: c.customers.preferred_language_source,
      tags: c.customers.tags,
    },
    history,
    hasEarlier: rows.length > HISTORY_MESSAGES,
    summary: c.ai_summary,
  };
}
