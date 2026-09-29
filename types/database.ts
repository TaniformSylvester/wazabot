/**
 * Database types for the tables in supabase/migrations.
 * Regenerate with `npx supabase gen types typescript` once the Supabase CLI
 * is linked to the project; until then keep this in sync by hand.
 */
import type { EmojiLevel, Formality, LanguageMode, ReplyLength, Tone } from "@/lib/ai/style";
import type { PreferenceSource } from "@/lib/ai/language/resolve";

export type BusinessRole = "owner" | "admin" | "agent";

export type Database = {
  __InternalSupabase: { PostgrestVersion: "12" };
  public: {
    Tables: {
      users: {
        Row: { id: string; full_name: string; ui_locale: string; created_at: string; updated_at: string };
        Insert: never;
        Update: { full_name?: string };
        Relationships: [];
      };
      businesses: {
        Row: {
          id: string;
          name: string;
          country_code: string;
          currency: string;
          timezone: string;
          default_language: string;
          onboarding_completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: { name?: string; timezone?: string };
        Relationships: [];
      };
      business_members: {
        Row: { business_id: string; user_id: string; role: BusinessRole; created_at: string };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      languages: {
        Row: {
          code: string;
          english_name: string;
          native_name: string;
          direction: "ltr" | "rtl";
          ui_supported: boolean;
          ai_supported: boolean;
          fallback_language: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      country_packs: {
        Row: {
          country_code: string;
          english_name: string;
          currency: string;
          timezone: string;
          default_language: string;
          status: "active" | "planned";
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      country_pack_languages: {
        Row: { country_code: string; language_code: string; sort_order: number };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      business_languages: {
        Row: { business_id: string; language_code: string; sort_order: number; created_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      ai_settings: {
        Row: {
          business_id: string;
          language_mode: LanguageMode;
          tone: Tone;
          formality: Formality;
          emoji_level: EmojiLevel;
          reply_length: ReplyLength;
          mirror_code_switching: boolean;
          style_notes: string;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          business_id: string;
          whatsapp_id: string;
          display_name: string;
          preferred_language: string | null;
          preferred_language_source: PreferenceSource | null;
          preferred_language_updated_at: string | null;
          last_detected_language: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: {
          display_name?: string;
          preferred_language?: string | null;
          preferred_language_source?: PreferenceSource | null;
          preferred_language_updated_at?: string | null;
        };
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          business_id: string;
          customer_id: string;
          channel: "whatsapp";
          status: "open" | "closed";
          handled_by: "ai" | "human";
          language: string | null;
          last_message_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          business_id: string;
          conversation_id: string;
          direction: "inbound" | "outbound";
          sender: "customer" | "ai" | "agent" | "system";
          body: string;
          language: string | null;
          language_confidence: number | null;
          secondary_language: string | null;
          is_mixed: boolean;
          language_reason: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: number;
          business_id: string;
          actor_user_id: string | null;
          action: string;
          entity_type: string | null;
          entity_id: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_business_member: { Args: { target_business_id: string }; Returns: boolean };
      has_business_role: { Args: { target_business_id: string; allowed: BusinessRole[] }; Returns: boolean };
      update_business_language_settings: {
        Args: {
          p_business_id: string;
          p_default_language: string;
          p_languages: string[];
          p_language_mode: LanguageMode;
          p_tone: Tone;
          p_formality: Formality;
          p_emoji_level: EmojiLevel;
          p_reply_length: ReplyLength;
          p_mirror_code_switching: boolean;
          p_style_notes: string;
        };
        Returns: undefined;
      };
      set_ui_locale: { Args: { p_locale: string }; Returns: undefined };
    };
    Enums: { business_role: BusinessRole };
    CompositeTypes: Record<string, never>;
  };
};
