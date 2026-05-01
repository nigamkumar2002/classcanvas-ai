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
      announcements: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          is_active: boolean
          message: string
          school_id: string | null
          target_role: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          message: string
          school_id?: string | null
          target_role?: string | null
          title: string
          type?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          message?: string
          school_id?: string | null
          target_role?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_submissions: {
        Row: {
          feedback: string | null
          file_name: string | null
          file_url: string | null
          grade: number | null
          graded_at: string | null
          graded_by: string | null
          id: string
          material_id: string
          school_id: string | null
          status: string
          student_id: string
          submission_text: string | null
          submitted_at: string
        }
        Insert: {
          feedback?: string | null
          file_name?: string | null
          file_url?: string | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          material_id: string
          school_id?: string | null
          status?: string
          student_id: string
          submission_text?: string | null
          submitted_at?: string
        }
        Update: {
          feedback?: string | null
          file_name?: string | null
          file_url?: string | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          material_id?: string
          school_id?: string | null
          status?: string
          student_id?: string
          submission_text?: string | null
          submitted_at?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          class_id: string
          created_at: string
          date: string
          id: string
          marked_by: string
          notes: string | null
          school_id: string | null
          status: string
          student_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          date?: string
          id?: string
          marked_by: string
          notes?: string | null
          school_id?: string | null
          status?: string
          student_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          date?: string
          id?: string
          marked_by?: string
          notes?: string | null
          school_id?: string | null
          status?: string
          student_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          school_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          school_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          school_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      board_prep_settings: {
        Row: {
          created_at: string
          enabled_class_ids: string[]
          id: string
          school_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          enabled_class_ids?: string[]
          id?: string
          school_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          enabled_class_ids?: string[]
          id?: string
          school_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      certificates: {
        Row: {
          certificate_type: string
          certificate_url: string | null
          created_at: string
          description: string | null
          id: string
          issued_at: string
          issued_by: string
          school_id: string | null
          student_id: string
          title: string
        }
        Insert: {
          certificate_type?: string
          certificate_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          issued_at?: string
          issued_by: string
          school_id?: string | null
          student_id: string
          title: string
        }
        Update: {
          certificate_type?: string
          certificate_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          issued_at?: string
          issued_by?: string
          school_id?: string | null
          student_id?: string
          title?: string
        }
        Relationships: []
      }
      chapters: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          order_index: number
          school_id: string | null
          subject_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          order_index?: number
          school_id?: string | null
          subject_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          order_index?: number
          school_id?: string | null
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapters_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapters_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          grade_level: number | null
          id: string
          is_active: boolean
          name: string
          school_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          grade_level?: number | null
          id?: string
          is_active?: boolean
          name: string
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          grade_level?: number | null
          id?: string
          is_active?: boolean
          name?: string
          school_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      complaint_activity: {
        Row: {
          action: string
          actor_id: string | null
          complaint_id: string
          created_at: string
          details: Json | null
          id: string
          school_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          complaint_id: string
          created_at?: string
          details?: Json | null
          id?: string
          school_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          complaint_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaint_activity_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
        ]
      }
      complaint_responses: {
        Row: {
          action_taken: string | null
          complaint_id: string
          created_at: string
          id: string
          message: string
          responder_id: string
          school_id: string
        }
        Insert: {
          action_taken?: string | null
          complaint_id: string
          created_at?: string
          id?: string
          message: string
          responder_id: string
          school_id: string
        }
        Update: {
          action_taken?: string | null
          complaint_id?: string
          created_at?: string
          id?: string
          message?: string
          responder_id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaint_responses_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
        ]
      }
      complaints: {
        Row: {
          against_role: string | null
          category: string
          created_at: string
          current_assignee: string | null
          current_level: string
          description: string
          escalation_count: number
          id: string
          last_reminder_at: string | null
          priority: string
          raised_against: string | null
          raised_by: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          school_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          against_role?: string | null
          category?: string
          created_at?: string
          current_assignee?: string | null
          current_level?: string
          description: string
          escalation_count?: number
          id?: string
          last_reminder_at?: string | null
          priority?: string
          raised_against?: string | null
          raised_by: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          school_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          against_role?: string | null
          category?: string
          created_at?: string
          current_assignee?: string | null
          current_level?: string
          description?: string
          escalation_count?: number
          id?: string
          last_reminder_at?: string | null
          priority?: string
          raised_against?: string | null
          raised_by?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          school_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      content_approvals: {
        Row: {
          comments: string | null
          content_id: string
          content_title: string
          content_type: string
          created_at: string
          id: string
          reviewer_id: string | null
          school_id: string | null
          status: string
          submitted_by: string
          updated_at: string
        }
        Insert: {
          comments?: string | null
          content_id: string
          content_title: string
          content_type: string
          created_at?: string
          id?: string
          reviewer_id?: string | null
          school_id?: string | null
          status?: string
          submitted_by: string
          updated_at?: string
        }
        Update: {
          comments?: string | null
          content_id?: string
          content_title?: string
          content_type?: string
          created_at?: string
          id?: string
          reviewer_id?: string | null
          school_id?: string | null
          status?: string
          submitted_by?: string
          updated_at?: string
        }
        Relationships: []
      }
      exam_results: {
        Row: {
          answers: Json | null
          completed_at: string
          exam_id: string
          id: string
          school_id: string | null
          score: number
          student_id: string
          total_marks: number
        }
        Insert: {
          answers?: Json | null
          completed_at?: string
          exam_id: string
          id?: string
          school_id?: string | null
          score?: number
          student_id: string
          total_marks: number
        }
        Update: {
          answers?: Json | null
          completed_at?: string
          exam_id?: string
          id?: string
          school_id?: string | null
          score?: number
          student_id?: string
          total_marks?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_results_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_results_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          chapter_id: string
          created_at: string
          created_by: string | null
          day_plan_id: string | null
          description: string | null
          duration_minutes: number
          exam_kind: string
          id: string
          is_active: boolean
          is_board_prep: boolean
          leaderboard_visible: boolean
          pass_marks: number
          publish_status: string
          pyq_year: number | null
          scheduled_date: string | null
          scheduled_end_time: string | null
          scheduled_start_time: string | null
          school_id: string | null
          title: string
          topic: string | null
          total_marks: number
        }
        Insert: {
          chapter_id: string
          created_at?: string
          created_by?: string | null
          day_plan_id?: string | null
          description?: string | null
          duration_minutes?: number
          exam_kind?: string
          id?: string
          is_active?: boolean
          is_board_prep?: boolean
          leaderboard_visible?: boolean
          pass_marks?: number
          publish_status?: string
          pyq_year?: number | null
          scheduled_date?: string | null
          scheduled_end_time?: string | null
          scheduled_start_time?: string | null
          school_id?: string | null
          title: string
          topic?: string | null
          total_marks?: number
        }
        Update: {
          chapter_id?: string
          created_at?: string
          created_by?: string | null
          day_plan_id?: string | null
          description?: string | null
          duration_minutes?: number
          exam_kind?: string
          id?: string
          is_active?: boolean
          is_board_prep?: boolean
          leaderboard_visible?: boolean
          pass_marks?: number
          publish_status?: string
          pyq_year?: number | null
          scheduled_date?: string | null
          scheduled_end_time?: string | null
          scheduled_start_time?: string | null
          school_id?: string | null
          title?: string
          topic?: string | null
          total_marks?: number
        }
        Relationships: [
          {
            foreignKeyName: "exams_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_records: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          fee_type: string
          id: string
          paid_date: string | null
          receipt_number: string | null
          school_id: string | null
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          fee_type?: string
          id?: string
          paid_date?: string | null
          receipt_number?: string | null
          school_id?: string | null
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          fee_type?: string
          id?: string
          paid_date?: string | null
          receipt_number?: string | null
          school_id?: string | null
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          class_id: string | null
          comments: string | null
          created_at: string
          id: string
          is_anonymous: boolean
          rating: number
          school_id: string | null
          student_id: string
          subject_id: string | null
          teacher_id: string | null
        }
        Insert: {
          class_id?: string | null
          comments?: string | null
          created_at?: string
          id?: string
          is_anonymous?: boolean
          rating?: number
          school_id?: string | null
          student_id: string
          subject_id?: string | null
          teacher_id?: string | null
        }
        Update: {
          class_id?: string | null
          comments?: string | null
          created_at?: string
          id?: string
          is_anonymous?: boolean
          rating?: number
          school_id?: string | null
          student_id?: string
          subject_id?: string | null
          teacher_id?: string | null
        }
        Relationships: []
      }
      grades: {
        Row: {
          class_id: string
          created_at: string
          exam_type: string
          grade_letter: string | null
          graded_by: string
          id: string
          marks_obtained: number
          remarks: string | null
          school_id: string | null
          student_id: string
          subject_id: string
          total_marks: number
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          exam_type?: string
          grade_letter?: string | null
          graded_by: string
          id?: string
          marks_obtained?: number
          remarks?: string | null
          school_id?: string | null
          student_id: string
          subject_id: string
          total_marks?: number
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          exam_type?: string
          grade_letter?: string | null
          graded_by?: string
          id?: string
          marks_obtained?: number
          remarks?: string | null
          school_id?: string | null
          student_id?: string
          subject_id?: string
          total_marks?: number
          updated_at?: string
        }
        Relationships: []
      }
      homework_assignments: {
        Row: {
          assigned_date: string
          attachment_url: string | null
          class_id: string
          created_at: string
          description: string | null
          due_date: string
          id: string
          is_active: boolean
          lesson_plan_id: string | null
          max_marks: number | null
          school_id: string
          subject_id: string
          teacher_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_date?: string
          attachment_url?: string | null
          class_id: string
          created_at?: string
          description?: string | null
          due_date: string
          id?: string
          is_active?: boolean
          lesson_plan_id?: string | null
          max_marks?: number | null
          school_id: string
          subject_id: string
          teacher_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_date?: string
          attachment_url?: string | null
          class_id?: string
          created_at?: string
          description?: string | null
          due_date?: string
          id?: string
          is_active?: boolean
          lesson_plan_id?: string | null
          max_marks?: number | null
          school_id?: string
          subject_id?: string
          teacher_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_assignments_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_submissions: {
        Row: {
          feedback: string | null
          file_url: string | null
          grade: number | null
          graded_at: string | null
          graded_by: string | null
          homework_id: string
          id: string
          school_id: string
          status: string
          student_id: string
          submission_text: string | null
          submitted_at: string
        }
        Insert: {
          feedback?: string | null
          file_url?: string | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          homework_id: string
          id?: string
          school_id: string
          status?: string
          student_id: string
          submission_text?: string | null
          submitted_at?: string
        }
        Update: {
          feedback?: string | null
          file_url?: string | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          homework_id?: string
          id?: string
          school_id?: string
          status?: string
          student_id?: string
          submission_text?: string | null
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_submissions_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "homework_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_plan_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_type: string | null
          file_url: string
          id: string
          lesson_plan_id: string
          order_index: number
          school_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_type?: string | null
          file_url: string
          id?: string
          lesson_plan_id: string
          order_index?: number
          school_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_type?: string | null
          file_url?: string
          id?: string
          lesson_plan_id?: string
          order_index?: number
          school_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_plan_attachments_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_plans: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          chapter_id: string | null
          class_id: string
          completed_at: string | null
          created_at: string
          day_number: number | null
          description: string | null
          duration_minutes: number
          file_name: string | null
          file_type: string | null
          file_url: string | null
          id: string
          is_completed: boolean
          notepad_content: Json | null
          notes: string | null
          objectives: string | null
          period_number: number
          planned_date: string
          rejection_reason: string | null
          resources: string | null
          school_id: string
          status: string
          subject_id: string
          teacher_id: string
          title: string
          updated_at: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          chapter_id?: string | null
          class_id: string
          completed_at?: string | null
          created_at?: string
          day_number?: number | null
          description?: string | null
          duration_minutes?: number
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_completed?: boolean
          notepad_content?: Json | null
          notes?: string | null
          objectives?: string | null
          period_number?: number
          planned_date?: string
          rejection_reason?: string | null
          resources?: string | null
          school_id: string
          status?: string
          subject_id: string
          teacher_id: string
          title: string
          updated_at?: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          chapter_id?: string | null
          class_id?: string
          completed_at?: string | null
          created_at?: string
          day_number?: number | null
          description?: string | null
          duration_minutes?: number
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_completed?: boolean
          notepad_content?: Json | null
          notes?: string | null
          objectives?: string | null
          period_number?: number
          planned_date?: string
          rejection_reason?: string | null
          resources?: string | null
          school_id?: string
          status?: string
          subject_id?: string
          teacher_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      live_session_participants: {
        Row: {
          approved_at: string | null
          id: string
          joined_at: string | null
          session_id: string
          status: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          id?: string
          joined_at?: string | null
          session_id: string
          status?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          id?: string
          joined_at?: string | null
          session_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_session_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_sessions: {
        Row: {
          annotations: Json | null
          chapter_id: string | null
          class_id: string | null
          created_at: string
          current_material_id: string | null
          current_page: number | null
          ended_at: string | null
          id: string
          join_code: string | null
          meeting_link: string | null
          school_id: string | null
          started_at: string | null
          status: string
          teacher_id: string
          title: string
        }
        Insert: {
          annotations?: Json | null
          chapter_id?: string | null
          class_id?: string | null
          created_at?: string
          current_material_id?: string | null
          current_page?: number | null
          ended_at?: string | null
          id?: string
          join_code?: string | null
          meeting_link?: string | null
          school_id?: string | null
          started_at?: string | null
          status?: string
          teacher_id: string
          title: string
        }
        Update: {
          annotations?: Json | null
          chapter_id?: string | null
          class_id?: string | null
          created_at?: string
          current_material_id?: string | null
          current_page?: number | null
          ended_at?: string | null
          id?: string
          join_code?: string | null
          meeting_link?: string | null
          school_id?: string | null
          started_at?: string | null
          status?: string
          teacher_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_sessions_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          chapter_id: string
          created_at: string
          description: string | null
          file_name: string | null
          file_size: number | null
          file_type: string | null
          file_url: string | null
          id: string
          is_active: boolean
          school_id: string | null
          thumbnail_url: string | null
          title: string
          topic: string | null
          type: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          chapter_id: string
          created_at?: string
          description?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean
          school_id?: string | null
          thumbnail_url?: string | null
          title: string
          topic?: string | null
          type: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          chapter_id?: string
          created_at?: string
          description?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean
          school_id?: string | null
          thumbnail_url?: string | null
          title?: string
          topic?: string | null
          type?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "materials_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          is_read: boolean
          parent_message_id: string | null
          recipient_id: string
          school_id: string | null
          sender_id: string
          subject: string | null
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_read?: boolean
          parent_message_id?: string | null
          recipient_id: string
          school_id?: string | null
          sender_id: string
          subject?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_read?: boolean
          parent_message_id?: string | null
          recipient_id?: string
          school_id?: string | null
          sender_id?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          message: string | null
          school_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string | null
          school_id?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string | null
          school_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      practice_questions: {
        Row: {
          correct_answer: string
          id: string
          marks: number
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          order_index: number
          practice_test_id: string
          question_text: string
          school_id: string
          student_answer: string | null
        }
        Insert: {
          correct_answer: string
          id?: string
          marks?: number
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          order_index?: number
          practice_test_id: string
          question_text: string
          school_id: string
          student_answer?: string | null
        }
        Update: {
          correct_answer?: string
          id?: string
          marks?: number
          option_a?: string
          option_b?: string
          option_c?: string
          option_d?: string
          order_index?: number
          practice_test_id?: string
          question_text?: string
          school_id?: string
          student_answer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "practice_questions_practice_test_id_fkey"
            columns: ["practice_test_id"]
            isOneToOne: false
            referencedRelation: "practice_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_quotas: {
        Row: {
          id: string
          questions_used: number
          quota_start_date: string
          school_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          questions_used?: number
          quota_start_date?: string
          school_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          questions_used?: number
          quota_start_date?: string
          school_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      practice_tests: {
        Row: {
          chapter_id: string | null
          completed_at: string | null
          duration_minutes: number
          generated_at: string
          id: string
          num_questions: number
          school_id: string
          score: number | null
          started_at: string | null
          student_id: string
          subject_id: string | null
          topic: string | null
          total_marks: number | null
        }
        Insert: {
          chapter_id?: string | null
          completed_at?: string | null
          duration_minutes?: number
          generated_at?: string
          id?: string
          num_questions: number
          school_id: string
          score?: number | null
          started_at?: string | null
          student_id: string
          subject_id?: string | null
          topic?: string | null
          total_marks?: number | null
        }
        Update: {
          chapter_id?: string | null
          completed_at?: string | null
          duration_minutes?: number
          generated_at?: string
          id?: string
          num_questions?: number
          school_id?: string
          score?: number | null
          started_at?: string | null
          student_id?: string
          subject_id?: string | null
          topic?: string | null
          total_marks?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          admission_no: string | null
          avatar_url: string | null
          class_id: string | null
          created_at: string
          date_of_birth: string | null
          email: string
          full_name: string
          id: string
          is_demo: boolean
          role: Database["public"]["Enums"]["app_role"]
          roll_no: string | null
          school_id: string | null
          section: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admission_no?: string | null
          avatar_url?: string | null
          class_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          email: string
          full_name: string
          id?: string
          is_demo?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          roll_no?: string | null
          school_id?: string | null
          section?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admission_no?: string | null
          avatar_url?: string | null
          class_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string
          full_name?: string
          id?: string
          is_demo?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          roll_no?: string | null
          school_id?: string | null
          section?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      pyq_uploads: {
        Row: {
          created_at: string
          error_log: string | null
          extracted_questions: Json | null
          extraction_meta: Json
          file_name: string
          file_url: string
          id: string
          pyq_year: number | null
          questions_extracted: number
          questions_inserted: number
          questions_skipped: number
          raw_ai_response: Json | null
          school_id: string
          status: string
          subject_id: string | null
          updated_at: string
          uploaded_by: string
          written_extracted: number
          written_inserted: number
        }
        Insert: {
          created_at?: string
          error_log?: string | null
          extracted_questions?: Json | null
          extraction_meta?: Json
          file_name: string
          file_url: string
          id?: string
          pyq_year?: number | null
          questions_extracted?: number
          questions_inserted?: number
          questions_skipped?: number
          raw_ai_response?: Json | null
          school_id: string
          status?: string
          subject_id?: string | null
          updated_at?: string
          uploaded_by: string
          written_extracted?: number
          written_inserted?: number
        }
        Update: {
          created_at?: string
          error_log?: string | null
          extracted_questions?: Json | null
          extraction_meta?: Json
          file_name?: string
          file_url?: string
          id?: string
          pyq_year?: number | null
          questions_extracted?: number
          questions_inserted?: number
          questions_skipped?: number
          raw_ai_response?: Json | null
          school_id?: string
          status?: string
          subject_id?: string | null
          updated_at?: string
          uploaded_by?: string
          written_extracted?: number
          written_inserted?: number
        }
        Relationships: []
      }
      questions: {
        Row: {
          chapter_id: string | null
          correct_answer: string
          difficulty: string | null
          exam_id: string
          id: string
          marks: number
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          order_index: number
          pyq_year: number | null
          question_hash: string | null
          question_text: string
          school_id: string | null
          source: string
          tags: string[] | null
        }
        Insert: {
          chapter_id?: string | null
          correct_answer: string
          difficulty?: string | null
          exam_id: string
          id?: string
          marks?: number
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          order_index?: number
          pyq_year?: number | null
          question_hash?: string | null
          question_text: string
          school_id?: string | null
          source?: string
          tags?: string[] | null
        }
        Update: {
          chapter_id?: string | null
          correct_answer?: string
          difficulty?: string | null
          exam_id?: string
          id?: string
          marks?: number
          option_a?: string
          option_b?: string
          option_c?: string
          option_d?: string
          order_index?: number
          pyq_year?: number | null
          question_hash?: string | null
          question_text?: string
          school_id?: string | null
          source?: string
          tags?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      revision_items: {
        Row: {
          chapter_id: string | null
          created_at: string
          id: string
          last_seen_at: string
          mastery_status: string
          priority: string
          question_id: string
          school_id: string
          student_id: string
          subject_id: string | null
          updated_at: string
          wrong_count: number
        }
        Insert: {
          chapter_id?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string
          mastery_status?: string
          priority?: string
          question_id: string
          school_id: string
          student_id: string
          subject_id?: string | null
          updated_at?: string
          wrong_count?: number
        }
        Update: {
          chapter_id?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string
          mastery_status?: string
          priority?: string
          question_id?: string
          school_id?: string
          student_id?: string
          subject_id?: string | null
          updated_at?: string
          wrong_count?: number
        }
        Relationships: []
      }
      schedules: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          meeting_link: string | null
          scheduled_at: string
          school_id: string | null
          teacher_id: string
          title: string
          type: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          meeting_link?: string | null
          scheduled_at: string
          school_id?: string | null
          teacher_id: string
          title: string
          type?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          meeting_link?: string | null
          scheduled_at?: string
          school_id?: string | null
          teacher_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_settings: {
        Row: {
          id: string
          key: string
          school_id: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          school_id: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          school_id?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      schools: {
        Row: {
          address: string | null
          city: string | null
          code: string | null
          country: string | null
          created_at: string
          created_by: string | null
          description: string | null
          email: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          phone: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          code?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          phone?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          phone?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      study_plans: {
        Row: {
          created_at: string
          duration_minutes: number
          id: string
          is_completed: boolean
          notes: string | null
          planned_date: string
          school_id: string | null
          student_id: string
          subject_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number
          id?: string
          is_completed?: boolean
          notes?: string | null
          planned_date?: string
          school_id?: string | null
          student_id: string
          subject_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          id?: string
          is_completed?: boolean
          notes?: string | null
          planned_date?: string
          school_id?: string | null
          student_id?: string
          subject_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      subjects: {
        Row: {
          class_id: string
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          school_id: string | null
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          class_id: string
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          school_id?: string | null
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          class_id?: string
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          school_id?: string | null
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      written_questions: {
        Row: {
          chapter_id: string
          created_at: string
          created_by: string | null
          difficulty: string | null
          id: string
          marks: number
          order_index: number
          pyq_year: number | null
          question_hash: string | null
          question_text: string
          question_type: string
          school_id: string
          source: string
          subject_id: string | null
          tags: string[] | null
          updated_at: string
          upload_id: string | null
        }
        Insert: {
          chapter_id: string
          created_at?: string
          created_by?: string | null
          difficulty?: string | null
          id?: string
          marks?: number
          order_index?: number
          pyq_year?: number | null
          question_hash?: string | null
          question_text: string
          question_type?: string
          school_id: string
          source?: string
          subject_id?: string | null
          tags?: string[] | null
          updated_at?: string
          upload_id?: string | null
        }
        Update: {
          chapter_id?: string
          created_at?: string
          created_by?: string | null
          difficulty?: string | null
          id?: string
          marks?: number
          order_index?: number
          pyq_year?: number | null
          question_hash?: string | null
          question_text?: string
          question_type?: string
          school_id?: string
          source?: string
          subject_id?: string | null
          tags?: string[] | null
          updated_at?: string
          upload_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      escalate_stale_complaints: { Args: never; Returns: number }
      get_board_prep_question_pool: {
        Args: {
          _chapter_id?: string
          _limit?: number
          _pyq_year?: number
          _school_id: string
          _subject_id?: string
        }
        Returns: {
          chapter_id: string
          difficulty: string
          id: string
          marks: number
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          pyq_year: number
          question_text: string
        }[]
      }
      get_exam_questions_for_student: {
        Args: { _exam_id: string }
        Returns: {
          exam_id: string
          id: string
          marks: number
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          order_index: number
          question_text: string
        }[]
      }
      get_teacher_rating: {
        Args: { _teacher_id: string }
        Returns: {
          complaints_against: number
          complaints_resolved: number
          rating: number
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_user_school_id: { Args: { _user_id: string }; Returns: string }
      grade_exam_submission: {
        Args: { _answers: Json; _exam_id: string }
        Returns: {
          reviewed_questions: Json
          score: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_board_prep_enabled_for_user: {
        Args: { _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "teacher" | "student" | "developer"
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
      app_role: ["super_admin", "admin", "teacher", "student", "developer"],
    },
  },
} as const
