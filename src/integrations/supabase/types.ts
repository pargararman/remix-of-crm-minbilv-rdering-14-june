export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_timeline: {
        Row: {
          actor_id: string | null
          actor_type: string
          created_at: string
          description: string | null
          id: string
          lead_id: string
          metadata: Json
          type: string
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          description?: string | null
          id?: string
          lead_id: string
          metadata?: Json
          type: string
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          description?: string | null
          id?: string
          lead_id?: string
          metadata?: Json
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_timeline_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_sla_metrics"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "activity_timeline_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      auction_bids: {
        Row: {
          amount: number
          bid_number: number
          created_at: string
          dealer_id: string
          id: string
          lead_id: string
          user_id: string | null
        }
        Insert: {
          amount: number
          bid_number: number
          created_at?: string
          dealer_id: string
          id?: string
          lead_id: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          bid_number?: number
          created_at?: string
          dealer_id?: string
          id?: string
          lead_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auction_bids_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_bids_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_sla_metrics"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "auction_bids_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          new_value: Json | null
          object_id: string | null
          object_type: string | null
          old_value: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          object_id?: string | null
          object_type?: string | null
          old_value?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          object_id?: string | null
          object_type?: string | null
          old_value?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      auth_throttle: {
        Row: {
          email: string | null
          failed_at: string
          id: string
          ip_address: unknown
          locked_until: string | null
        }
        Insert: {
          email?: string | null
          failed_at?: string
          id?: string
          ip_address: unknown
          locked_until?: string | null
        }
        Update: {
          email?: string | null
          failed_at?: string
          id?: string
          ip_address?: unknown
          locked_until?: string | null
        }
        Relationships: []
      }
      billing_logs: {
        Row: {
          amount: number
          assigned_at: string | null
          billing_type: Database["public"]["Enums"]["pricing_model"]
          created_at: string
          dealer_id: string
          description: string | null
          event_type: string
          id: string
          invoice_period_month: string | null
          invoice_reference: string | null
          invoice_status: Database["public"]["Enums"]["invoice_status"]
          lead_id: string | null
          marked_invoiced_at: string | null
          marked_invoiced_by: string | null
          updated_at: string
          won_at: string | null
        }
        Insert: {
          amount?: number
          assigned_at?: string | null
          billing_type: Database["public"]["Enums"]["pricing_model"]
          created_at?: string
          dealer_id: string
          description?: string | null
          event_type: string
          id?: string
          invoice_period_month?: string | null
          invoice_reference?: string | null
          invoice_status?: Database["public"]["Enums"]["invoice_status"]
          lead_id?: string | null
          marked_invoiced_at?: string | null
          marked_invoiced_by?: string | null
          updated_at?: string
          won_at?: string | null
        }
        Update: {
          amount?: number
          assigned_at?: string | null
          billing_type?: Database["public"]["Enums"]["pricing_model"]
          created_at?: string
          dealer_id?: string
          description?: string | null
          event_type?: string
          id?: string
          invoice_period_month?: string | null
          invoice_reference?: string | null
          invoice_status?: Database["public"]["Enums"]["invoice_status"]
          lead_id?: string | null
          marked_invoiced_at?: string | null
          marked_invoiced_by?: string | null
          updated_at?: string
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_logs_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_sla_metrics"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "billing_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_logs_marked_invoiced_by_fkey"
            columns: ["marked_invoiced_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      call_logs: {
        Row: {
          created_at: string
          duration_seconds: number | null
          id: string
          lead_id: string
          next_contact_at: string | null
          outcome: string
          seller_id: string
          summary: string | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          lead_id: string
          next_contact_at?: string | null
          outcome: string
          seller_id: string
          summary?: string | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          lead_id?: string
          next_contact_at?: string | null
          outcome?: string
          seller_id?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_sla_metrics"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "call_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          display_name: string | null
          geocoded_at: string
          latitude: number
          longitude: number
          name: string
          region: string | null
        }
        Insert: {
          display_name?: string | null
          geocoded_at?: string
          latitude: number
          longitude: number
          name: string
          region?: string | null
        }
        Update: {
          display_name?: string | null
          geocoded_at?: string
          latitude?: number
          longitude?: number
          name?: string
          region?: string | null
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          auto_archive_days: number
          bank_details: string | null
          biluppgifter_url_pattern: string
          blocket_url_pattern: string | null
          brand_primary: string
          car_info_url_pattern: string
          company_address: string | null
          company_name: string
          created_at: string
          daily_backup_enabled: boolean
          default_email_signature: string | null
          default_sms_signature: string | null
          followup_1_enabled: boolean
          followup_1_hours: number
          followup_2_enabled: boolean
          followup_2_hours: number
          followup_3_enabled: boolean
          followup_3_hours: number
          followups_enabled: boolean
          id: string
          inget_svar_hours: number
          lead_score_weights: Json
          org_number: string | null
          retention_archive_months: number
          retention_lost_months: number
          round_robin_enabled: boolean
          sla_targets: Json
          sms_quiet_hours_end: string
          sms_quiet_hours_start: string
          timezone: string
          updated_at: string
          vat_rate: number
        }
        Insert: {
          auto_archive_days?: number
          bank_details?: string | null
          biluppgifter_url_pattern?: string
          blocket_url_pattern?: string | null
          brand_primary?: string
          car_info_url_pattern?: string
          company_address?: string | null
          company_name?: string
          created_at?: string
          daily_backup_enabled?: boolean
          default_email_signature?: string | null
          default_sms_signature?: string | null
          followup_1_enabled?: boolean
          followup_1_hours?: number
          followup_2_enabled?: boolean
          followup_2_hours?: number
          followup_3_enabled?: boolean
          followup_3_hours?: number
          followups_enabled?: boolean
          id?: string
          inget_svar_hours?: number
          lead_score_weights?: Json
          org_number?: string | null
          retention_archive_months?: number
          retention_lost_months?: number
          round_robin_enabled?: boolean
          sla_targets?: Json
          sms_quiet_hours_end?: string
          sms_quiet_hours_start?: string
          timezone?: string
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          auto_archive_days?: number
          bank_details?: string | null
          biluppgifter_url_pattern?: string
          blocket_url_pattern?: string | null
          brand_primary?: string
          car_info_url_pattern?: string
          company_address?: string | null
          company_name?: string
          created_at?: string
          daily_backup_enabled?: boolean
          default_email_signature?: string | null
          default_sms_signature?: string | null
          followup_1_enabled?: boolean
          followup_1_hours?: number
          followup_2_enabled?: boolean
          followup_2_hours?: number
          followup_3_enabled?: boolean
          followup_3_hours?: number
          followups_enabled?: boolean
          id?: string
          inget_svar_hours?: number
          lead_score_weights?: Json
          org_number?: string | null
          retention_archive_months?: number
          retention_lost_months?: number
          round_robin_enabled?: boolean
          sla_targets?: Json
          sms_quiet_hours_end?: string
          sms_quiet_hours_start?: string
          timezone?: string
          updated_at?: string
          vat_rate?: number
        }
        Relationships: []
      }
      dealer_activity: {
        Row: {
          created_at: string
          dealer_id: string
          id: string
          metadata: Json
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          dealer_id: string
          id?: string
          metadata?: Json
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          dealer_id?: string
          id?: string
          metadata?: Json
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      dealer_notifications: {
        Row: {
          channel: string
          created_at: string
          dealer_id: string
          error: string | null
          external_id: string | null
          id: string
          lead_id: string | null
          status: string
        }
        Insert: {
          channel: string
          created_at?: string
          dealer_id: string
          error?: string | null
          external_id?: string | null
          id?: string
          lead_id?: string | null
          status?: string
        }
        Update: {
          channel?: string
          created_at?: string
          dealer_id?: string
          error?: string | null
          external_id?: string | null
          id?: string
          lead_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealer_notifications_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealer_notifications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_sla_metrics"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "dealer_notifications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      dealer_offers: {
        Row: {
          amount: number
          comment: string | null
          created_at: string
          created_by: string | null
          dealer_id: string
          id: string
          lead_id: string
          status: string
        }
        Insert: {
          amount: number
          comment?: string | null
          created_at?: string
          created_by?: string | null
          dealer_id: string
          id?: string
          lead_id: string
          status?: string
        }
        Update: {
          amount?: number
          comment?: string | null
          created_at?: string
          created_by?: string | null
          dealer_id?: string
          id?: string
          lead_id?: string
          status?: string
        }
        Relationships: []
      }
      dealer_users: {
        Row: {
          created_at: string
          dealer_id: string
          is_primary: boolean
          last_login_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          dealer_id: string
          is_primary?: boolean
          last_login_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          dealer_id?: string
          is_primary?: boolean
          last_login_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealer_users_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      dealers: {
        Row: {
          address: string | null
          buying_radius_km: number
          city: string
          company_name: string
          contact_person: string | null
          created_at: string
          custom_terms: string | null
          email: string
          id: string
          internal_notes: string | null
          last_active_at: string | null
          latitude: number | null
          longitude: number | null
          max_mileage_mil: number | null
          min_year: number | null
          monthly_fee: number | null
          notify_on_outbid: boolean
          notify_on_won: boolean
          notify_only_preferred_brands: boolean
          notify_only_within_radius: boolean
          notify_via_email: boolean
          notify_via_sms: boolean
          org_number: string | null
          phone: string | null
          postal_code: string | null
          preferred_brands: string[]
          preferred_fuels: Database["public"]["Enums"]["fuel_type"][]
          preferred_vehicle_types: string[]
          price_per_lead: number | null
          price_per_won_deal: number | null
          price_range_from: number | null
          price_range_to: number | null
          pricing_model: Database["public"]["Enums"]["pricing_model"]
          region: string | null
          reliability_score: number | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          buying_radius_km?: number
          city: string
          company_name: string
          contact_person?: string | null
          created_at?: string
          custom_terms?: string | null
          email: string
          id?: string
          internal_notes?: string | null
          last_active_at?: string | null
          latitude?: number | null
          longitude?: number | null
          max_mileage_mil?: number | null
          min_year?: number | null
          monthly_fee?: number | null
          notify_on_outbid?: boolean
          notify_on_won?: boolean
          notify_only_preferred_brands?: boolean
          notify_only_within_radius?: boolean
          notify_via_email?: boolean
          notify_via_sms?: boolean
          org_number?: string | null
          phone?: string | null
          postal_code?: string | null
          preferred_brands?: string[]
          preferred_fuels?: Database["public"]["Enums"]["fuel_type"][]
          preferred_vehicle_types?: string[]
          price_per_lead?: number | null
          price_per_won_deal?: number | null
          price_range_from?: number | null
          price_range_to?: number | null
          pricing_model?: Database["public"]["Enums"]["pricing_model"]
          region?: string | null
          reliability_score?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          buying_radius_km?: number
          city?: string
          company_name?: string
          contact_person?: string | null
          created_at?: string
          custom_terms?: string | null
          email?: string
          id?: string
          internal_notes?: string | null
          last_active_at?: string | null
          latitude?: number | null
          longitude?: number | null
          max_mileage_mil?: number | null
          min_year?: number | null
          monthly_fee?: number | null
          notify_on_outbid?: boolean
          notify_on_won?: boolean
          notify_only_preferred_brands?: boolean
          notify_only_within_radius?: boolean
          notify_via_email?: boolean
          notify_via_sms?: boolean
          org_number?: string | null
          phone?: string | null
          postal_code?: string | null
          preferred_brands?: string[]
          preferred_fuels?: Database["public"]["Enums"]["fuel_type"][]
          preferred_vehicle_types?: string[]
          price_per_lead?: number | null
          price_per_won_deal?: number | null
          price_range_from?: number | null
          price_range_to?: number | null
          pricing_model?: Database["public"]["Enums"]["pricing_model"]
          region?: string | null
          reliability_score?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_log: {
        Row: {
          body: string | null
          created_at: string
          id: string
          lead_id: string | null
          provider_id: string | null
          status: string | null
          subject: string | null
          template_code: string | null
          to_email: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          provider_id?: string | null
          status?: string | null
          subject?: string | null
          template_code?: string | null
          to_email?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          provider_id?: string | null
          status?: string | null
          subject?: string | null
          template_code?: string | null
          to_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_sla_metrics"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "email_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          caption: string | null
          category: Database["public"]["Enums"]["photo_category"] | null
          created_at: string
          deleted_at: string | null
          file_size_bytes: number | null
          file_type: string | null
          file_url: string | null
          height: number | null
          id: string
          lead_id: string
          storage_path: string
          thumbnail_url: string | null
          uploaded_by: string | null
          visible_to_dealer: boolean
          width: number | null
        }
        Insert: {
          caption?: string | null
          category?: Database["public"]["Enums"]["photo_category"] | null
          created_at?: string
          deleted_at?: string | null
          file_size_bytes?: number | null
          file_type?: string | null
          file_url?: string | null
          height?: number | null
          id?: string
          lead_id: string
          storage_path: string
          thumbnail_url?: string | null
          uploaded_by?: string | null
          visible_to_dealer?: boolean
          width?: number | null
        }
        Update: {
          caption?: string | null
          category?: Database["public"]["Enums"]["photo_category"] | null
          created_at?: string
          deleted_at?: string | null
          file_size_bytes?: number | null
          file_type?: string | null
          file_url?: string | null
          height?: number | null
          id?: string
          lead_id?: string
          storage_path?: string
          thumbnail_url?: string | null
          uploaded_by?: string | null
          visible_to_dealer?: boolean
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "files_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_sla_metrics"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "files_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gdpr_requests: {
        Row: {
          created_at: string
          customer_email: string | null
          customer_phone: string | null
          export_file_url: string | null
          id: string
          matched_lead_ids: string[] | null
          notes: string | null
          processed_at: string | null
          processed_by: string | null
          request_type: string
          requested_at: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_email?: string | null
          customer_phone?: string | null
          export_file_url?: string | null
          id?: string
          matched_lead_ids?: string[] | null
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          request_type: string
          requested_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_email?: string | null
          customer_phone?: string | null
          export_file_url?: string | null
          id?: string
          matched_lead_ids?: string[] | null
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          request_type?: string
          requested_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      inbound_orphan_messages: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assigned_to_lead_id: string | null
          body: string
          from_phone: string
          id: string
          ignored: boolean
          received_at: string
          twilio_message_sid: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to_lead_id?: string | null
          body: string
          from_phone: string
          id?: string
          ignored?: boolean
          received_at?: string
          twilio_message_sid?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to_lead_id?: string | null
          body?: string
          from_phone?: string
          id?: string
          ignored?: boolean
          received_at?: string
          twilio_message_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inbound_orphan_messages_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_orphan_messages_assigned_to_lead_id_fkey"
            columns: ["assigned_to_lead_id"]
            isOneToOne: false
            referencedRelation: "lead_sla_metrics"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "inbound_orphan_messages_assigned_to_lead_id_fkey"
            columns: ["assigned_to_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_attempts: {
        Row: {
          created_at: string
          created_lead_id: string | null
          email: string | null
          error_message: string | null
          external_id: string | null
          id: string
          idempotency_key: string | null
          payload_preview: Json | null
          phone: string | null
          raw_payload_preview: string | null
          registration_number: string | null
          signature_valid: boolean | null
          source: string | null
          status: string
          validation_errors: Json | null
        }
        Insert: {
          created_at?: string
          created_lead_id?: string | null
          email?: string | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          idempotency_key?: string | null
          payload_preview?: Json | null
          phone?: string | null
          raw_payload_preview?: string | null
          registration_number?: string | null
          signature_valid?: boolean | null
          source?: string | null
          status: string
          validation_errors?: Json | null
        }
        Update: {
          created_at?: string
          created_lead_id?: string | null
          email?: string | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          idempotency_key?: string | null
          payload_preview?: Json | null
          phone?: string | null
          raw_payload_preview?: string | null
          registration_number?: string | null
          signature_valid?: boolean | null
          source?: string | null
          status?: string
          validation_errors?: Json | null
        }
        Relationships: []
      }
      intake_idempotency: {
        Row: {
          created_at: string
          idempotency_key: string
          lead_id: string | null
        }
        Insert: {
          created_at?: string
          idempotency_key: string
          lead_id?: string | null
        }
        Update: {
          created_at?: string
          idempotency_key?: string
          lead_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intake_idempotency_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_sla_metrics"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "intake_idempotency_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_submissions: {
        Row: {
          created_at: string
          id: string
          idempotency_key: string | null
          lead_id: string
          payload_preview: Json | null
          source: string | null
          step: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          idempotency_key?: string | null
          lead_id: string
          payload_preview?: Json | null
          source?: string | null
          step?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          idempotency_key?: string | null
          lead_id?: string
          payload_preview?: Json | null
          source?: string | null
          step?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intake_submissions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_sla_metrics"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "intake_submissions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_access_logs: {
        Row: {
          accessed_at: string
          id: number
          lead_id: string
          user_id: string
        }
        Insert: {
          accessed_at?: string
          id?: number
          lead_id: string
          user_id: string
        }
        Update: {
          accessed_at?: string
          id?: number
          lead_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_access_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_sla_metrics"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "lead_access_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_active_deal_checklist: {
        Row: {
          bud_accepterat: boolean
          bud_mottaget: boolean
          hamtning_bokad: boolean
          hamtning_genomford: boolean
          kund_kontaktad: boolean
          lead_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bud_accepterat?: boolean
          bud_mottaget?: boolean
          hamtning_bokad?: boolean
          hamtning_genomford?: boolean
          kund_kontaktad?: boolean
          lead_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bud_accepterat?: boolean
          bud_mottaget?: boolean
          hamtning_bokad?: boolean
          hamtning_genomford?: boolean
          kund_kontaktad?: boolean
          lead_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      lead_dealer_publications: {
        Row: {
          created_at: string
          dealer_comment: string | null
          dealer_id: string
          first_viewed_at: string | null
          id: string
          include_pricing_range: boolean
          interest_marked_at: string | null
          lead_id: string
          match_reasons: string[]
          match_score: number | null
          metadata: Json
          notified_at: string | null
          published_by: string | null
          share_city: boolean
          share_photos: boolean
          view_count: number
        }
        Insert: {
          created_at?: string
          dealer_comment?: string | null
          dealer_id: string
          first_viewed_at?: string | null
          id?: string
          include_pricing_range?: boolean
          interest_marked_at?: string | null
          lead_id: string
          match_reasons?: string[]
          match_score?: number | null
          metadata?: Json
          notified_at?: string | null
          published_by?: string | null
          share_city?: boolean
          share_photos?: boolean
          view_count?: number
        }
        Update: {
          created_at?: string
          dealer_comment?: string | null
          dealer_id?: string
          first_viewed_at?: string | null
          id?: string
          include_pricing_range?: boolean
          interest_marked_at?: string | null
          lead_id?: string
          match_reasons?: string[]
          match_score?: number | null
          metadata?: Json
          notified_at?: string | null
          published_by?: string | null
          share_city?: boolean
          share_photos?: boolean
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_dealer_publications_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_dealer_publications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_sla_metrics"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "lead_dealer_publications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_dealer_publications_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tags: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
          tag: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
          tag: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_tags_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_sla_metrics"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "lead_tags_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          ad_id: string | null
          archived_at: string | null
          auction_closes_at: string | null
          auction_ended_at: string | null
          campaign: string | null
          city: string | null
          consent_timestamp: string | null
          created_at: string
          customer_expectation: string | null
          customer_name: string | null
          email: string
          equipment_notes: string | null
          external_id: string | null
          extras_list: string[] | null
          free_text: string | null
          gdpr_consent: boolean
          id: string
          is_pinned: boolean
          last_activity_at: string
          last_submission_at: string | null
          latitude: number | null
          lead_score: number
          longitude: number | null
          lost_reason_code: Database["public"]["Enums"]["lost_reason"] | null
          lost_reason_text: string | null
          marketing_consent: boolean
          owned_at: string | null
          owner_id: string | null
          phone: string
          pickup_location: string | null
          pin_inbox_at: string | null
          previous_stage: Database["public"]["Enums"]["lead_stage"] | null
          referrer: string | null
          region: string | null
          registration_number: string
          search_vector: unknown
          sell_timeframe: string | null
          selling_timeframe: string | null
          source: Database["public"]["Enums"]["lead_source"]
          stage: Database["public"]["Enums"]["lead_stage"]
          submission_count: number
          updated_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          version: number
          winning_dealer_id: string | null
        }
        Insert: {
          ad_id?: string | null
          archived_at?: string | null
          auction_closes_at?: string | null
          auction_ended_at?: string | null
          campaign?: string | null
          city?: string | null
          consent_timestamp?: string | null
          created_at?: string
          customer_expectation?: string | null
          customer_name?: string | null
          email: string
          equipment_notes?: string | null
          external_id?: string | null
          extras_list?: string[] | null
          free_text?: string | null
          gdpr_consent?: boolean
          id?: string
          is_pinned?: boolean
          last_activity_at?: string
          last_submission_at?: string | null
          latitude?: number | null
          lead_score?: number
          longitude?: number | null
          lost_reason_code?: Database["public"]["Enums"]["lost_reason"] | null
          lost_reason_text?: string | null
          marketing_consent?: boolean
          owned_at?: string | null
          owner_id?: string | null
          phone: string
          pickup_location?: string | null
          pin_inbox_at?: string | null
          previous_stage?: Database["public"]["Enums"]["lead_stage"] | null
          referrer?: string | null
          region?: string | null
          registration_number: string
          search_vector?: unknown
          sell_timeframe?: string | null
          selling_timeframe?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          stage?: Database["public"]["Enums"]["lead_stage"]
          submission_count?: number
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          version?: number
          winning_dealer_id?: string | null
        }
        Update: {
          ad_id?: string | null
          archived_at?: string | null
          auction_closes_at?: string | null
          auction_ended_at?: string | null
          campaign?: string | null
          city?: string | null
          consent_timestamp?: string | null
          created_at?: string
          customer_expectation?: string | null
          customer_name?: string | null
          email?: string
          equipment_notes?: string | null
          external_id?: string | null
          extras_list?: string[] | null
          free_text?: string | null
          gdpr_consent?: boolean
          id?: string
          is_pinned?: boolean
          last_activity_at?: string
          last_submission_at?: string | null
          latitude?: number | null
          lead_score?: number
          longitude?: number | null
          lost_reason_code?: Database["public"]["Enums"]["lost_reason"] | null
          lost_reason_text?: string | null
          marketing_consent?: boolean
          owned_at?: string | null
          owner_id?: string | null
          phone?: string
          pickup_location?: string | null
          pin_inbox_at?: string | null
          previous_stage?: Database["public"]["Enums"]["lead_stage"] | null
          referrer?: string | null
          region?: string | null
          registration_number?: string
          search_vector?: unknown
          sell_timeframe?: string | null
          selling_timeframe?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          stage?: Database["public"]["Enums"]["lead_stage"]
          submission_count?: number
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          version?: number
          winning_dealer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_winning_dealer_id_fkey"
            columns: ["winning_dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          delivery_error: string | null
          delivery_status: Database["public"]["Enums"]["sms_delivery_status"]
          direction: Database["public"]["Enums"]["sms_direction"]
          from_phone: string | null
          id: string
          is_system: boolean
          lead_id: string
          read_at: string | null
          send_at: string | null
          sender_id: string | null
          template_code: string | null
          to_phone: string | null
          twilio_message_sid: string | null
        }
        Insert: {
          body: string
          created_at?: string
          delivery_error?: string | null
          delivery_status?: Database["public"]["Enums"]["sms_delivery_status"]
          direction: Database["public"]["Enums"]["sms_direction"]
          from_phone?: string | null
          id?: string
          is_system?: boolean
          lead_id: string
          read_at?: string | null
          send_at?: string | null
          sender_id?: string | null
          template_code?: string | null
          to_phone?: string | null
          twilio_message_sid?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          delivery_error?: string | null
          delivery_status?: Database["public"]["Enums"]["sms_delivery_status"]
          direction?: Database["public"]["Enums"]["sms_direction"]
          from_phone?: string | null
          id?: string
          is_system?: boolean
          lead_id?: string
          read_at?: string | null
          send_at?: string | null
          sender_id?: string | null
          template_code?: string | null
          to_phone?: string | null
          twilio_message_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_sla_metrics"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      negotiation_entries: {
        Row: {
          actor_id: string | null
          actor_type: string
          amount: number | null
          comment: string | null
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          amount?: number | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          amount?: number | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "negotiation_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negotiation_entries_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_sla_metrics"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "negotiation_entries_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
          updated_at: string
          visibility: Database["public"]["Enums"]["note_visibility"]
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["note_visibility"]
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["note_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_sla_metrics"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          lead_id: string | null
          metadata: Json
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          metadata?: Json
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          metadata?: Json
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_sla_metrics"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "notifications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing: {
        Row: {
          customer_expectation: number | null
          in_price: number | null
          in_price_from: number | null
          in_price_to: number | null
          lead_id: string
          out_price: number | null
          out_price_from: number | null
          out_price_to: number | null
          pricing_notes: string | null
          updated_at: string
          updated_by: string | null
          valuation_from: number | null
          valuation_to: number | null
        }
        Insert: {
          customer_expectation?: number | null
          in_price?: number | null
          in_price_from?: number | null
          in_price_to?: number | null
          lead_id: string
          out_price?: number | null
          out_price_from?: number | null
          out_price_to?: number | null
          pricing_notes?: string | null
          updated_at?: string
          updated_by?: string | null
          valuation_from?: number | null
          valuation_to?: number | null
        }
        Update: {
          customer_expectation?: number | null
          in_price?: number | null
          in_price_from?: number | null
          in_price_to?: number | null
          lead_id?: string
          out_price?: number | null
          out_price_from?: number | null
          out_price_to?: number | null
          pricing_notes?: string | null
          updated_at?: string
          updated_by?: string | null
          valuation_from?: number | null
          valuation_to?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "lead_sla_metrics"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "pricing_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_history: {
        Row: {
          changed_by: string | null
          created_at: string
          field_name: string
          id: string
          lead_id: string
          new_value: string | null
          old_value: string | null
          reason: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          field_name: string
          id?: string
          lead_id: string
          new_value?: string | null
          old_value?: string | null
          reason?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          field_name?: string
          id?: string
          lead_id?: string
          new_value?: string | null
          old_value?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_sla_metrics"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "pricing_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          availability: Database["public"]["Enums"]["availability_status"]
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          last_assigned_at: string | null
          last_login_at: string | null
          name: string | null
          notification_phone: string | null
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
          theme_preference: string
          updated_at: string
        }
        Insert: {
          availability?: Database["public"]["Enums"]["availability_status"]
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id: string
          last_assigned_at?: string | null
          last_login_at?: string | null
          name?: string | null
          notification_phone?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          theme_preference?: string
          updated_at?: string
        }
        Update: {
          availability?: Database["public"]["Enums"]["availability_status"]
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_assigned_at?: string | null
          last_login_at?: string | null
          name?: string | null
          notification_phone?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          theme_preference?: string
          updated_at?: string
        }
        Relationships: []
      }
      retention_jobs: {
        Row: {
          created_at: string
          executed_at: string | null
          id: string
          job_type: string
          result: string | null
          run_at: string
          status: string
          target_lead_id: string | null
        }
        Insert: {
          created_at?: string
          executed_at?: string | null
          id?: string
          job_type: string
          result?: string | null
          run_at: string
          status?: string
          target_lead_id?: string | null
        }
        Update: {
          created_at?: string
          executed_at?: string | null
          id?: string
          job_type?: string
          result?: string | null
          run_at?: string
          status?: string
          target_lead_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retention_jobs_target_lead_id_fkey"
            columns: ["target_lead_id"]
            isOneToOne: false
            referencedRelation: "lead_sla_metrics"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "retention_jobs_target_lead_id_fkey"
            columns: ["target_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_templates: {
        Row: {
          body_sv: string
          code: string
          id: string
          is_active: boolean
          label_sv: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body_sv: string
          code: string
          id?: string
          is_active?: boolean
          label_sv: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body_sv?: string
          code?: string
          id?: string
          is_active?: boolean
          label_sv?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_jobs: {
        Row: {
          cancelled_reason: string | null
          created_at: string
          executed_at: string | null
          id: string
          lead_id: string
          run_at: string
          status: string
          target_stage: Database["public"]["Enums"]["lead_stage"]
          trigger_type: string
        }
        Insert: {
          cancelled_reason?: string | null
          created_at?: string
          executed_at?: string | null
          id?: string
          lead_id: string
          run_at: string
          status?: string
          target_stage: Database["public"]["Enums"]["lead_stage"]
          trigger_type: string
        }
        Update: {
          cancelled_reason?: string | null
          created_at?: string
          executed_at?: string | null
          id?: string
          lead_id?: string
          run_at?: string
          status?: string
          target_stage?: Database["public"]["Enums"]["lead_stage"]
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_jobs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_sla_metrics"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "stage_jobs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_transitions: {
        Row: {
          actor_id: string | null
          created_at: string
          from_stage: Database["public"]["Enums"]["lead_stage"] | null
          id: string
          lead_id: string
          metadata: Json | null
          reason: string | null
          to_stage: Database["public"]["Enums"]["lead_stage"]
          trigger_type: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_stage?: Database["public"]["Enums"]["lead_stage"] | null
          id?: string
          lead_id: string
          metadata?: Json | null
          reason?: string | null
          to_stage: Database["public"]["Enums"]["lead_stage"]
          trigger_type: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_stage?: Database["public"]["Enums"]["lead_stage"] | null
          id?: string
          lead_id?: string
          metadata?: Json | null
          reason?: string | null
          to_stage?: Database["public"]["Enums"]["lead_stage"]
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_transitions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_transitions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_sla_metrics"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "stage_transitions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          kind: string
          lead_id: string
          notified_at: string | null
          owner_id: string | null
          reminder_time: string | null
          snoozed_until: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          kind?: string
          lead_id: string
          notified_at?: string | null
          owner_id?: string | null
          reminder_time?: string | null
          snoozed_until?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          kind?: string
          lead_id?: string
          notified_at?: string | null
          owner_id?: string | null
          reminder_time?: string | null
          snoozed_until?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_sla_metrics"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_settings: {
        Row: {
          browser_enabled: Json
          email_enabled: Json
          sms_enabled: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          browser_enabled?: Json
          email_enabled?: Json
          sms_enabled?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          browser_enabled?: Json
          email_enabled?: Json
          sms_enabled?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          body_type: Database["public"]["Enums"]["body_type"] | null
          body_type_needs_review: boolean
          brand: string | null
          condition: string | null
          damage_notes: string | null
          dealer_feedback: string | null
          drive_type: Database["public"]["Enums"]["drive_type"] | null
          engine_gearbox_notes: string | null
          equipment: string | null
          equipment_notes: string | null
          equipment_package: string | null
          extra_equipment: string | null
          fuel: Database["public"]["Enums"]["fuel_type"] | null
          fuel_needs_review: boolean
          gearbox: Database["public"]["Enums"]["gearbox_type"] | null
          horsepower: number | null
          image_urls: string[] | null
          inspection_until: string | null
          interior_condition: string | null
          keys_count: string | null
          last_service_date: string | null
          last_service_notes: string | null
          lead_id: string
          mileage_mil: number | null
          model: string | null
          notes: string | null
          options: string[] | null
          paint_condition: string | null
          selling_timeframe: string | null
          service_book: string | null
          smoke_free: boolean | null
          summer_tires_notes: string | null
          timing_belt_notes: string | null
          tires: string | null
          updated_at: string
          urgency: string | null
          version: string | null
          warning_lights: boolean | null
          winter_tires_notes: string | null
          year: number | null
        }
        Insert: {
          body_type?: Database["public"]["Enums"]["body_type"] | null
          body_type_needs_review?: boolean
          brand?: string | null
          condition?: string | null
          damage_notes?: string | null
          dealer_feedback?: string | null
          drive_type?: Database["public"]["Enums"]["drive_type"] | null
          engine_gearbox_notes?: string | null
          equipment?: string | null
          equipment_notes?: string | null
          equipment_package?: string | null
          extra_equipment?: string | null
          fuel?: Database["public"]["Enums"]["fuel_type"] | null
          fuel_needs_review?: boolean
          gearbox?: Database["public"]["Enums"]["gearbox_type"] | null
          horsepower?: number | null
          image_urls?: string[] | null
          inspection_until?: string | null
          interior_condition?: string | null
          keys_count?: string | null
          last_service_date?: string | null
          last_service_notes?: string | null
          lead_id: string
          mileage_mil?: number | null
          model?: string | null
          notes?: string | null
          options?: string[] | null
          paint_condition?: string | null
          selling_timeframe?: string | null
          service_book?: string | null
          smoke_free?: boolean | null
          summer_tires_notes?: string | null
          timing_belt_notes?: string | null
          tires?: string | null
          updated_at?: string
          urgency?: string | null
          version?: string | null
          warning_lights?: boolean | null
          winter_tires_notes?: string | null
          year?: number | null
        }
        Update: {
          body_type?: Database["public"]["Enums"]["body_type"] | null
          body_type_needs_review?: boolean
          brand?: string | null
          condition?: string | null
          damage_notes?: string | null
          dealer_feedback?: string | null
          drive_type?: Database["public"]["Enums"]["drive_type"] | null
          engine_gearbox_notes?: string | null
          equipment?: string | null
          equipment_notes?: string | null
          equipment_package?: string | null
          extra_equipment?: string | null
          fuel?: Database["public"]["Enums"]["fuel_type"] | null
          fuel_needs_review?: boolean
          gearbox?: Database["public"]["Enums"]["gearbox_type"] | null
          horsepower?: number | null
          image_urls?: string[] | null
          inspection_until?: string | null
          interior_condition?: string | null
          keys_count?: string | null
          last_service_date?: string | null
          last_service_notes?: string | null
          lead_id?: string
          mileage_mil?: number | null
          model?: string | null
          notes?: string | null
          options?: string[] | null
          paint_condition?: string | null
          selling_timeframe?: string | null
          service_book?: string | null
          smoke_free?: boolean | null
          summer_tires_notes?: string | null
          timing_belt_notes?: string | null
          tires?: string | null
          updated_at?: string
          urgency?: string | null
          version?: string | null
          warning_lights?: boolean | null
          winter_tires_notes?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "lead_sla_metrics"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "vehicles_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      won_deals: {
        Row: {
          created_by: string | null
          dealer_id: string
          final_price: number
          id: string
          lead_id: string
          won_at: string
        }
        Insert: {
          created_by?: string | null
          dealer_id: string
          final_price: number
          id?: string
          lead_id: string
          won_at?: string
        }
        Update: {
          created_by?: string | null
          dealer_id?: string
          final_price?: number
          id?: string
          lead_id?: string
          won_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      lead_sla_metrics: {
        Row: {
          brand: string | null
          city: string | null
          created_at: string | null
          lead_id: string | null
          owner_id: string | null
          region: string | null
          source: Database["public"]["Enums"]["lead_source"] | null
          stage: Database["public"]["Enums"]["lead_stage"] | null
          t_customer_accepted_hours: number | null
          t_dealer_match_hours: number | null
          t_first_auto_sms_min: number | null
          t_first_bid_hours: number | null
          t_first_manual_touch_min: number | null
          t_first_reply_min: number | null
          t_first_valuation_min: number | null
          t_pickup_hours: number | null
          t_won_hours: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_access_lead: { Args: { _lead_id: string }; Returns: boolean }
      compute_auction_close: { Args: { _from: string }; Returns: string }
      compute_lead_score: { Args: { p_lead_id: string }; Returns: number }
      current_role_is: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      current_user_dealer_id: { Args: never; Returns: string }
      earth: { Args: never; Returns: number }
      generate_monthly_dealer_fees: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      place_bid: { Args: { _amount: number; _lead_id: string }; Returns: Json }
      refresh_lead_sla_metrics: { Args: never; Returns: undefined }
      save_pricing: {
        Args: { p_lead_id: string; p_patch: Json }
        Returns: Json
      }
      select_winning_dealer: {
        Args: { _dealer_id: string; _lead_id: string }
        Returns: Json
      }
      storage_lead_id: { Args: { _name: string }; Returns: string }
      sweep_ended_auctions: { Args: never; Returns: number }
    }
    Enums: {
      app_role: "admin" | "seller" | "dealer"
      availability_status:
        | "online"
        | "offline"
        | "away"
        | "sick"
        | "not_taking_leads"
      body_type:
        | "cabriolet"
        | "coupe"
        | "familjebuss"
        | "halvkombi_3d"
        | "halvkombi_5d"
        | "kombi"
        | "pickup"
        | "sedan"
        | "skapbil"
        | "suv"
        | "annat"
        | "okant"
      dealer_offer_status:
        | "pending"
        | "submitted"
        | "updated"
        | "accepted"
        | "rejected"
        | "expired"
      drive_type:
        | "bakhjulsdrift"
        | "framhjulsdrift"
        | "fyrhjulsdrift"
        | "tvahjulsdriven"
        | "okant"
      fuel_type:
        | "bensin"
        | "diesel"
        | "el"
        | "etanol"
        | "fordonsgas"
        | "hybrid_bensin"
        | "hybrid_diesel"
        | "hybrid_gas"
        | "plugin_bensin"
        | "plugin_diesel"
        | "okant"
      gearbox_type: "automatisk" | "manuell" | "sekventiell" | "okant"
      invoice_status: "not_billed" | "draft" | "sent" | "paid" | "cancelled"
      lead_source:
        | "minbilvardering"
        | "bilbud"
        | "elbilvarde"
        | "website"
        | "facebook"
        | "google_ads"
        | "tiktok"
        | "organic"
        | "referral"
        | "manual"
      lead_stage:
        | "ny_lead"
        | "snabb_vardering"
        | "kontaktad"
        | "uppfoljning_1"
        | "uppfoljning_2"
        | "uppfoljning_3"
        | "inget_svar"
        | "matchad"
        | "bud_mottaget"
        | "kund_accepterat"
        | "hamtning"
        | "vunnen"
        | "forlorad"
        | "arkiverad"
        | "kontrakt_pagar_avtal"
      lost_reason:
        | "inget_svar"
        | "sald_privat"
        | "kund_angrade"
        | "bud_for_lagt"
        | "for_dyr_kundforvantan"
        | "felaktiga_uppgifter"
        | "dubblett"
        | "bilproblem"
        | "handlare_drog_sig_ur"
        | "annat"
      note_visibility: "internal" | "dealer_visible"
      photo_category:
        | "framifran"
        | "bakifran"
        | "vanster_sida"
        | "hoger_sida"
        | "interior"
        | "matarstallning"
        | "servicebok"
        | "skador"
        | "ovrigt"
      pricing_model: "per_lead" | "per_won_deal" | "monthly_fee" | "custom"
      sms_delivery_status:
        | "queued"
        | "sent"
        | "delivered"
        | "failed"
        | "undelivered"
        | "received"
        | "cancelled"
      sms_direction: "inbound" | "outbound"
      task_status: "open" | "snoozed" | "completed" | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "seller", "dealer"],
      availability_status: [
        "online",
        "offline",
        "away",
        "sick",
        "not_taking_leads",
      ],
      body_type: [
        "cabriolet",
        "coupe",
        "familjebuss",
        "halvkombi_3d",
        "halvkombi_5d",
        "kombi",
        "pickup",
        "sedan",
        "skapbil",
        "suv",
        "annat",
        "okant",
      ],
      dealer_offer_status: [
        "pending",
        "submitted",
        "updated",
        "accepted",
        "rejected",
        "expired",
      ],
      drive_type: [
        "bakhjulsdrift",
        "framhjulsdrift",
        "fyrhjulsdrift",
        "tvahjulsdriven",
        "okant",
      ],
      fuel_type: [
        "bensin",
        "diesel",
        "el",
        "etanol",
        "fordonsgas",
        "hybrid_bensin",
        "hybrid_diesel",
        "hybrid_gas",
        "plugin_bensin",
        "plugin_diesel",
        "okant",
      ],
      gearbox_type: ["automatisk", "manuell", "sekventiell", "okant"],
      invoice_status: ["not_billed", "draft", "sent", "paid", "cancelled"],
      lead_source: [
        "minbilvardering",
        "bilbud",
        "elbilvarde",
        "website",
        "facebook",
        "google_ads",
        "tiktok",
        "organic",
        "referral",
        "manual",
      ],
      lead_stage: [
        "ny_lead",
        "snabb_vardering",
        "kontaktad",
        "uppfoljning_1",
        "uppfoljning_2",
        "uppfoljning_3",
        "inget_svar",
        "matchad",
        "bud_mottaget",
        "kund_accepterat",
        "hamtning",
        "vunnen",
        "forlorad",
        "arkiverad",
        "kontrakt_pagar_avtal",
      ],
      lost_reason: [
        "inget_svar",
        "sald_privat",
        "kund_angrade",
        "bud_for_lagt",
        "for_dyr_kundforvantan",
        "felaktiga_uppgifter",
        "dubblett",
        "bilproblem",
        "handlare_drog_sig_ur",
        "annat",
      ],
      note_visibility: ["internal", "dealer_visible"],
      photo_category: [
        "framifran",
        "bakifran",
        "vanster_sida",
        "hoger_sida",
        "interior",
        "matarstallning",
        "servicebok",
        "skador",
        "ovrigt",
      ],
      pricing_model: ["per_lead", "per_won_deal", "monthly_fee", "custom"],
      sms_delivery_status: [
        "queued",
        "sent",
        "delivered",
        "failed",
        "undelivered",
        "received",
        "cancelled",
      ],
      sms_direction: ["inbound", "outbound"],
      task_status: ["open", "snoozed", "completed", "cancelled"],
    },
  },
} as const
