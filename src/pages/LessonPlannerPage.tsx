import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Circle, BookOpen, ArrowRight, NotebookPen } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DayPlan {
  id: string;
  chapter_id: string | null;
  subject_id: string;
  class_id: string;
  day_number: number | null;
  title: string;
  is_completed: boolean;
}

const LessonPlannerPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<DayPlan[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [chapters, setChapters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [{ data: p }, { data: c }, { data: s }, { data: ch }] = await Promise.all([
        (supabase as any).from('lesson_plans').select('id, chapter_id, subject_id, class_id, day_number, title, is_completed').order('day_number'),
        supabase.from('classes').select('id, name').order('grade_level'),
        supabase.from('subjects').select('id, name, class_id, color'),
        supabase.from('chapters').select('id, name, subject_id').order('order_index'),
      ]);
      setPlans(p || []);
      setClasses(c || []);
      setSubjects(s || []);
      setChapters(ch || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const isTeacher = user?.role === 'teacher';
  const isStudent = user?.role === 'student';

  // Group plans by class → subject → chapter
  const classSummary = classes.map(cls => {
    const clsSubjects = subjects.filter(s => s.class_id === cls.id);
    const clsPlans = plans.filter(p => p.class_id === cls.id);
    const completed = clsPlans.filter(p => p.is_completed).length;
    return { ...cls, subjectCount: clsSubjects.length, totalPlans: clsPlans.length, completed };
  }).filter(c => c.totalPlans > 0 || !isStudent);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <NotebookPen className="w-6 h-6 text-primary" /> Lesson Planner
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {plans.length} day plans · {plans.filter(p => p.is_completed).length} completed
          </p>
        </div>
        <button onClick={() => navigate('/classes')}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:opacity-90 transition-all">
          <BookOpen className="w-4 h-4" /> Go to Classes
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <div className="bg-card rounded-2xl border border-border p-4">
        <p className="text-sm text-muted-foreground mb-4">
          Day-wise lesson plans are managed inside each chapter. Go to <button onClick={() => navigate('/classes')} className="text-primary font-medium hover:underline">Classes & Content</button> → expand a class → subject → chapter to add or view day plans.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {classSummary.map(cls => {
          const progress = cls.totalPlans > 0 ? Math.round((cls.completed / cls.totalPlans) * 100) : 0;
          return (
            <button key={cls.id} onClick={() => navigate('/classes')}
              className="bg-card rounded-2xl border border-border p-4 text-left hover:shadow-md transition-all group">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-sm">{cls.name}</h3>
                <span className="text-xs text-muted-foreground">{cls.subjectCount} subjects</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>
                <span className="text-xs font-medium">{cls.completed}/{cls.totalPlans}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2 group-hover:text-primary transition-colors">
                Click to manage day plans →
              </p>
            </button>
          );
        })}
      </div>

      {plans.length === 0 && (
        <div className="bg-card rounded-2xl border border-border p-12 text-center">
          <NotebookPen className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground mb-3">No lesson plans created yet</p>
          <button onClick={() => navigate('/classes')}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90">
            Go to Classes to Start Planning
          </button>
        </div>
      )}
    </div>
  );
};

export default LessonPlannerPage;
