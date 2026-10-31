/**
 * Generated-style database types for Closer.
 *
 * These types were derived by hand from schema.sql because live Supabase
 * credentials are required to run `supabase gen types typescript`.
 * Once you have the Supabase CLI and project credentials configured, replace
 * this file by running:
 *
 *   npm run db:types
 *
 * That command will overwrite this file with the authoritative generated output.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPORTANT: Do not add application logic here. Keep to type declarations only.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      occasions: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          occasion_type: string;
          recipient_name: string | null;
          intent_summary: string | null;
          event_at: string | null;
          budget_total: string | null; // numeric(12,2) comes back as string from JS driver
          currency: string;
          guest_count: number | null;
          urgency_mode: "tonight" | "this_week" | "weeks_away";
          entry_path: "have_idea" | "discover" | "need_now" | null;
          is_surprise: boolean;
          shield_pin_hash: string | null;
          status: "planning" | "ready" | "done" | "archived";
          avoid_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          occasion_type?: string;
          recipient_name?: string | null;
          intent_summary?: string | null;
          event_at?: string | null;
          budget_total?: string | null;
          currency?: string;
          guest_count?: number | null;
          urgency_mode?: "tonight" | "this_week" | "weeks_away";
          entry_path?: "have_idea" | "discover" | "need_now" | null;
          is_surprise?: boolean;
          shield_pin_hash?: string | null;
          status?: "planning" | "ready" | "done" | "archived";
          avoid_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["occasions"]["Insert"]>;
        Relationships: [];
      };

      recipient_facts: {
        Row: {
          id: string;
          occasion_id: string;
          fact_key: string;
          fact_value: string;
          status: "known" | "possible" | "needs_confirmation";
          source: "organizer" | "friend" | "recipient";
          created_at: string;
        };
        Insert: {
          id?: string;
          occasion_id: string;
          fact_key: string;
          fact_value: string;
          status?: "known" | "possible" | "needs_confirmation";
          source?: "organizer" | "friend" | "recipient";
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["recipient_facts"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "recipient_facts_occasion_id_fkey";
            columns: ["occasion_id"];
            referencedRelation: "occasions";
            referencedColumns: ["id"];
          },
        ];
      };

      plan_items: {
        Row: {
          id: string;
          occasion_id: string;
          title: string;
          category: string;
          intent_tag: string | null;
          why: string | null;
          status: "todo" | "doing" | "done" | "skipped";
          due_at: string | null;
          estimated_cost: string | null; // numeric(12,2)
          confirmed_cost: string | null; // numeric(12,2)
          cost_status: "estimate" | "quoted" | "confirmed";
          depends_on: string[];
          plan_b: string | null;
          is_fallback: boolean;
          fallback_for: string | null;
          is_non_negotiable: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          occasion_id: string;
          title: string;
          category?: string;
          intent_tag?: string | null;
          why?: string | null;
          status?: "todo" | "doing" | "done" | "skipped";
          due_at?: string | null;
          estimated_cost?: string | null;
          confirmed_cost?: string | null;
          cost_status?: "estimate" | "quoted" | "confirmed";
          depends_on?: string[];
          plan_b?: string | null;
          is_fallback?: boolean;
          fallback_for?: string | null;
          is_non_negotiable?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["plan_items"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "plan_items_occasion_id_fkey";
            columns: ["occasion_id"];
            referencedRelation: "occasions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plan_items_fallback_for_fkey";
            columns: ["fallback_for"];
            referencedRelation: "plan_items";
            referencedColumns: ["id"];
          },
        ];
      };

      plan_versions: {
        Row: {
          id: string;
          occasion_id: string;
          version_no: number;
          snapshot: Json;
          change_summary: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          occasion_id: string;
          version_no: number;
          snapshot: Json;
          change_summary?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["plan_versions"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "plan_versions_occasion_id_fkey";
            columns: ["occasion_id"];
            referencedRelation: "occasions";
            referencedColumns: ["id"];
          },
        ];
      };

      vendors: {
        Row: {
          id: string;
          occasion_id: string;
          name: string;
          category: string;
          contact: string | null;
          status:
            | "suggested"
            | "verified"
            | "contacted"
            | "confirmed"
            | "declined";
          quote_amount: string | null; // numeric(12,2)
          quote_notes: string | null;
          quote_fields: Json;
          priority: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          occasion_id: string;
          name: string;
          category: string;
          contact?: string | null;
          status?:
            | "suggested"
            | "verified"
            | "contacted"
            | "confirmed"
            | "declined";
          quote_amount?: string | null;
          quote_notes?: string | null;
          quote_fields?: Json;
          priority?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["vendors"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "vendors_occasion_id_fkey";
            columns: ["occasion_id"];
            referencedRelation: "occasions";
            referencedColumns: ["id"];
          },
        ];
      };

      recipient_view: {
        Row: {
          occasion_id: string;
          headline: string;
          message: string | null;
          reveal_at: string | null;
          show_countdown: boolean;
          published: boolean;
          updated_at: string;
        };
        Insert: {
          occasion_id: string;
          headline?: string;
          message?: string | null;
          reveal_at?: string | null;
          show_countdown?: boolean;
          published?: boolean;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["recipient_view"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "recipient_view_occasion_id_fkey";
            columns: ["occasion_id"];
            referencedRelation: "occasions";
            referencedColumns: ["id"];
          },
        ];
      };

      blend_sessions: {
        Row: {
          id: string;
          occasion_id: string;
          stage: "pre" | "post";
          created_at: string;
        };
        Insert: {
          id?: string;
          occasion_id: string;
          stage: "pre" | "post";
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["blend_sessions"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "blend_sessions_occasion_id_fkey";
            columns: ["occasion_id"];
            referencedRelation: "occasions";
            referencedColumns: ["id"];
          },
        ];
      };

      blend_answers: {
        Row: {
          id: string;
          session_id: string;
          respondent_role: "organizer" | "friend" | "recipient";
          respondent_label: string | null;
          question_key: string;
          answer: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          respondent_role: "organizer" | "friend" | "recipient";
          respondent_label?: string | null;
          question_key: string;
          answer: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["blend_answers"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "blend_answers_session_id_fkey";
            columns: ["session_id"];
            referencedRelation: "blend_sessions";
            referencedColumns: ["id"];
          },
        ];
      };

      share_links: {
        Row: {
          id: string;
          occasion_id: string;
          role: "friend" | "recipient";
          kind: "view" | "contribute";
          token_hash: string;
          expires_at: string;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          occasion_id: string;
          role: "friend" | "recipient";
          kind?: "view" | "contribute";
          token_hash: string;
          expires_at: string;
          revoked_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["share_links"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "share_links_occasion_id_fkey";
            columns: ["occasion_id"];
            referencedRelation: "occasions";
            referencedColumns: ["id"];
          },
        ];
      };

      letters: {
        Row: {
          id: string;
          occasion_id: string;
          contributor_name: string | null;
          body: string;
          status: "pending" | "approved" | "rejected";
          created_at: string;
        };
        Insert: {
          id?: string;
          occasion_id: string;
          contributor_name?: string | null;
          body: string;
          status?: "pending" | "approved" | "rejected";
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["letters"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "letters_occasion_id_fkey";
            columns: ["occasion_id"];
            referencedRelation: "occasions";
            referencedColumns: ["id"];
          },
        ];
      };

      agent_runs: {
        Row: {
          id: string;
          occasion_id: string;
          step: string;
          detail: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          occasion_id: string;
          step: string;
          detail?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["agent_runs"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "agent_runs_occasion_id_fkey";
            columns: ["occasion_id"];
            referencedRelation: "occasions";
            referencedColumns: ["id"];
          },
        ];
      };

      rate_limits: {
        Row: {
          bucket: string;
          window_start: string;
          hits: number;
        };
        Insert: {
          bucket: string;
          window_start: string;
          hits?: number;
        };
        Update: Partial<Database["public"]["Tables"]["rate_limits"]["Insert"]>;
        Relationships: [];
      };
    };

    Views: Record<string, never>;

    Functions: {
      rate_limit_hit: {
        Args: {
          p_bucket: string;
          p_window_seconds: number;
          p_max: number;
        };
        Returns: boolean;
      };
      touch_updated_at: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      validate_plan_item_refs: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      plan_items_clean_dependents: {
        Args: Record<string, never>;
        Returns: undefined;
      };
    };

    Enums: Record<string, never>;

    CompositeTypes: Record<string, never>;
  };
};
