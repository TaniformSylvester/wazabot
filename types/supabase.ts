export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      ai_conversation_windows: {
        Row: {
          business_id: string;
          claude_replies: number;
          conversation_id: string;
          created_at: string;
          ends_at: string;
          id: string;
          rule_replies: number;
          started_at: string;
        };
        Insert: {
          business_id: string;
          claude_replies?: number;
          conversation_id: string;
          created_at?: string;
          ends_at: string;
          id?: string;
          rule_replies?: number;
          started_at?: string;
        };
        Update: {
          business_id?: string;
          claude_replies?: number;
          conversation_id?: string;
          created_at?: string;
          ends_at?: string;
          id?: string;
          rule_replies?: number;
          started_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_conversation_windows_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_conversation_windows_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_settings: {
        Row: {
          after_hours_message: string | null;
          after_hours_mode: string;
          ai_enabled: boolean;
          business_id: string;
          created_at: string;
          emoji_level: string;
          fallback_message: string | null;
          formality: string;
          greeting: string | null;
          human_handover_enabled: boolean;
          language_mode: string;
          mirror_code_switching: boolean;
          photo_understanding: boolean;
          reply_length: string;
          sales_mode: boolean;
          style_notes: string;
          tone: string;
          updated_at: string;
        };
        Insert: {
          after_hours_message?: string | null;
          after_hours_mode?: string;
          ai_enabled?: boolean;
          business_id: string;
          created_at?: string;
          emoji_level?: string;
          fallback_message?: string | null;
          formality?: string;
          greeting?: string | null;
          human_handover_enabled?: boolean;
          language_mode?: string;
          mirror_code_switching?: boolean;
          photo_understanding?: boolean;
          reply_length?: string;
          sales_mode?: boolean;
          style_notes?: string;
          tone?: string;
          updated_at?: string;
        };
        Update: {
          after_hours_message?: string | null;
          after_hours_mode?: string;
          ai_enabled?: boolean;
          business_id?: string;
          created_at?: string;
          emoji_level?: string;
          fallback_message?: string | null;
          formality?: string;
          greeting?: string | null;
          human_handover_enabled?: boolean;
          language_mode?: string;
          mirror_code_switching?: boolean;
          photo_understanding?: boolean;
          reply_length?: string;
          sales_mode?: boolean;
          style_notes?: string;
          tone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_settings_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: true;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_usage: {
        Row: {
          business_id: string;
          cache_read_tokens: number;
          cache_write_tokens: number;
          conversation_id: string | null;
          created_at: string;
          duration_ms: number;
          id: string;
          inbound_message_id: string | null;
          input_tokens: number;
          model: string;
          outcome: string;
          output_tokens: number;
          reason: string | null;
          reply_message_id: string | null;
          tool_calls: number;
        };
        Insert: {
          business_id: string;
          cache_read_tokens?: number;
          cache_write_tokens?: number;
          conversation_id?: string | null;
          created_at?: string;
          duration_ms?: number;
          id?: string;
          inbound_message_id?: string | null;
          input_tokens?: number;
          model: string;
          outcome: string;
          output_tokens?: number;
          reason?: string | null;
          reply_message_id?: string | null;
          tool_calls?: number;
        };
        Update: {
          business_id?: string;
          cache_read_tokens?: number;
          cache_write_tokens?: number;
          conversation_id?: string | null;
          created_at?: string;
          duration_ms?: number;
          id?: string;
          inbound_message_id?: string | null;
          input_tokens?: number;
          model?: string;
          outcome?: string;
          output_tokens?: number;
          reason?: string | null;
          reply_message_id?: string | null;
          tool_calls?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ai_usage_business_id_conversation_id_fkey";
            columns: ["business_id", "conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "ai_usage_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      appointments: {
        Row: {
          business_id: string;
          conversation_id: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          customer_id: string;
          ends_at: string;
          id: string;
          notes: string | null;
          price: number | null;
          service_id: string | null;
          service_name: string;
          starts_at: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          business_id: string;
          conversation_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_id: string;
          ends_at: string;
          id?: string;
          notes?: string | null;
          price?: number | null;
          service_id?: string | null;
          service_name: string;
          starts_at: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          business_id?: string;
          conversation_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_id?: string;
          ends_at?: string;
          id?: string;
          notes?: string | null;
          price?: number | null;
          service_id?: string | null;
          service_name?: string;
          starts_at?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_business_id_conversation_id_fkey";
            columns: ["business_id", "conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "appointments_business_id_customer_id_fkey";
            columns: ["business_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customer_stats";
            referencedColumns: ["business_id", "customer_id"];
          },
          {
            foreignKeyName: "appointments_business_id_customer_id_fkey";
            columns: ["business_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "appointments_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_business_id_service_id_fkey";
            columns: ["business_id", "service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_user_id: string | null;
          business_id: string;
          created_at: string;
          entity_id: string | null;
          entity_type: string | null;
          id: number;
          metadata: NonNullable<Json>;
        };
        Insert: {
          action: string;
          actor_user_id?: string | null;
          business_id: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: never;
          metadata?: NonNullable<Json>;
        };
        Update: {
          action?: string;
          actor_user_id?: string | null;
          business_id?: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: never;
          metadata?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      booking_settings: {
        Row: {
          business_id: string;
          capacity: number;
          enabled: boolean;
          max_days_ahead: number;
          min_notice_minutes: number;
          slot_minutes: number;
          updated_at: string;
        };
        Insert: {
          business_id: string;
          capacity?: number;
          enabled?: boolean;
          max_days_ahead?: number;
          min_notice_minutes?: number;
          slot_minutes?: number;
          updated_at?: string;
        };
        Update: {
          business_id?: string;
          capacity?: number;
          enabled?: boolean;
          max_days_ahead?: number;
          min_notice_minutes?: number;
          slot_minutes?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "booking_settings_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: true;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      broadcast_recipients: {
        Row: {
          broadcast_id: string;
          business_id: string;
          customer_id: string;
          error: string | null;
          id: string;
          message_id: string | null;
          sent_at: string | null;
          status: string;
        };
        Insert: {
          broadcast_id: string;
          business_id: string;
          customer_id: string;
          error?: string | null;
          id?: string;
          message_id?: string | null;
          sent_at?: string | null;
          status?: string;
        };
        Update: {
          broadcast_id?: string;
          business_id?: string;
          customer_id?: string;
          error?: string | null;
          id?: string;
          message_id?: string | null;
          sent_at?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "broadcast_recipients_business_id_broadcast_id_fkey";
            columns: ["business_id", "broadcast_id"];
            isOneToOne: false;
            referencedRelation: "broadcasts";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "broadcast_recipients_business_id_customer_id_fkey";
            columns: ["business_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customer_stats";
            referencedColumns: ["business_id", "customer_id"];
          },
          {
            foreignKeyName: "broadcast_recipients_business_id_customer_id_fkey";
            columns: ["business_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      broadcasts: {
        Row: {
          audience_language: string | null;
          audience_tags: string[];
          body: string;
          business_id: string;
          created_at: string;
          created_by: string | null;
          failed_count: number;
          finished_at: string | null;
          id: string;
          language: string;
          meta_template_id: string | null;
          name: string;
          personalized: boolean;
          recipients_count: number;
          sent_count: number;
          started_at: string | null;
          status: string;
          template_name: string;
          template_reason: string | null;
          template_status: string;
          updated_at: string;
        };
        Insert: {
          audience_language?: string | null;
          audience_tags?: string[];
          body: string;
          business_id: string;
          created_at?: string;
          created_by?: string | null;
          failed_count?: number;
          finished_at?: string | null;
          id?: string;
          language: string;
          meta_template_id?: string | null;
          name: string;
          personalized?: boolean;
          recipients_count?: number;
          sent_count?: number;
          started_at?: string | null;
          status?: string;
          template_name: string;
          template_reason?: string | null;
          template_status?: string;
          updated_at?: string;
        };
        Update: {
          audience_language?: string | null;
          audience_tags?: string[];
          body?: string;
          business_id?: string;
          created_at?: string;
          created_by?: string | null;
          failed_count?: number;
          finished_at?: string | null;
          id?: string;
          language?: string;
          meta_template_id?: string | null;
          name?: string;
          personalized?: boolean;
          recipients_count?: number;
          sent_count?: number;
          started_at?: string | null;
          status?: string;
          template_name?: string;
          template_reason?: string | null;
          template_status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "broadcasts_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      business_counters: {
        Row: {
          business_id: string;
          order_seq: number;
        };
        Insert: {
          business_id: string;
          order_seq?: number;
        };
        Update: {
          business_id?: string;
          order_seq?: number;
        };
        Relationships: [
          {
            foreignKeyName: "business_counters_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: true;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      business_invitations: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          business_id: string;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          revoked_at: string | null;
          role: string;
          token_hash: string;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          business_id: string;
          created_at?: string;
          email: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          revoked_at?: string | null;
          role: string;
          token_hash: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          business_id?: string;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          revoked_at?: string | null;
          role?: string;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "business_invitations_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      business_languages: {
        Row: {
          business_id: string;
          created_at: string;
          language_code: string;
          sort_order: number;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          language_code: string;
          sort_order?: number;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          language_code?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "business_languages_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "business_languages_language_code_fkey";
            columns: ["language_code"];
            isOneToOne: false;
            referencedRelation: "languages";
            referencedColumns: ["code"];
          },
        ];
      };
      business_members: {
        Row: {
          business_id: string;
          created_at: string;
          role: Database["public"]["Enums"]["business_role"];
          user_id: string;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          role?: Database["public"]["Enums"]["business_role"];
          user_id: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          role?: Database["public"]["Enums"]["business_role"];
          user_id?: string;
        };
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
      businesses: {
        Row: {
          address: string | null;
          city: string | null;
          country_code: string;
          created_at: string;
          currency: string;
          default_language: string;
          description: string | null;
          email: string | null;
          id: string;
          industry: string | null;
          logo_url: string | null;
          name: string;
          onboarding_completed_at: string | null;
          onboarding_step: number;
          opening_hours: NonNullable<Json>;
          phone: string | null;
          receipt_footer: string | null;
          slug: string;
          status: string;
          timezone: string;
          updated_at: string;
          website: string | null;
        };
        Insert: {
          address?: string | null;
          city?: string | null;
          country_code?: string;
          created_at?: string;
          currency?: string;
          default_language?: string;
          description?: string | null;
          email?: string | null;
          id?: string;
          industry?: string | null;
          logo_url?: string | null;
          name: string;
          onboarding_completed_at?: string | null;
          onboarding_step?: number;
          opening_hours?: NonNullable<Json>;
          phone?: string | null;
          receipt_footer?: string | null;
          slug: string;
          status?: string;
          timezone?: string;
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          address?: string | null;
          city?: string | null;
          country_code?: string;
          created_at?: string;
          currency?: string;
          default_language?: string;
          description?: string | null;
          email?: string | null;
          id?: string;
          industry?: string | null;
          logo_url?: string | null;
          name?: string;
          onboarding_completed_at?: string | null;
          onboarding_step?: number;
          opening_hours?: NonNullable<Json>;
          phone?: string | null;
          receipt_footer?: string | null;
          slug?: string;
          status?: string;
          timezone?: string;
          updated_at?: string;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "businesses_country_code_fkey";
            columns: ["country_code"];
            isOneToOne: false;
            referencedRelation: "country_packs";
            referencedColumns: ["country_code"];
          },
          {
            foreignKeyName: "businesses_default_language_fkey";
            columns: ["default_language"];
            isOneToOne: false;
            referencedRelation: "languages";
            referencedColumns: ["code"];
          },
        ];
      };
      claude_calls: {
        Row: {
          ai_usage_id: string | null;
          business_id: string;
          cache_read_tokens: number;
          cache_write_1h_tokens: number;
          cache_write_5m_tokens: number;
          cost_fcfa: number;
          cost_usd: number;
          created_at: string;
          id: string;
          input_tokens: number;
          model: string;
          output_tokens: number;
          rate_known: boolean;
          source: string;
          step: number;
        };
        Insert: {
          ai_usage_id?: string | null;
          business_id: string;
          cache_read_tokens?: number;
          cache_write_1h_tokens?: number;
          cache_write_5m_tokens?: number;
          cost_fcfa: number;
          cost_usd: number;
          created_at?: string;
          id?: string;
          input_tokens?: number;
          model: string;
          output_tokens?: number;
          rate_known?: boolean;
          source: string;
          step?: number;
        };
        Update: {
          ai_usage_id?: string | null;
          business_id?: string;
          cache_read_tokens?: number;
          cache_write_1h_tokens?: number;
          cache_write_5m_tokens?: number;
          cost_fcfa?: number;
          cost_usd?: number;
          created_at?: string;
          id?: string;
          input_tokens?: number;
          model?: string;
          output_tokens?: number;
          rate_known?: boolean;
          source?: string;
          step?: number;
        };
        Relationships: [
          {
            foreignKeyName: "claude_calls_ai_usage_id_fkey";
            columns: ["ai_usage_id"];
            isOneToOne: false;
            referencedRelation: "ai_usage";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "claude_calls_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          ai_enabled: boolean;
          ai_summary: string | null;
          ai_summary_updated_at: string | null;
          assigned_to: string | null;
          business_id: string;
          channel: string;
          created_at: string;
          customer_id: string;
          human_requested: boolean;
          id: string;
          language: string | null;
          last_customer_message_at: string | null;
          last_message_at: string | null;
          status: string;
          unread_count: number;
          updated_at: string;
        };
        Insert: {
          ai_enabled?: boolean;
          ai_summary?: string | null;
          ai_summary_updated_at?: string | null;
          assigned_to?: string | null;
          business_id: string;
          channel?: string;
          created_at?: string;
          customer_id: string;
          human_requested?: boolean;
          id?: string;
          language?: string | null;
          last_customer_message_at?: string | null;
          last_message_at?: string | null;
          status?: string;
          unread_count?: number;
          updated_at?: string;
        };
        Update: {
          ai_enabled?: boolean;
          ai_summary?: string | null;
          ai_summary_updated_at?: string | null;
          assigned_to?: string | null;
          business_id?: string;
          channel?: string;
          created_at?: string;
          customer_id?: string;
          human_requested?: boolean;
          id?: string;
          language?: string | null;
          last_customer_message_at?: string | null;
          last_message_at?: string | null;
          status?: string;
          unread_count?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_business_id_customer_id_fkey";
            columns: ["business_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customer_stats";
            referencedColumns: ["business_id", "customer_id"];
          },
          {
            foreignKeyName: "conversations_business_id_customer_id_fkey";
            columns: ["business_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "conversations_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_language_fkey";
            columns: ["language"];
            isOneToOne: false;
            referencedRelation: "languages";
            referencedColumns: ["code"];
          },
        ];
      };
      country_pack_languages: {
        Row: {
          country_code: string;
          language_code: string;
          sort_order: number;
        };
        Insert: {
          country_code: string;
          language_code: string;
          sort_order?: number;
        };
        Update: {
          country_code?: string;
          language_code?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "country_pack_languages_country_code_fkey";
            columns: ["country_code"];
            isOneToOne: false;
            referencedRelation: "country_packs";
            referencedColumns: ["country_code"];
          },
          {
            foreignKeyName: "country_pack_languages_language_code_fkey";
            columns: ["language_code"];
            isOneToOne: false;
            referencedRelation: "languages";
            referencedColumns: ["code"];
          },
        ];
      };
      country_packs: {
        Row: {
          country_code: string;
          created_at: string;
          currency: string;
          default_language: string;
          english_name: string;
          status: string;
          timezone: string;
        };
        Insert: {
          country_code: string;
          created_at?: string;
          currency: string;
          default_language: string;
          english_name: string;
          status?: string;
          timezone: string;
        };
        Update: {
          country_code?: string;
          created_at?: string;
          currency?: string;
          default_language?: string;
          english_name?: string;
          status?: string;
          timezone?: string;
        };
        Relationships: [
          {
            foreignKeyName: "country_packs_default_language_fkey";
            columns: ["default_language"];
            isOneToOne: false;
            referencedRelation: "languages";
            referencedColumns: ["code"];
          },
        ];
      };
      customers: {
        Row: {
          business_id: string;
          city: string | null;
          created_at: string;
          email: string | null;
          first_contact_at: string | null;
          id: string;
          last_contact_at: string | null;
          last_detected_language: string | null;
          marketing_opt_in: boolean;
          marketing_opt_in_at: string | null;
          marketing_opt_out_at: string | null;
          name: string;
          notes: string | null;
          preferred_language: string | null;
          preferred_language_source: string | null;
          preferred_language_updated_at: string | null;
          tags: string[];
          updated_at: string;
          whatsapp_phone: string;
        };
        Insert: {
          business_id: string;
          city?: string | null;
          created_at?: string;
          email?: string | null;
          first_contact_at?: string | null;
          id?: string;
          last_contact_at?: string | null;
          last_detected_language?: string | null;
          marketing_opt_in?: boolean;
          marketing_opt_in_at?: string | null;
          marketing_opt_out_at?: string | null;
          name?: string;
          notes?: string | null;
          preferred_language?: string | null;
          preferred_language_source?: string | null;
          preferred_language_updated_at?: string | null;
          tags?: string[];
          updated_at?: string;
          whatsapp_phone: string;
        };
        Update: {
          business_id?: string;
          city?: string | null;
          created_at?: string;
          email?: string | null;
          first_contact_at?: string | null;
          id?: string;
          last_contact_at?: string | null;
          last_detected_language?: string | null;
          marketing_opt_in?: boolean;
          marketing_opt_in_at?: string | null;
          marketing_opt_out_at?: string | null;
          name?: string;
          notes?: string | null;
          preferred_language?: string | null;
          preferred_language_source?: string | null;
          preferred_language_updated_at?: string | null;
          tags?: string[];
          updated_at?: string;
          whatsapp_phone?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customers_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customers_last_detected_language_fkey";
            columns: ["last_detected_language"];
            isOneToOne: false;
            referencedRelation: "languages";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "customers_preferred_language_fkey";
            columns: ["preferred_language"];
            isOneToOne: false;
            referencedRelation: "languages";
            referencedColumns: ["code"];
          },
        ];
      };
      expenses: {
        Row: {
          amount: number;
          business_id: string;
          category: string;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          payment_method: string | null;
          reference: string | null;
          spent_on: string;
          updated_at: string;
        };
        Insert: {
          amount: number;
          business_id: string;
          category: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          payment_method?: string | null;
          reference?: string | null;
          spent_on?: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          business_id?: string;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          payment_method?: string | null;
          reference?: string | null;
          spent_on?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      faqs: {
        Row: {
          active: boolean;
          answer: string;
          business_id: string;
          category: string | null;
          created_at: string;
          id: string;
          priority: number;
          question: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          answer: string;
          business_id: string;
          category?: string | null;
          created_at?: string;
          id?: string;
          priority?: number;
          question: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          answer?: string;
          business_id?: string;
          category?: string | null;
          created_at?: string;
          id?: string;
          priority?: number;
          question?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "faqs_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      knowledge_documents: {
        Row: {
          active: boolean;
          business_id: string;
          content: string;
          created_at: string;
          document_type: string;
          id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          business_id: string;
          content: string;
          created_at?: string;
          document_type?: string;
          id?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          business_id?: string;
          content?: string;
          created_at?: string;
          document_type?: string;
          id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      languages: {
        Row: {
          ai_supported: boolean;
          code: string;
          created_at: string;
          direction: string;
          english_name: string;
          fallback_language: string | null;
          native_name: string;
          ui_supported: boolean;
        };
        Insert: {
          ai_supported?: boolean;
          code: string;
          created_at?: string;
          direction?: string;
          english_name: string;
          fallback_language?: string | null;
          native_name: string;
          ui_supported?: boolean;
        };
        Update: {
          ai_supported?: boolean;
          code?: string;
          created_at?: string;
          direction?: string;
          english_name?: string;
          fallback_language?: string | null;
          native_name?: string;
          ui_supported?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "languages_fallback_language_fkey";
            columns: ["fallback_language"];
            isOneToOne: false;
            referencedRelation: "languages";
            referencedColumns: ["code"];
          },
        ];
      };
      message_image_analyses: {
        Row: {
          business_id: string;
          catalog_matches: NonNullable<Json>;
          completed_at: string | null;
          created_at: string;
          description: string | null;
          error_code: string | null;
          extracted_text: string | null;
          id: string;
          media_id: string;
          message_id: string;
          model: string | null;
          outcome: string | null;
          provider: string | null;
          status: string;
        };
        Insert: {
          business_id: string;
          catalog_matches?: NonNullable<Json>;
          completed_at?: string | null;
          created_at?: string;
          description?: string | null;
          error_code?: string | null;
          extracted_text?: string | null;
          id?: string;
          media_id: string;
          message_id: string;
          model?: string | null;
          outcome?: string | null;
          provider?: string | null;
          status?: string;
        };
        Update: {
          business_id?: string;
          catalog_matches?: NonNullable<Json>;
          completed_at?: string | null;
          created_at?: string;
          description?: string | null;
          error_code?: string | null;
          extracted_text?: string | null;
          id?: string;
          media_id?: string;
          message_id?: string;
          model?: string | null;
          outcome?: string | null;
          provider?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_image_analyses_business_id_media_id_fkey";
            columns: ["business_id", "media_id"];
            isOneToOne: true;
            referencedRelation: "message_media";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "message_image_analyses_business_id_message_id_fkey";
            columns: ["business_id", "message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      message_media: {
        Row: {
          business_id: string;
          created_at: string;
          delete_after: string | null;
          duration_seconds: number | null;
          height: number | null;
          id: string;
          is_voice: boolean;
          kind: string;
          message_id: string;
          mime_type: string;
          original_filename: string | null;
          sha256: string | null;
          size_bytes: number | null;
          status: string;
          storage_bucket: string;
          storage_path: string | null;
          updated_at: string;
          whatsapp_media_id: string | null;
          width: number | null;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          delete_after?: string | null;
          duration_seconds?: number | null;
          height?: number | null;
          id?: string;
          is_voice?: boolean;
          kind: string;
          message_id: string;
          mime_type: string;
          original_filename?: string | null;
          sha256?: string | null;
          size_bytes?: number | null;
          status?: string;
          storage_bucket?: string;
          storage_path?: string | null;
          updated_at?: string;
          whatsapp_media_id?: string | null;
          width?: number | null;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          delete_after?: string | null;
          duration_seconds?: number | null;
          height?: number | null;
          id?: string;
          is_voice?: boolean;
          kind?: string;
          message_id?: string;
          mime_type?: string;
          original_filename?: string | null;
          sha256?: string | null;
          size_bytes?: number | null;
          status?: string;
          storage_bucket?: string;
          storage_path?: string | null;
          updated_at?: string;
          whatsapp_media_id?: string | null;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "message_media_business_id_message_id_fkey";
            columns: ["business_id", "message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      message_transcriptions: {
        Row: {
          business_id: string;
          completed_at: string | null;
          confidence: number | null;
          created_at: string;
          error_code: string | null;
          id: string;
          language: string | null;
          language_confidence: number | null;
          media_id: string;
          message_id: string;
          model: string | null;
          provider: string | null;
          status: string;
          transcript: string | null;
        };
        Insert: {
          business_id: string;
          completed_at?: string | null;
          confidence?: number | null;
          created_at?: string;
          error_code?: string | null;
          id?: string;
          language?: string | null;
          language_confidence?: number | null;
          media_id: string;
          message_id: string;
          model?: string | null;
          provider?: string | null;
          status?: string;
          transcript?: string | null;
        };
        Update: {
          business_id?: string;
          completed_at?: string | null;
          confidence?: number | null;
          created_at?: string;
          error_code?: string | null;
          id?: string;
          language?: string | null;
          language_confidence?: number | null;
          media_id?: string;
          message_id?: string;
          model?: string | null;
          provider?: string | null;
          status?: string;
          transcript?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "message_transcriptions_business_id_media_id_fkey";
            columns: ["business_id", "media_id"];
            isOneToOne: true;
            referencedRelation: "message_media";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "message_transcriptions_business_id_message_id_fkey";
            columns: ["business_id", "message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "message_transcriptions_language_fkey";
            columns: ["language"];
            isOneToOne: false;
            referencedRelation: "languages";
            referencedColumns: ["code"];
          },
        ];
      };
      messages: {
        Row: {
          ai_confidence: number | null;
          ai_generated: boolean;
          ai_model: string | null;
          business_id: string;
          caption: string | null;
          content: string;
          conversation_id: string;
          created_at: string;
          delivery_error: string | null;
          delivery_status: string | null;
          direction: string;
          id: string;
          is_mixed: boolean;
          language: string | null;
          language_confidence: number | null;
          language_reason: string | null;
          message_type: string;
          meta_billable: boolean | null;
          meta_category: string | null;
          meta_pricing_type: string | null;
          payload: NonNullable<Json>;
          processing_error: string | null;
          processing_status: string;
          secondary_language: string | null;
          sender_type: string;
          sent_by: string | null;
          status_updated_at: string | null;
          wa_category: string | null;
          whatsapp_message_id: string | null;
        };
        Insert: {
          ai_confidence?: number | null;
          ai_generated?: boolean;
          ai_model?: string | null;
          business_id: string;
          caption?: string | null;
          content?: string;
          conversation_id: string;
          created_at?: string;
          delivery_error?: string | null;
          delivery_status?: string | null;
          direction: string;
          id?: string;
          is_mixed?: boolean;
          language?: string | null;
          language_confidence?: number | null;
          language_reason?: string | null;
          message_type?: string;
          meta_billable?: boolean | null;
          meta_category?: string | null;
          meta_pricing_type?: string | null;
          payload?: NonNullable<Json>;
          processing_error?: string | null;
          processing_status?: string;
          secondary_language?: string | null;
          sender_type: string;
          sent_by?: string | null;
          status_updated_at?: string | null;
          wa_category?: string | null;
          whatsapp_message_id?: string | null;
        };
        Update: {
          ai_confidence?: number | null;
          ai_generated?: boolean;
          ai_model?: string | null;
          business_id?: string;
          caption?: string | null;
          content?: string;
          conversation_id?: string;
          created_at?: string;
          delivery_error?: string | null;
          delivery_status?: string | null;
          direction?: string;
          id?: string;
          is_mixed?: boolean;
          language?: string | null;
          language_confidence?: number | null;
          language_reason?: string | null;
          message_type?: string;
          meta_billable?: boolean | null;
          meta_category?: string | null;
          meta_pricing_type?: string | null;
          payload?: NonNullable<Json>;
          processing_error?: string | null;
          processing_status?: string;
          secondary_language?: string | null;
          sender_type?: string;
          sent_by?: string | null;
          status_updated_at?: string | null;
          wa_category?: string | null;
          whatsapp_message_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "messages_business_id_conversation_id_fkey";
            columns: ["business_id", "conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "messages_language_fkey";
            columns: ["language"];
            isOneToOne: false;
            referencedRelation: "languages";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "messages_secondary_language_fkey";
            columns: ["secondary_language"];
            isOneToOne: false;
            referencedRelation: "languages";
            referencedColumns: ["code"];
          },
        ];
      };
      notification_settings: {
        Row: {
          appointment_reminders: boolean;
          appointment_updates: boolean;
          business_id: string;
          order_updates: boolean;
          updated_at: string;
        };
        Insert: {
          appointment_reminders?: boolean;
          appointment_updates?: boolean;
          business_id: string;
          order_updates?: boolean;
          updated_at?: string;
        };
        Update: {
          appointment_reminders?: boolean;
          appointment_updates?: boolean;
          business_id?: string;
          order_updates?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_settings_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: true;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          appointment_id: string | null;
          business_id: string;
          channel: string | null;
          created_at: string;
          customer_id: string | null;
          event_key: string;
          id: string;
          kind: string;
          message_id: string | null;
          order_id: string | null;
          reason: string | null;
          status: string;
        };
        Insert: {
          appointment_id?: string | null;
          business_id: string;
          channel?: string | null;
          created_at?: string;
          customer_id?: string | null;
          event_key: string;
          id?: string;
          kind: string;
          message_id?: string | null;
          order_id?: string | null;
          reason?: string | null;
          status: string;
        };
        Update: {
          appointment_id?: string | null;
          business_id?: string;
          channel?: string | null;
          created_at?: string;
          customer_id?: string | null;
          event_key?: string;
          id?: string;
          kind?: string;
          message_id?: string | null;
          order_id?: string | null;
          reason?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_business_id_appointment_id_fkey";
            columns: ["business_id", "appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "notifications_business_id_customer_id_fkey";
            columns: ["business_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customer_stats";
            referencedColumns: ["business_id", "customer_id"];
          },
          {
            foreignKeyName: "notifications_business_id_customer_id_fkey";
            columns: ["business_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "notifications_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_business_id_order_id_fkey";
            columns: ["business_id", "order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      order_items: {
        Row: {
          business_id: string;
          id: string;
          order_id: string;
          product_id: string | null;
          product_name: string;
          quantity: number;
          total: number;
          unit_cost: number | null;
          unit_price: number;
          variant: string | null;
          variant_id: string | null;
        };
        Insert: {
          business_id: string;
          id?: string;
          order_id: string;
          product_id?: string | null;
          product_name: string;
          quantity: number;
          total: number;
          unit_cost?: number | null;
          unit_price: number;
          variant?: string | null;
          variant_id?: string | null;
        };
        Update: {
          business_id?: string;
          id?: string;
          order_id?: string;
          product_id?: string | null;
          product_name?: string;
          quantity?: number;
          total?: number;
          unit_cost?: number | null;
          unit_price?: number;
          variant?: string | null;
          variant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_business_id_order_id_fkey";
            columns: ["business_id", "order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      order_payments: {
        Row: {
          amount: number;
          business_id: string;
          created_at: string;
          customer_id: string | null;
          group_id: string;
          id: string;
          method: string;
          order_id: string;
          provider: string;
          received_at: string;
          recorded_by: string | null;
          reference: string | null;
        };
        Insert: {
          amount: number;
          business_id: string;
          created_at?: string;
          customer_id?: string | null;
          group_id?: string;
          id?: string;
          method: string;
          order_id: string;
          provider?: string;
          received_at?: string;
          recorded_by?: string | null;
          reference?: string | null;
        };
        Update: {
          amount?: number;
          business_id?: string;
          created_at?: string;
          customer_id?: string | null;
          group_id?: string;
          id?: string;
          method?: string;
          order_id?: string;
          provider?: string;
          received_at?: string;
          recorded_by?: string | null;
          reference?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "order_payments_business_id_customer_id_fkey";
            columns: ["business_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customer_stats";
            referencedColumns: ["business_id", "customer_id"];
          },
          {
            foreignKeyName: "order_payments_business_id_customer_id_fkey";
            columns: ["business_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "order_payments_business_id_order_id_fkey";
            columns: ["business_id", "order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      orders: {
        Row: {
          amount_paid: number;
          business_id: string;
          channel: string;
          client_key: string | null;
          conversation_id: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          customer_id: string | null;
          delivery_address: string | null;
          delivery_fee: number;
          discount: number;
          id: string;
          notes: string | null;
          order_number: string;
          payment_method: string | null;
          payment_status: string;
          status: string;
          stock_applied: boolean;
          stock_managed: boolean;
          subtotal: number;
          total: number;
          updated_at: string;
        };
        Insert: {
          amount_paid?: number;
          business_id: string;
          channel?: string;
          client_key?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_id?: string | null;
          delivery_address?: string | null;
          delivery_fee?: number;
          discount?: number;
          id?: string;
          notes?: string | null;
          order_number: string;
          payment_method?: string | null;
          payment_status?: string;
          status?: string;
          stock_applied?: boolean;
          stock_managed?: boolean;
          subtotal?: number;
          total?: number;
          updated_at?: string;
        };
        Update: {
          amount_paid?: number;
          business_id?: string;
          channel?: string;
          client_key?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_id?: string | null;
          delivery_address?: string | null;
          delivery_fee?: number;
          discount?: number;
          id?: string;
          notes?: string | null;
          order_number?: string;
          payment_method?: string | null;
          payment_status?: string;
          status?: string;
          stock_applied?: boolean;
          stock_managed?: boolean;
          subtotal?: number;
          total?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_business_id_conversation_id_fkey";
            columns: ["business_id", "conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "orders_business_id_customer_id_fkey";
            columns: ["business_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customer_stats";
            referencedColumns: ["business_id", "customer_id"];
          },
          {
            foreignKeyName: "orders_business_id_customer_id_fkey";
            columns: ["business_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "orders_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_change_requests: {
        Row: {
          billing_interval: string;
          business_id: string;
          contact_phone: string | null;
          created_at: string;
          decided_at: string | null;
          from_plan_id: string | null;
          id: string;
          kind: string;
          note: string | null;
          requested_by: string | null;
          status: string;
          to_plan_id: string;
        };
        Insert: {
          billing_interval?: string;
          business_id: string;
          contact_phone?: string | null;
          created_at?: string;
          decided_at?: string | null;
          from_plan_id?: string | null;
          id?: string;
          kind?: string;
          note?: string | null;
          requested_by?: string | null;
          status?: string;
          to_plan_id: string;
        };
        Update: {
          billing_interval?: string;
          business_id?: string;
          contact_phone?: string | null;
          created_at?: string;
          decided_at?: string | null;
          from_plan_id?: string | null;
          id?: string;
          kind?: string;
          note?: string | null;
          requested_by?: string | null;
          status?: string;
          to_plan_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_change_requests_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plan_change_requests_from_plan_id_fkey";
            columns: ["from_plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plan_change_requests_to_plan_id_fkey";
            columns: ["to_plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      plans: {
        Row: {
          active: boolean;
          ai_conversations_per_month: number;
          created_at: string;
          currency: string;
          highlighted: boolean;
          id: string;
          legacy_conversations_per_month: number | null;
          monthly_price: number;
          name: string;
          sort_order: number;
        };
        Insert: {
          active?: boolean;
          ai_conversations_per_month: number;
          created_at?: string;
          currency?: string;
          highlighted?: boolean;
          id: string;
          legacy_conversations_per_month?: number | null;
          monthly_price: number;
          name: string;
          sort_order?: number;
        };
        Update: {
          active?: boolean;
          ai_conversations_per_month?: number;
          created_at?: string;
          currency?: string;
          highlighted?: boolean;
          id?: string;
          legacy_conversations_per_month?: number | null;
          monthly_price?: number;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      platform_admins: {
        Row: {
          created_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      platform_alerts: {
        Row: {
          business_id: string | null;
          created_at: string;
          id: string;
          kind: string;
          period_key: string;
        };
        Insert: {
          business_id?: string | null;
          created_at?: string;
          id?: string;
          kind: string;
          period_key: string;
        };
        Update: {
          business_id?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          period_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_alerts_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_business_controls: {
        Row: {
          ai_paused: boolean;
          business_id: string;
          reason: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          ai_paused?: boolean;
          business_id: string;
          reason?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          ai_paused?: boolean;
          business_id?: string;
          reason?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "platform_business_controls_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: true;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      product_variants: {
        Row: {
          business_id: string;
          created_at: string;
          id: string;
          name: string;
          price_modifier: number;
          product_id: string;
          sort_order: number;
          stock_quantity: number | null;
          value: string;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          id?: string;
          name: string;
          price_modifier?: number;
          product_id: string;
          sort_order?: number;
          stock_quantity?: number | null;
          value: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
          price_modifier?: number;
          product_id?: string;
          sort_order?: number;
          stock_quantity?: number | null;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_variants_business_id_product_id_fkey";
            columns: ["business_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      products: {
        Row: {
          active: boolean;
          business_id: string;
          category: string | null;
          cost_price: number | null;
          created_at: string;
          currency: string;
          description: string | null;
          id: string;
          image_url: string | null;
          low_stock_threshold: number;
          name: string;
          price: number;
          sku: string | null;
          stock_low: boolean | null;
          stock_quantity: number | null;
          unit: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          business_id: string;
          category?: string | null;
          cost_price?: number | null;
          created_at?: string;
          currency?: string;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          low_stock_threshold?: number;
          name: string;
          price?: number;
          sku?: string | null;
          stock_low?: never;
          stock_quantity?: number | null;
          unit?: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          business_id?: string;
          category?: string | null;
          cost_price?: number | null;
          created_at?: string;
          currency?: string;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          low_stock_threshold?: number;
          name?: string;
          price?: number;
          sku?: string | null;
          stock_low?: never;
          stock_quantity?: number | null;
          unit?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      services: {
        Row: {
          active: boolean;
          business_id: string;
          created_at: string;
          currency: string;
          description: string | null;
          duration_minutes: number;
          id: string;
          name: string;
          price: number | null;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          business_id: string;
          created_at?: string;
          currency?: string;
          description?: string | null;
          duration_minutes: number;
          id?: string;
          name: string;
          price?: number | null;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          business_id?: string;
          created_at?: string;
          currency?: string;
          description?: string | null;
          duration_minutes?: number;
          id?: string;
          name?: string;
          price?: number | null;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "services_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_movements: {
        Row: {
          business_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          new_stock: number;
          note: string | null;
          order_id: string | null;
          previous_stock: number;
          product_id: string;
          quantity_change: number;
          reason: string;
          variant_id: string | null;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          new_stock: number;
          note?: string | null;
          order_id?: string | null;
          previous_stock: number;
          product_id: string;
          quantity_change: number;
          reason: string;
          variant_id?: string | null;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          new_stock?: number;
          note?: string | null;
          order_id?: string | null;
          previous_stock?: number;
          product_id?: string;
          quantity_change?: number;
          reason?: string;
          variant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "stock_movements_business_id_order_id_fkey";
            columns: ["business_id", "order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "stock_movements_business_id_product_id_fkey";
            columns: ["business_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "stock_movements_business_id_variant_id_fkey";
            columns: ["business_id", "variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      subscription_payments: {
        Row: {
          amount: number;
          billing_interval: string;
          business_id: string;
          created_at: string;
          currency: string;
          id: string;
          method: string;
          period_end: string;
          period_start: string;
          plan_id: string;
          provider: string;
          recorded_by: string | null;
          reference: string | null;
          request_id: string | null;
        };
        Insert: {
          amount: number;
          billing_interval: string;
          business_id: string;
          created_at?: string;
          currency?: string;
          id?: string;
          method: string;
          period_end: string;
          period_start: string;
          plan_id: string;
          provider?: string;
          recorded_by?: string | null;
          reference?: string | null;
          request_id?: string | null;
        };
        Update: {
          amount?: number;
          billing_interval?: string;
          business_id?: string;
          created_at?: string;
          currency?: string;
          id?: string;
          method?: string;
          period_end?: string;
          period_start?: string;
          plan_id?: string;
          provider?: string;
          recorded_by?: string | null;
          reference?: string | null;
          request_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "subscription_payments_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscription_payments_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscription_payments_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "plan_change_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          billing_interval: string;
          business_id: string;
          created_at: string;
          current_period_end: string;
          current_period_start: string;
          plan_id: string;
          rules_from: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          billing_interval?: string;
          business_id: string;
          created_at?: string;
          current_period_end?: string;
          current_period_start?: string;
          plan_id: string;
          rules_from?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          billing_interval?: string;
          business_id?: string;
          created_at?: string;
          current_period_end?: string;
          current_period_start?: string;
          plan_id?: string;
          rules_from?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: true;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          ui_locale: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id: string;
          ui_locale?: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          ui_locale?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "users_ui_locale_fkey";
            columns: ["ui_locale"];
            isOneToOne: false;
            referencedRelation: "languages";
            referencedColumns: ["code"];
          },
        ];
      };
      whatsapp_connections: {
        Row: {
          business_id: string;
          connected_at: string | null;
          created_at: string;
          display_phone_number: string | null;
          last_error: string | null;
          phone_number_id: string | null;
          status: string;
          updated_at: string;
          verified_name: string | null;
          waba_id: string | null;
        };
        Insert: {
          business_id: string;
          connected_at?: string | null;
          created_at?: string;
          display_phone_number?: string | null;
          last_error?: string | null;
          phone_number_id?: string | null;
          status?: string;
          updated_at?: string;
          verified_name?: string | null;
          waba_id?: string | null;
        };
        Update: {
          business_id?: string;
          connected_at?: string | null;
          created_at?: string;
          display_phone_number?: string | null;
          last_error?: string | null;
          phone_number_id?: string | null;
          status?: string;
          updated_at?: string;
          verified_name?: string | null;
          waba_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_connections_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: true;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_credentials: {
        Row: {
          access_token_encrypted: string;
          business_id: string;
          created_at: string;
          token_hint: string | null;
          updated_at: string;
        };
        Insert: {
          access_token_encrypted: string;
          business_id: string;
          created_at?: string;
          token_hint?: string | null;
          updated_at?: string;
        };
        Update: {
          access_token_encrypted?: string;
          business_id?: string;
          created_at?: string;
          token_hint?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_credentials_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: true;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_number_history: {
        Row: {
          business_id: string;
          first_connected_at: string;
          phone_digits: string | null;
          phone_number_id: string;
        };
        Insert: {
          business_id: string;
          first_connected_at?: string;
          phone_digits?: string | null;
          phone_number_id: string;
        };
        Update: {
          business_id?: string;
          first_connected_at?: string;
          phone_digits?: string | null;
          phone_number_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_number_history_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_templates: {
        Row: {
          body: string;
          business_id: string;
          id: string;
          kind: string;
          language: string;
          meta_template_id: string | null;
          name: string;
          rejected_reason: string | null;
          status: string;
          submitted_at: string;
          updated_at: string;
        };
        Insert: {
          body: string;
          business_id: string;
          id?: string;
          kind: string;
          language: string;
          meta_template_id?: string | null;
          name: string;
          rejected_reason?: string | null;
          status?: string;
          submitted_at?: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          business_id?: string;
          id?: string;
          kind?: string;
          language?: string;
          meta_template_id?: string | null;
          name?: string;
          rejected_reason?: string | null;
          status?: string;
          submitted_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_usage: {
        Row: {
          business_id: string;
          category: string;
          month: string;
          phone_number_id: string;
          sent: number;
          updated_at: string;
        };
        Insert: {
          business_id: string;
          category: string;
          month: string;
          phone_number_id: string;
          sent?: number;
          updated_at?: string;
        };
        Update: {
          business_id?: string;
          category?: string;
          month?: string;
          phone_number_id?: string;
          sent?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_usage_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      customer_stats: {
        Row: {
          amount_paid: number | null;
          business_id: string | null;
          customer_id: string | null;
          last_purchase_at: string | null;
          orders_count: number | null;
          outstanding: number | null;
          total_spent: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "customers_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: string };
      adjust_stock: {
        Args: {
          p_business_id: string;
          p_new_stock?: number;
          p_note?: string;
          p_product_id: string;
          p_quantity?: number;
          p_reason: string;
          p_variant_id?: string;
        };
        Returns: number;
      };
      admin_cost_report: {
        Args: { p_free_service: number; p_month: string };
        Returns: {
          ai_conversations: number;
          business_id: string;
          business_name: string;
          claude_reply_fcfa: number;
          claude_requests: number;
          claude_test_fcfa: number;
          claude_usd: number;
          marketing_sent: number;
          plan_id: string;
          service_over_free: number;
          service_sent: number;
          subscription_status: string;
          utility_sent: number;
        }[];
      };
      ai_usage_status: {
        Args: { p_business_id: string };
        Returns: {
          billing_interval: string;
          conversation_limit: number;
          conversations_used: number;
          counting: string;
          current_period_end: string;
          monthly_price: number;
          period_end: string;
          period_start: string;
          plan_id: string;
          plan_name: string;
          rules_from: string;
          subscription_status: string;
        }[];
      };
      apply_billing_expiry: {
        Args: { p_grace_days?: number };
        Returns: {
          action: string;
          business_id: string;
          period_end: string;
          plan_id: string;
        }[];
      };
      apply_order_stock: { Args: { p_direction: number; p_order_id: string }; Returns: undefined };
      approve_plan_change: {
        Args: {
          p_actor?: string;
          p_amount?: number;
          p_grace_days?: number;
          p_method?: string;
          p_reference?: string;
          p_request_id: string;
        };
        Returns: undefined;
      };
      assert_business_default_language: { Args: { target: string }; Returns: undefined };
      available_slots: {
        Args: { p_business_id: string; p_days?: number; p_from?: string; p_service_id: string };
        Returns: {
          ends_at: string;
          starts_at: string;
        }[];
      };
      book_appointment: {
        Args: {
          p_business_id: string;
          p_conversation_id?: string;
          p_customer_id: string;
          p_notes?: string;
          p_service_id: string;
          p_starts_at: string;
        };
        Returns: string;
      };
      business_slug: { Args: { p_id: string; p_name: string }; Returns: string };
      cancel_plan_change: { Args: { p_request_id: string }; Returns: undefined };
      claude_spend_since: { Args: { p_business_id: string; p_since: string }; Returns: number };
      create_invitation: {
        Args: { p_business_id: string; p_email: string; p_role: string; p_token_hash: string };
        Returns: string;
      };
      create_order: {
        Args: {
          p_business_id: string;
          p_channel?: string;
          p_client_key?: string;
          p_conversation_id?: string;
          p_customer_id: string;
          p_delivery_address?: string;
          p_delivery_fee?: number;
          p_discount?: number;
          p_items: Json;
          p_notes?: string;
          p_payment_method?: string;
          p_status?: string;
        };
        Returns: string;
      };
      create_sale: {
        Args: {
          p_business_id: string;
          p_client_key: string;
          p_customer_id?: string;
          p_discount?: number;
          p_items: Json;
          p_notes?: string;
          p_payments?: Json;
        };
        Returns: string;
      };
      delivery_status_rank: { Args: { s: string }; Returns: number };
      get_invitation: {
        Args: { p_token: string };
        Returns: {
          business_name: string;
          email: string;
          inviter_name: string;
          role: string;
          state: string;
        }[];
      };
      has_business_role: {
        Args: {
          allowed: Database["public"]["Enums"]["business_role"][];
          target_business_id: string;
        };
        Returns: boolean;
      };
      has_min_role: { Args: { min_role: string; target_business_id: string }; Returns: boolean };
      ingest_whatsapp_message: {
        Args: {
          p_caption: string;
          p_content: string;
          p_from: string;
          p_is_mixed?: boolean;
          p_language?: string;
          p_language_confidence?: number;
          p_message_type: string;
          p_payload: Json;
          p_phone_number_id: string;
          p_processing_error?: string;
          p_processing_status: string;
          p_profile_name: string;
          p_received_at: string;
          p_secondary_language?: string;
          p_whatsapp_message_id: string;
        };
        Returns: {
          business_id: string;
          conversation_id: string;
          customer_id: string;
          inserted: boolean;
          message_id: string;
        }[];
      };
      is_business_member: { Args: { target_business_id: string }; Returns: boolean };
      prepare_broadcast: { Args: { p_broadcast_id: string }; Returns: number };
      product_sales: {
        Args: { p_business_id: string; p_from: string; p_to: string };
        Returns: {
          cogs: number;
          items_without_cost: number;
          product_id: string;
          product_name: string;
          quantity: number;
          revenue: number;
        }[];
      };
      record_ai_reply: {
        Args: {
          p_business_id: string;
          p_claude: boolean;
          p_conversation_id: string;
          p_window_hours?: number;
        };
        Returns: {
          business_id: string;
          claude_replies: number;
          conversation_id: string;
          created_at: string;
          ends_at: string;
          id: string;
          rule_replies: number;
          started_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "ai_conversation_windows";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      record_customer_payment: {
        Args: {
          p_amount: number;
          p_business_id: string;
          p_client_key?: string;
          p_customer_id: string;
          p_method: string;
          p_reference?: string;
        };
        Returns: string;
      };
      record_order_payment: {
        Args: {
          p_amount: number;
          p_business_id: string;
          p_client_key?: string;
          p_method: string;
          p_order_id: string;
          p_reference?: string;
        };
        Returns: string;
      };
      record_whatsapp_send: {
        Args: { p_business_id: string; p_category: string; p_phone_number_id: string };
        Returns: undefined;
      };
      record_whatsapp_status: {
        Args: {
          p_at?: string;
          p_error?: string;
          p_phone_number_id: string;
          p_status: string;
          p_whatsapp_message_id: string;
        };
        Returns: boolean;
      };
      reject_plan_change: { Args: { p_request_id: string }; Returns: undefined };
      remove_member: { Args: { p_business_id: string; p_user_id: string }; Returns: undefined };
      renew_invitation: {
        Args: { p_invitation_id: string; p_token_hash: string };
        Returns: undefined;
      };
      request_plan_change: {
        Args: {
          p_business_id: string;
          p_contact_phone?: string;
          p_interval?: string;
          p_note?: string;
          p_plan_id: string;
        };
        Returns: string;
      };
      revoke_invitation: { Args: { p_invitation_id: string }; Returns: undefined };
      role_rank: { Args: { r: string }; Returns: number };
      sales_by_day: {
        Args: { p_business_id: string; p_from: string; p_to: string };
        Returns: {
          cogs: number;
          day: string;
          discounts: number;
          items_without_cost: number;
          revenue: number;
          sales: number;
        }[];
      };
      set_ui_locale: { Args: { p_locale: string }; Returns: undefined };
      shares_business_with: { Args: { other_user: string }; Returns: boolean };
      token_sha256: { Args: { p_token: string }; Returns: string };
      update_business_language_settings: {
        Args: {
          p_business_id: string;
          p_default_language: string;
          p_emoji_level: string;
          p_formality: string;
          p_language_mode: string;
          p_languages: string[];
          p_mirror_code_switching: boolean;
          p_reply_length: string;
          p_style_notes: string;
          p_tone: string;
        };
        Returns: undefined;
      };
      update_member_role: {
        Args: { p_business_id: string; p_role: string; p_user_id: string };
        Returns: undefined;
      };
      whatsapp_free_usage: {
        Args: { p_business_id: string };
        Returns: {
          month: string;
          phone_number_id: string;
          service_sent: number;
        }[];
      };
    };
    Enums: {
      business_role: "owner" | "admin" | "agent" | "viewer";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      business_role: ["owner", "admin", "agent", "viewer"],
    },
  },
} as const;
