/**
 * Database types for the tables in supabase/migrations.
 * Regenerate with `npx supabase gen types typescript` once the Supabase CLI
 * is linked to the project; until then keep this in sync by hand.
 */
export type BusinessRole = "owner" | "admin" | "agent";

export type Database = {
  __InternalSupabase: { PostgrestVersion: "12" };
  public: {
    Tables: {
      users: {
        Row: { id: string; full_name: string; created_at: string; updated_at: string };
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
          languages: string[];
          onboarding_completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: { name?: string; languages?: string[]; timezone?: string };
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
    };
    Enums: { business_role: BusinessRole };
    CompositeTypes: Record<string, never>;
  };
};
