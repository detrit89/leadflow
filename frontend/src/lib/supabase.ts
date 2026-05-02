import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type CampaignRow = {
  id: string;
  name: string;
  target: string;
  offer: string;
  tone: string;
  channel: string;
  user_id: string;
  created_at: string;
};

type CampaignInsert = {
  name: string;
  target: string;
  offer: string;
  tone: string;
  channel: string;
  user_id: string;
};

type MessageInsert = {
  content: string;
  campaign_id: string;
  lead_id: string | null;
  user_id: string;
  type?: string;
  parent_message_id?: string | null;
  sequence_number?: number;
};

type MessageRow = MessageInsert & {
  id: string;
  created_at: string;
};

type LeadStatus = "new" | "contacted" | "replied" | "interested";

type LeadRow = {
  id: string;
  name: string;
  company: string;
  role: string;
  website: string;
  email?: string;
  status: LeadStatus;
  user_id: string;
  created_at: string;
};

type LeadInsert = {
  id?: string;
  name: string;
  company: string;
  role: string;
  website: string;
  email?: string;
  status: LeadStatus;
  user_id: string;
};

type PasswordHintRow = {
  id: string;
  email: string;
  hint: string;
  created_at: string;
};

type PasswordHintInsert = {
  email: string;
  hint: string;
};

type Database = {
  public: {
    Tables: {
      campaigns: {
        Row: CampaignRow;
        Insert: CampaignInsert;
        Update: Partial<CampaignInsert>;
        Relationships: [
          {
            foreignKeyName: "messages_campaign_id_fkey";
            columns: ["id"];
            referencedRelation: "messages";
            referencedColumns: ["campaign_id"];
          },
        ];
      };
      messages: {
        Row: MessageRow;
        Insert: MessageInsert;
        Update: Partial<MessageInsert>;
        Relationships: [
          {
            foreignKeyName: "messages_lead_id_fkey";
            columns: ["lead_id"];
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_campaign_id_fkey";
            columns: ["campaign_id"];
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
        ];
      };
      leads: {
        Row: LeadRow;
        Insert: LeadInsert;
        Update: Partial<LeadInsert>;
        Relationships: [];
      };
      password_hints: {
        Row: PasswordHintRow;
        Insert: PasswordHintInsert;
        Update: Partial<PasswordHintInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl, supabaseAnonKey)
  : null;
