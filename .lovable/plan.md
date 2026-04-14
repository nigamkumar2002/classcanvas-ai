

# Lesson Planner System — Full Implementation Plan

## Overview
Build a comprehensive day-wise lesson planning system with homework management, accessible to teachers (create/edit), admins/super admins (oversight), and students (view schedule + homework). Includes bulk planning, week duplication, progress tracking, and reporting.

## Database Schema (3 new tables + 1 migration)

### Table: `lesson_plans`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| teacher_id | uuid | auth user ref |
| class_id | uuid | |
| subject_id | uuid | |
| chapter_id | uuid | nullable |
| school_id | uuid | |
| title | text | topic title |
| description | text | nullable |
| planned_date | date | the teaching day |
| period_number | integer | 1-8 |
| duration_minutes | integer | default 45 |
| status | text | 'planned', 'completed', 'cancelled' |
| objectives | text | nullable |
| resources | text | nullable |
| notes | text | nullable |
| is_completed | boolean | default false |
| completed_at | timestamptz | nullable |
| created_at / updated_at | timestamptz | |

### Table: `homework_assignments`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| lesson_plan_id | uuid | nullable link |
| class_id | uuid | |
| subject_id | uuid | |
| teacher_id | uuid | |
| school_id | uuid | |
| title | text | |
| description | text | |
| due_date | date | |
| assigned_date | date | default today |
| max_marks | integer | nullable |
| attachment_url | text | nullable |
| is_active | boolean | default true |
| created_at / updated_at | timestamptz | |

### Table: `homework_submissions`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| homework_id | uuid | |
| student_id | uuid | |
| school_id | uuid | |
| submission_text | text | nullable |
| file_url | text | nullable |
| submitted_at | timestamptz | default now |
| grade | numeric | nullable |
| feedback | text | nullable |
| graded_by | uuid | nullable |
| graded_at | timestamptz | nullable |
| status | text | 'submitted', 'graded', 'late' |

### RLS Policies
- Teachers: full CRUD on own lesson_plans and homework in their school
- Admin/Super Admin/Developer: full read + manage for their school
- Students: SELECT on lesson_plans and homework for their class; INSERT/SELECT on homework_submissions for own records

## Frontend Components

### New Page: `src/pages/LessonPlannerPage.tsx`
- **Calendar/Week view** (default: current week Mon-Sat) showing periods as rows, days as columns
- Each cell shows the lesson topic, subject color-coded
- Click cell to add/edit lesson plan
- Toggle between Week and Month view
- Filter by class, subject, teacher (for admins)

### Key UI Sections
1. **Week Grid** — 6 columns (Mon-Sat) x 8 period rows, drag-friendly
2. **Add/Edit Modal** — cascading dropdowns: Class → Subject → Chapter → Topic, date picker, period selector, objectives, attach homework option
3. **Bulk Plan Modal** — plan full week: select class + subject, fill period slots for Mon-Sat at once
4. **Duplicate Week** — button to copy current week's plans to next week with date offset
5. **Homework Tab** — list all homework assignments with status, link to submissions
6. **Student View** — simplified daily schedule + homework list with submit button
7. **Admin Report Tab** — table showing teachers with planned vs unplanned days, completion rates

### Role-Based Views
- **Teacher**: Full CRUD, bulk plan, duplicate, mark complete
- **Admin/Super Admin**: Read all teachers' plans, can edit, see reports
- **Student**: Read-only daily schedule + homework list + submit homework

## Routing & Navigation Changes

### `src/App.tsx`
- Add route: `/lesson-planner` accessible to all roles

### `src/components/AppLayout.tsx`
- Add "Lesson Planner" menu item (BookMarked icon) to: teacher, admin, super_admin, developer, student sidebar menus

## Performance Approach
- Fetch lesson plans scoped to selected week range only (7-day window query)
- Paginated batch fetch for large datasets
- Skeleton loaders instead of spinners

## Implementation Order
1. Create 3 database tables via migration with RLS policies
2. Create `LessonPlannerPage.tsx` with week grid calendar view
3. Add lesson plan CRUD modal (cascading class → subject → chapter dropdowns)
4. Add homework assignment creation linked to lesson plans
5. Add homework submission for students
6. Add bulk plan and duplicate week features
7. Add admin reporting tab
8. Wire up routes and sidebar navigation for all roles

## Technical Details
- All queries use `supabase.from('lesson_plans').select(...)` with `.gte('planned_date', weekStart).lte('planned_date', weekEnd)` for efficient scoped fetching
- Week grid rendered as a CSS grid (6 columns) with period rows
- Duplicate week: query current week plans, map dates +7 days, bulk insert
- Homework submissions use the existing `lms-materials` storage bucket for file uploads

