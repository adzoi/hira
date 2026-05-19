export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          name_en: string
          name_ka: string
          parent_id: string | null
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name_en: string
          name_ka: string
          parent_id?: string | null
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name_en?: string
          name_ka?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      completed_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          freelancer_confirmed: boolean
          freelancer_profile_id: string
          hirer_confirmed: boolean
          hirer_profile_id: string
          id: string
          job_id: string
          review_window_ends_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          freelancer_confirmed?: boolean
          freelancer_profile_id: string
          hirer_confirmed?: boolean
          hirer_profile_id: string
          id?: string
          job_id: string
          review_window_ends_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          freelancer_confirmed?: boolean
          freelancer_profile_id?: string
          hirer_confirmed?: boolean
          hirer_profile_id?: string
          id?: string
          job_id?: string
          review_window_ends_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "completed_jobs_freelancer_profile_id_fkey"
            columns: ["freelancer_profile_id"]
            isOneToOne: false
            referencedRelation: "freelancer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "completed_jobs_hirer_profile_id_fkey"
            columns: ["hirer_profile_id"]
            isOneToOne: false
            referencedRelation: "hirer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "completed_jobs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          }
        ]
      }
      conversation_reads: {
        Row: {
          conversation_id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_reads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          job_application_id: string | null
          last_message_at: string | null
          participant_high: string
          participant_low: string
          service_inquiry_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          job_application_id?: string | null
          last_message_at?: string | null
          participant_high: string
          participant_low: string
          service_inquiry_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          job_application_id?: string | null
          last_message_at?: string | null
          participant_high?: string
          participant_low?: string
          service_inquiry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_job_application_id_fkey"
            columns: ["job_application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_participant_high_fkey"
            columns: ["participant_high"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_participant_low_fkey"
            columns: ["participant_low"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_service_inquiry_id_fkey"
            columns: ["service_inquiry_id"]
            isOneToOne: false
            referencedRelation: "service_inquiries"
            referencedColumns: ["id"]
          }
        ]
      }
      experience: {
        Row: {
          created_at: string
          description: string | null
          end_date: string | null
          freelancer_profile_id: string
          id: string
          organization: string
          start_date: string
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          freelancer_profile_id: string
          id?: string
          organization: string
          start_date: string
          title: string
          type: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          freelancer_profile_id?: string
          id?: string
          organization?: string
          start_date?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "experience_freelancer_profile_id_fkey"
            columns: ["freelancer_profile_id"]
            isOneToOne: false
            referencedRelation: "freelancer_profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      follows: {
        Row: {
          created_at?: string | null
          follower_id: string
          following_id: string
        }
        Insert: {
          created_at?: string | null
          follower_id: string
          following_id: string
        }
        Update: {
          created_at?: string | null
          follower_id?: string
          following_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      freelancer_education: {
        Row: {
          created_at: string
          degree_level: string
          end_date: string | null
          field_of_study: string | null
          freelancer_profile_id: string
          id: string
          institution: string
        }
        Insert: {
          created_at?: string
          degree_level: string
          end_date?: string | null
          field_of_study?: string | null
          freelancer_profile_id: string
          id?: string
          institution: string
        }
        Update: {
          created_at?: string
          degree_level?: string
          end_date?: string | null
          field_of_study?: string | null
          freelancer_profile_id?: string
          id?: string
          institution?: string
        }
        Relationships: [
          {
            foreignKeyName: "freelancer_education_freelancer_profile_id_fkey"
            columns: ["freelancer_profile_id"]
            isOneToOne: false
            referencedRelation: "freelancer_profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      freelancer_profiles: {
        Row: {
          availability: string | null
          average_rating: number
          bio: string | null
          completed_jobs_count: number
          created_at: string
          facebook_url: string | null
          github_url: string | null
          id: string
          instagram_url: string | null
          is_profile_complete: boolean
          is_public: boolean
          is_accepting_new_work: boolean
          show_completed_work_on_public_profile: boolean
          languages: string[]
          linkedin_url: string | null
          portfolio_url: string | null
          professional_title: string | null
          slug: string
          tiktok_url: string | null
          total_reviews_count: number
          updated_at: string
          user_id: string
          x_url: string | null
          youtube_url: string | null
        }
        Insert: {
          availability?: string | null
          average_rating?: number
          bio?: string | null
          completed_jobs_count?: number
          created_at?: string
          facebook_url?: string | null
          github_url?: string | null
          id?: string
          instagram_url?: string | null
          is_profile_complete?: boolean
          is_public?: boolean
          is_accepting_new_work?: boolean
          show_completed_work_on_public_profile?: boolean
          languages?: string[]
          linkedin_url?: string | null
          portfolio_url?: string | null
          professional_title?: string | null
          slug: string
          tiktok_url?: string | null
          total_reviews_count?: number
          updated_at?: string
          user_id: string
          x_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          availability?: string | null
          average_rating?: number
          bio?: string | null
          completed_jobs_count?: number
          created_at?: string
          facebook_url?: string | null
          github_url?: string | null
          id?: string
          instagram_url?: string | null
          is_profile_complete?: boolean
          is_public?: boolean
          is_accepting_new_work?: boolean
          show_completed_work_on_public_profile?: boolean
          languages?: string[]
          linkedin_url?: string | null
          portfolio_url?: string | null
          professional_title?: string | null
          slug?: string
          tiktok_url?: string | null
          total_reviews_count?: number
          updated_at?: string
          user_id?: string
          x_url?: string | null
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "freelancer_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      freelancer_skills: {
        Row: {
          created_at: string
          freelancer_profile_id: string
          id: string
          level: string
          skill_id: string
        }
        Insert: {
          created_at?: string
          freelancer_profile_id: string
          id?: string
          level?: string
          skill_id: string
        }
        Update: {
          created_at?: string
          freelancer_profile_id?: string
          id?: string
          level?: string
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "freelancer_skills_freelancer_profile_id_fkey"
            columns: ["freelancer_profile_id"]
            isOneToOne: false
            referencedRelation: "freelancer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freelancer_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          }
        ]
      }
      hirer_profiles: {
        Row: {
          average_rating_given: number
          company_name: string | null
          completed_jobs_count: number
          created_at: string
          description: string | null
          id: string
          industry: string | null
          jobs_posted_count: number
          updated_at: string
          user_id: string
          website_url: string | null
        }
        Insert: {
          average_rating_given?: number
          company_name?: string | null
          completed_jobs_count?: number
          created_at?: string
          description?: string | null
          id?: string
          industry?: string | null
          jobs_posted_count?: number
          updated_at?: string
          user_id: string
          website_url?: string | null
        }
        Update: {
          average_rating_given?: number
          company_name?: string | null
          completed_jobs_count?: number
          created_at?: string
          description?: string | null
          id?: string
          industry?: string | null
          jobs_posted_count?: number
          updated_at?: string
          user_id?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hirer_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      job_applications: {
        Row: {
          cover_note: string | null
          created_at: string
          freelancer_profile_id: string
          id: string
          job_id: string
          status: string
        }
        Insert: {
          cover_note?: string | null
          created_at?: string
          freelancer_profile_id: string
          id?: string
          job_id: string
          status?: string
        }
        Update: {
          cover_note?: string | null
          created_at?: string
          freelancer_profile_id?: string
          id?: string
          job_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_freelancer_profile_id_fkey"
            columns: ["freelancer_profile_id"]
            isOneToOne: false
            referencedRelation: "freelancer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          }
        ]
      }
      job_skills: {
        Row: {
          created_at: string
          id: string
          job_id: string
          skill_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          skill_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_skills_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          }
        ]
      }
      jobs: {
        Row: {
          accepted_count: number
          application_deadline: string | null
          budget_max: number | null
          budget_min: number | null
          budget_type: string
          category_id: string | null
          contact_preference: string
          created_at: string
          description: string
          duration_type: string
          expires_at: string | null
          hirer_profile_id: string
          id: string
          image_urls: string[]
          is_featured: boolean
          is_urgent: boolean
          is_vip: boolean
          location_type: string
          status: string
          subcategory_id: string | null
          title: string
          updated_at: string
          vacancies: number
          vip_expires_at: string | null
          vip_tier: string | null
          views_count: number
        }
        Insert: {
          accepted_count?: number
          application_deadline?: string | null
          budget_max?: number | null
          budget_min?: number | null
          budget_type: string
          category_id?: string | null
          contact_preference: string
          created_at?: string
          description: string
          duration_type: string
          expires_at?: string | null
          hirer_profile_id: string
          id?: string
          image_urls?: string[]
          is_featured?: boolean
          is_urgent?: boolean
          is_vip?: boolean
          location_type: string
          status?: string
          subcategory_id?: string | null
          title: string
          updated_at?: string
          vacancies?: number
          vip_expires_at?: string | null
          vip_tier?: string | null
          views_count?: number
        }
        Update: {
          accepted_count?: number
          application_deadline?: string | null
          budget_max?: number | null
          budget_min?: number | null
          budget_type?: string
          category_id?: string
          contact_preference?: string
          created_at?: string
          description?: string
          duration_type?: string
          expires_at?: string | null
          hirer_profile_id?: string
          id?: string
          image_urls?: string[]
          is_featured?: boolean
          is_urgent?: boolean
          is_vip?: boolean
          location_type?: string
          status?: string
          subcategory_id?: string | null
          title?: string
          updated_at?: string
          vacancies?: number
          vip_expires_at?: string | null
          vip_tier?: string | null
          views_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "jobs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_hirer_profile_id_fkey"
            columns: ["hirer_profile_id"]
            isOneToOne: false
            referencedRelation: "hirer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          }
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      vip_payments: {
        Row: {
          amount: number
          completed_at: string | null
          created_at: string
          currency: string
          id: string
          listing_id: string
          paypal_order_id: string
          status: string
          tier: string
          user_id: string
          vip_days: number | null
        }
        Insert: {
          amount: number
          completed_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          listing_id: string
          paypal_order_id: string
          status?: string
          tier: string
          user_id: string
          vip_days?: number | null
        }
        Update: {
          amount?: number
          completed_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          listing_id?: string
          paypal_order_id?: string
          status?: string
          tier?: string
          user_id?: string
          vip_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vip_payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          payload: Json
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          payload?: Json
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          payload?: Json
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      portfolio_items: {
        Row: {
          created_at: string
          description: string | null
          freelancer_profile_id: string
          id: string
          image_url: string
          project_url: string | null
          sort_order: number
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          freelancer_profile_id: string
          id?: string
          image_url: string
          project_url?: string | null
          sort_order?: number
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          freelancer_profile_id?: string
          id?: string
          image_url?: string
          project_url?: string | null
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_items_freelancer_profile_id_fkey"
            columns: ["freelancer_profile_id"]
            isOneToOne: false
            referencedRelation: "freelancer_profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      profile_visits: {
        Row: {
          id: string
          created_at: string
          visitor_user_id: string | null
          freelancer_profile_id: string | null
          hirer_profile_id: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          visitor_user_id?: string | null
          freelancer_profile_id?: string | null
          hirer_profile_id?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          visitor_user_id?: string | null
          freelancer_profile_id?: string | null
          hirer_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_visits_freelancer_profile_id_fkey"
            columns: ["freelancer_profile_id"]
            isOneToOne: false
            referencedRelation: "freelancer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_visits_hirer_profile_id_fkey"
            columns: ["hirer_profile_id"]
            isOneToOne: false
            referencedRelation: "hirer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          city: string | null
          created_at: string
          cv_url: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean
          is_online: boolean
          is_verified: boolean
          member_since: string
          phone: string | null
          updated_at: string
          user_type: string
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          cv_url?: string | null
          email: string
          full_name: string
          id: string
          is_active?: boolean
          is_online?: boolean
          is_verified?: boolean
          member_since?: string
          phone?: string | null
          updated_at?: string
          user_type: string
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          cv_url?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          is_online?: boolean
          is_verified?: boolean
          member_since?: string
          phone?: string | null
          updated_at?: string
          user_type?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_id: string
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_id: string
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      reviews: {
        Row: {
          completed_job_id: string | null
          created_at: string
          id: string
          is_locked: boolean
          rating_communication: number
          rating_overall: number
          rating_quality: number
          rating_timeliness: number
          review_text: string
          reviewee_id: string
          reviewer_id: string
          service_inquiry_id: string | null
          updated_at: string
        }
        Insert: {
          completed_job_id?: string | null
          created_at?: string
          id?: string
          is_locked?: boolean
          rating_communication: number
          rating_overall: number
          rating_quality: number
          rating_timeliness: number
          review_text: string
          reviewee_id: string
          reviewer_id: string
          service_inquiry_id?: string | null
          updated_at?: string
        }
        Update: {
          completed_job_id?: string | null
          created_at?: string
          id?: string
          is_locked?: boolean
          rating_communication?: number
          rating_overall?: number
          rating_quality?: number
          rating_timeliness?: number
          review_text?: string
          reviewee_id?: string
          reviewer_id?: string
          service_inquiry_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_completed_job_id_fkey"
            columns: ["completed_job_id"]
            isOneToOne: false
            referencedRelation: "completed_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_service_inquiry_id_fkey"
            columns: ["service_inquiry_id"]
            isOneToOne: false
            referencedRelation: "service_inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewee_id_fkey"
            columns: ["reviewee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      services: {
        Row: {
          created_at: string
          delivery_days: number | null
          description: string | null
          freelancer_profile_id: string
          id: string
          image_urls: string[]
          is_active: boolean
          is_vip: boolean
          price: number
          price_type: string
          title: string
          updated_at: string
          views_count: number
          vip_expires_at: string | null
        }
        Insert: {
          created_at?: string
          delivery_days?: number | null
          description?: string | null
          freelancer_profile_id: string
          id?: string
          image_urls?: string[]
          is_active?: boolean
          is_vip?: boolean
          price: number
          price_type?: string
          title: string
          updated_at?: string
          views_count?: number
          vip_expires_at?: string | null
        }
        Update: {
          created_at?: string
          delivery_days?: number | null
          description?: string | null
          freelancer_profile_id?: string
          id?: string
          image_urls?: string[]
          is_active?: boolean
          is_vip?: boolean
          price?: number
          price_type?: string
          title?: string
          updated_at?: string
          views_count?: number
          vip_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "services_freelancer_profile_id_fkey"
            columns: ["freelancer_profile_id"]
            isOneToOne: false
            referencedRelation: "freelancer_profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      user_saved_items: {
        Row: {
          created_at: string
          id: string
          resource_id: string
          resource_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          resource_id: string
          resource_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          resource_id?: string
          resource_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_saved_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      service_inquiries: {
        Row: {
          completed_at: string | null
          created_at: string
          freelancer_profile_id: string
          hirer_profile_id: string
          id: string
          message: string
          proposed_budget: number | null
          service_id: string
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          freelancer_profile_id: string
          hirer_profile_id: string
          id?: string
          message: string
          proposed_budget?: number | null
          service_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          freelancer_profile_id?: string
          hirer_profile_id?: string
          id?: string
          message?: string
          proposed_budget?: number | null
          service_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_inquiries_freelancer_profile_id_fkey"
            columns: ["freelancer_profile_id"]
            isOneToOne: false
            referencedRelation: "freelancer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_inquiries_hirer_profile_id_fkey"
            columns: ["hirer_profile_id"]
            isOneToOne: false
            referencedRelation: "hirer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_inquiries_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          }
        ]
      }
      skills: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          is_approved: boolean
          name: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          is_approved?: boolean
          name: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          is_approved?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "skills_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          }
        ]
      }
      subcategories: {
        Row: {
          category_id: string
          created_at: string
          id: string
          is_active: boolean
          name_en: string
          name_ka: string
          slug: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_en: string
          name_ka: string
          slug: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_en?: string
          name_ka?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      count_distinct_hirer_visitors_to_freelancer: {
        Args: { target_freelancer_profile_id: string }
        Returns: number
      }
      public_freelancer_completed_service_titles: {
        Args: { p_freelancer_profile_id: string }
        Returns: { service_title: string; completed_at: string }[]
      }
      public_job_application_counts: {
        Args: { p_job_ids: string[] }
        Returns: { job_id: string; applicants_count: number }[]
      }
      handle_job_completion: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      handle_job_posted: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      handle_new_user: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      increment_job_views: {
        Args: { p_job_id: string }
        Returns: number
      }
      increment_service_views: {
        Args: { p_service_id: string }
        Returns: number
      }
      set_updated_at: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      update_freelancer_rating: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      delete_user: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      get_or_create_conversation: {
        Args: {
          p_other_user_id: string
          p_job_application_id?: string | null
          p_service_inquiry_id?: string | null
        }
        Returns: string
      }
      send_status_notification: {
        Args: {
          p_target_user_id: string
          p_title: string
          p_body: string
          p_link: string
          p_type?: string | null
        }
        Returns: undefined
      }
      get_job_hirer_contact_for_applicant: {
        Args: { p_job_id: string }
        Returns: { email: string; phone: string | null }[]
      }
      get_home_feed: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_jobs_page: {
        Args: {
          p_search?: string | null
          p_limit?: number
          p_offset?: number
          p_category_id?: string | null
        }
        Returns: Json
      }
      get_listings_page: {
        Args: {
          p_search?: string | null
          p_limit?: number
          p_offset?: number
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never
