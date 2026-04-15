

# Lesson Planner System — Simplified Day-Wise Implementation

## Overview
Simple day-wise lesson planning embedded inside each chapter in Classes & Content page. No dates, no complex grids — just Day 1, Day 2, Day 3 sequential plans with optional file/camera upload.

## How It Works
- Navigate to Classes & Content → expand Class → Subject → Chapter
- Inside each chapter, teachers see "Add Day 1 Plan" button
- Each plan: title (required) + notes (optional) + file/camera upload (optional)
- Plans show as Day 1, Day 2, Day 3... with completion checkmarks
- Teachers can edit, delete, mark complete
- Students see read-only day plans
- Admins/Super Admins can view and manage all plans

## Database Changes
- Added `day_number`, `file_url`, `file_name`, `file_type` columns to `lesson_plans` table
- Made `planned_date` and `period_number` have defaults (not required by UI)

## Components
- `DayPlanSection` — embedded inside chapter accordion in ClassesPage
- `LessonPlannerPage` — summary/overview page linking to Classes
