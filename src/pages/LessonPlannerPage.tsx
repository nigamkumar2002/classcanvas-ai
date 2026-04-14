import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay, parseISO } from 'date-fns';
import {
  ChevronLeft, ChevronRight, Plus, Copy, CheckCircle, Trash2, Edit,
  BookOpen, CalendarIcon, ClipboardList, BarChart3, FileText, Send
} from 'lucide-react';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];
const SUBJECT_COLORS = [
  'bg-blue-100 border-blue-300 text-blue-800',
  'bg-green-100 border-green-300 text-green-800',
  'bg-purple-100 border-purple-300 text-purple-800',
  'bg-orange-100 border-orange-300 text-orange-800',
  'bg-pink-100 border-pink-300 text-pink-800',
  'bg-cyan-100 border-cyan-300 text-cyan-800',
  'bg-yellow-100 border-yellow-300 text-yellow-800',
  'bg-red-100 border-red-300 text-red-800',
];

type LessonPlan = {
  id: string; teacher_id: string; class_id: string; subject_id: string;
  chapter_id: string | null; school_id: string; title: string;
  description: string | null; planned_date: string; period_number: number;
  duration_minutes: number; status: string; objectives: string | null;
  resources: string | null; notes: string | null; is_completed: boolean;
  completed_at: string | null; created_at: string; updated_at: string;
};

type HomeworkAssignment = {
  id: string; lesson_plan_id: string | null; class_id: string;
  subject_id: string; teacher_id: string; school_id: string;
  title: string; description: string | null; due_date: string;
  assigned_date: string; max_marks: number | null;
  attachment_url: string | null; is_active: boolean;
  created_at: string; updated_at: string;
};

type HomeworkSubmission = {
  id: string; homework_id: string; student_id: string; school_id: string;
  submission_text: string | null; file_url: string | null;
  submitted_at: string; grade: number | null; feedback: string | null;
  graded_by: string | null; graded_at: string | null; status: string;
};

const LessonPlannerPage: React.FC = () => {
  const { user } = useAuth();
  const role = user?.role ?? 'student';
  const isTeacherOrAbove = ['teacher', 'admin', 'super_admin', 'developer'].includes(role);
  const isAdminOrAbove = ['admin', 'super_admin', 'developer'].includes(role);
  const isStudent = role === 'student';

  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [lessonPlans, setLessonPlans] = useState<LessonPlan[]>([]);
  const [homework, setHomework] = useState<HomeworkAssignment[]>([]);
  const [submissions, setSubmissions] = useState<HomeworkSubmission[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [chapters, setChapters] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterClassId, setFilterClassId] = useState<string>('all');
  const [filterTeacherId, setFilterTeacherId] = useState<string>('all');

  // Modals
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [showHomeworkModal, setShowHomeworkModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [editingLesson, setEditingLesson] = useState<LessonPlan | null>(null);
  const [editingHomework, setEditingHomework] = useState<HomeworkAssignment | null>(null);
  const [selectedHomework, setSelectedHomework] = useState<HomeworkAssignment | null>(null);

  // Lesson form
  const [lf, setLf] = useState({
    title: '', description: '', class_id: '', subject_id: '', chapter_id: '',
    planned_date: new Date(), period_number: 1, duration_minutes: 45,
    objectives: '', resources: '', notes: ''
  });

  // Homework form
  const [hf, setHf] = useState({
    title: '', description: '', class_id: '', subject_id: '',
    due_date: new Date(), max_marks: '', lesson_plan_id: ''
  });

  // Bulk plan form
  const [bf, setBf] = useState({
    class_id: '', subject_id: '', chapter_id: '',
    slots: DAYS.map((d, i) => ({ day: i, period: 1, title: '', enabled: true }))
  });

  // Submission form
  const [sf, setSf] = useState({ submission_text: '' });

  const weekEnd = useMemo(() => addDays(currentWeekStart, 5), [currentWeekStart]);
  const weekDates = useMemo(() => DAYS.map((_, i) => addDays(currentWeekStart, i)), [currentWeekStart]);

  const subjectColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    subjects.forEach((s, i) => { map[s.id] = SUBJECT_COLORS[i % SUBJECT_COLORS.length]; });
    return map;
  }, [subjects]);

  const subjectNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    subjects.forEach(s => { map[s.id] = s.name; });
    return map;
  }, [subjects]);

  const classNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    classes.forEach(c => { map[c.id] = c.name; });
    return map;
  }, [classes]);

  const teacherNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    teachers.forEach(t => { map[t.user_id] = t.full_name; });
    return map;
  }, [teachers]);

  // Fetch reference data once
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const schoolId = user.school_id;
      const [cRes, sRes, chRes] = await Promise.all([
        supabase.from('classes').select('id,name').eq('school_id', schoolId),
        supabase.from('subjects').select('id,name,class_id,color').eq('school_id', schoolId),
        supabase.from('chapters').select('id,name,subject_id').eq('school_id', schoolId),
      ]);
      setClasses(cRes.data || []);
      setSubjects(sRes.data || []);
      setChapters(chRes.data || []);

      if (isAdminOrAbove) {
        const tRes = await supabase.from('profiles').select('user_id,full_name')
          .eq('school_id', schoolId).eq('role', 'teacher');
        setTeachers(tRes.data || []);
      }
    };
    load();
  }, [user]);

  // Fetch lesson plans + homework scoped to current week
  const fetchWeekData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const ws = format(currentWeekStart, 'yyyy-MM-dd');
    const we = format(weekEnd, 'yyyy-MM-dd');
    const schoolId = user.school_id;

    let lpQuery = supabase.from('lesson_plans').select('*')
      .gte('planned_date', ws).lte('planned_date', we);

    if (!isAdminOrAbove && isTeacherOrAbove) {
      lpQuery = lpQuery.eq('teacher_id', user.id);
    }

    let hwQuery = supabase.from('homework_assignments').select('*')
      .gte('due_date', ws).lte('due_date', we);

    const [lpRes, hwRes] = await Promise.all([lpQuery, hwQuery]);
    setLessonPlans(lpRes.data || []);
    setHomework(hwRes.data || []);

    if (isStudent) {
      const hwIds = (hwRes.data || []).map(h => h.id);
      if (hwIds.length > 0) {
        const subRes = await supabase.from('homework_submissions').select('*')
          .eq('student_id', user.id).in('homework_id', hwIds);
        setSubmissions(subRes.data || []);
      } else {
        setSubmissions([]);
      }
    } else if (isTeacherOrAbove) {
      const hwIds = (hwRes.data || []).map(h => h.id);
      if (hwIds.length > 0) {
        const subRes = await supabase.from('homework_submissions').select('*')
          .in('homework_id', hwIds);
        setSubmissions(subRes.data || []);
      } else {
        setSubmissions([]);
      }
    }

    setLoading(false);
  }, [user, currentWeekStart, weekEnd, isAdminOrAbove, isTeacherOrAbove, isStudent]);

  useEffect(() => { fetchWeekData(); }, [fetchWeekData]);

  // Filtered plans
  const filteredPlans = useMemo(() => {
    let plans = lessonPlans;
    if (filterClassId !== 'all') plans = plans.filter(p => p.class_id === filterClassId);
    if (filterTeacherId !== 'all') plans = plans.filter(p => p.teacher_id === filterTeacherId);
    return plans;
  }, [lessonPlans, filterClassId, filterTeacherId]);

  const getPlanForCell = (dayIndex: number, period: number) => {
    const date = weekDates[dayIndex];
    return filteredPlans.find(p =>
      p.period_number === period && isSameDay(parseISO(p.planned_date), date)
    );
  };

  // CRUD handlers
  const openAddLesson = (dayIndex?: number, period?: number) => {
    setEditingLesson(null);
    setLf({
      title: '', description: '', class_id: classes[0]?.id || '', subject_id: '',
      chapter_id: '', planned_date: dayIndex !== undefined ? weekDates[dayIndex] : new Date(),
      period_number: period || 1, duration_minutes: 45, objectives: '', resources: '', notes: ''
    });
    setShowLessonModal(true);
  };

  const openEditLesson = (plan: LessonPlan) => {
    setEditingLesson(plan);
    setLf({
      title: plan.title, description: plan.description || '',
      class_id: plan.class_id, subject_id: plan.subject_id,
      chapter_id: plan.chapter_id || '',
      planned_date: parseISO(plan.planned_date),
      period_number: plan.period_number, duration_minutes: plan.duration_minutes,
      objectives: plan.objectives || '', resources: plan.resources || '',
      notes: plan.notes || ''
    });
    setShowLessonModal(true);
  };

  const saveLesson = async () => {
    if (!lf.title || !lf.class_id || !lf.subject_id) {
      toast({ title: 'Error', description: 'Title, class, and subject are required', variant: 'destructive' });
      return;
    }
    const payload = {
      title: lf.title, description: lf.description || null,
      class_id: lf.class_id, subject_id: lf.subject_id,
      chapter_id: lf.chapter_id || null, school_id: user!.school_id,
      teacher_id: user!.id, planned_date: format(lf.planned_date, 'yyyy-MM-dd'),
      period_number: lf.period_number, duration_minutes: lf.duration_minutes,
      objectives: lf.objectives || null, resources: lf.resources || null,
      notes: lf.notes || null
    };

    if (editingLesson) {
      const { error } = await supabase.from('lesson_plans').update(payload).eq('id', editingLesson.id);
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Updated', description: 'Lesson plan updated' });
    } else {
      const { error } = await supabase.from('lesson_plans').insert(payload);
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Created', description: 'Lesson plan created' });
    }
    setShowLessonModal(false);
    fetchWeekData();
  };

  const deleteLesson = async (id: string) => {
    await supabase.from('lesson_plans').delete().eq('id', id);
    toast({ title: 'Deleted', description: 'Lesson plan deleted' });
    fetchWeekData();
  };

  const toggleComplete = async (plan: LessonPlan) => {
    const newCompleted = !plan.is_completed;
    await supabase.from('lesson_plans').update({
      is_completed: newCompleted,
      status: newCompleted ? 'completed' : 'planned',
      completed_at: newCompleted ? new Date().toISOString() : null
    }).eq('id', plan.id);
    fetchWeekData();
  };

  const duplicateWeek = async () => {
    if (filteredPlans.length === 0) {
      toast({ title: 'Nothing to duplicate', variant: 'destructive' }); return;
    }
    const nextWeekPlans = filteredPlans.map(p => ({
      title: p.title, description: p.description, class_id: p.class_id,
      subject_id: p.subject_id, chapter_id: p.chapter_id, school_id: p.school_id,
      teacher_id: p.teacher_id, planned_date: format(addDays(parseISO(p.planned_date), 7), 'yyyy-MM-dd'),
      period_number: p.period_number, duration_minutes: p.duration_minutes,
      objectives: p.objectives, resources: p.resources, notes: p.notes,
      status: 'planned', is_completed: false
    }));
    const { error } = await supabase.from('lesson_plans').insert(nextWeekPlans);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Duplicated', description: `${nextWeekPlans.length} plans copied to next week` });
    setCurrentWeekStart(addWeeks(currentWeekStart, 1));
  };

  // Bulk plan
  const saveBulkPlan = async () => {
    if (!bf.class_id || !bf.subject_id) {
      toast({ title: 'Error', description: 'Select class and subject', variant: 'destructive' }); return;
    }
    const plans = bf.slots.filter(s => s.enabled && s.title).map(s => ({
      title: s.title, class_id: bf.class_id, subject_id: bf.subject_id,
      chapter_id: bf.chapter_id || null, school_id: user!.school_id,
      teacher_id: user!.id, planned_date: format(weekDates[s.day], 'yyyy-MM-dd'),
      period_number: s.period, duration_minutes: 45, status: 'planned'
    }));
    if (plans.length === 0) {
      toast({ title: 'Error', description: 'Add at least one lesson', variant: 'destructive' }); return;
    }
    const { error } = await supabase.from('lesson_plans').insert(plans);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Bulk Plan Created', description: `${plans.length} lessons planned` });
    setShowBulkModal(false);
    fetchWeekData();
  };

  // Homework CRUD
  const openAddHomework = (lessonPlanId?: string) => {
    setEditingHomework(null);
    setHf({
      title: '', description: '', class_id: classes[0]?.id || '', subject_id: '',
      due_date: addDays(new Date(), 3), max_marks: '', lesson_plan_id: lessonPlanId || ''
    });
    setShowHomeworkModal(true);
  };

  const saveHomework = async () => {
    if (!hf.title || !hf.class_id || !hf.subject_id) {
      toast({ title: 'Error', description: 'Title, class, subject required', variant: 'destructive' }); return;
    }
    const payload = {
      title: hf.title, description: hf.description || null,
      class_id: hf.class_id, subject_id: hf.subject_id,
      teacher_id: user!.id, school_id: user!.school_id,
      due_date: format(hf.due_date, 'yyyy-MM-dd'),
      max_marks: hf.max_marks ? parseInt(hf.max_marks) : null,
      lesson_plan_id: hf.lesson_plan_id || null
    };
    if (editingHomework) {
      const { error } = await supabase.from('homework_assignments').update(payload).eq('id', editingHomework.id);
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    } else {
      const { error } = await supabase.from('homework_assignments').insert(payload);
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    }
    toast({ title: 'Saved', description: 'Homework saved' });
    setShowHomeworkModal(false);
    fetchWeekData();
  };

  const deleteHomework = async (id: string) => {
    await supabase.from('homework_assignments').delete().eq('id', id);
    toast({ title: 'Deleted' });
    fetchWeekData();
  };

  // Student submit homework
  const submitHomework = async () => {
    if (!selectedHomework || !sf.submission_text) {
      toast({ title: 'Error', description: 'Write your submission', variant: 'destructive' }); return;
    }
    const { error } = await supabase.from('homework_submissions').insert({
      homework_id: selectedHomework.id, student_id: user!.id,
      school_id: user!.school_id, submission_text: sf.submission_text, status: 'submitted'
    });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Submitted', description: 'Homework submitted successfully' });
    setShowSubmitModal(false);
    fetchWeekData();
  };

  // Admin reporting
  const reportData = useMemo(() => {
    if (!isAdminOrAbove) return [];
    const teacherMap: Record<string, { name: string; planned: number; completed: number }> = {};
    lessonPlans.forEach(p => {
      if (!teacherMap[p.teacher_id]) {
        teacherMap[p.teacher_id] = { name: teacherNameMap[p.teacher_id] || 'Unknown', planned: 0, completed: 0 };
      }
      teacherMap[p.teacher_id].planned++;
      if (p.is_completed) teacherMap[p.teacher_id].completed++;
    });
    return Object.entries(teacherMap).map(([id, d]) => ({ id, ...d }));
  }, [lessonPlans, isAdminOrAbove, teacherNameMap]);

  const filteredSubjects = useMemo(() =>
    lf.class_id ? subjects.filter(s => s.class_id === lf.class_id) : subjects
  , [subjects, lf.class_id]);

  const filteredChapters = useMemo(() =>
    lf.subject_id ? chapters.filter(c => c.subject_id === lf.subject_id) : []
  , [chapters, lf.subject_id]);

  const hwFilteredSubjects = useMemo(() =>
    hf.class_id ? subjects.filter(s => s.class_id === hf.class_id) : subjects
  , [subjects, hf.class_id]);

  const bfFilteredSubjects = useMemo(() =>
    bf.class_id ? subjects.filter(s => s.class_id === bf.class_id) : subjects
  , [subjects, bf.class_id]);

  const bfFilteredChapters = useMemo(() =>
    bf.subject_id ? chapters.filter(c => c.subject_id === bf.subject_id) : []
  , [chapters, bf.subject_id]);

  if (loading && lessonPlans.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
          {Array.from({ length: 48 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Lesson Planner</h1>
          <p className="text-sm text-muted-foreground">
            Week of {format(currentWeekStart, 'MMM d')} — {format(weekEnd, 'MMM d, yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="icon" onClick={() => setCurrentWeekStart(subWeeks(currentWeekStart, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          {isTeacherOrAbove && (
            <>
              <Button size="sm" onClick={() => openAddLesson()}><Plus className="w-4 h-4 mr-1" />Add Lesson</Button>
              <Button size="sm" variant="secondary" onClick={() => setShowBulkModal(true)}><ClipboardList className="w-4 h-4 mr-1" />Bulk Plan</Button>
              <Button size="sm" variant="outline" onClick={duplicateWeek}><Copy className="w-4 h-4 mr-1" />Duplicate Week</Button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={filterClassId} onValueChange={setFilterClassId}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Classes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {isAdminOrAbove && (
          <Select value={filterTeacherId} onValueChange={setFilterTeacherId}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Teachers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teachers</SelectItem>
              {teachers.map(t => <SelectItem key={t.user_id} value={t.user_id}>{t.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <Tabs defaultValue="week">
        <TabsList>
          <TabsTrigger value="week"><CalendarIcon className="w-4 h-4 mr-1" />Week View</TabsTrigger>
          <TabsTrigger value="homework"><FileText className="w-4 h-4 mr-1" />Homework</TabsTrigger>
          {isAdminOrAbove && <TabsTrigger value="reports"><BarChart3 className="w-4 h-4 mr-1" />Reports</TabsTrigger>}
        </TabsList>

        {/* WEEK GRID */}
        <TabsContent value="week" className="mt-3">
          <div className="overflow-x-auto">
            <div className="min-w-[700px]">
              {/* Header row */}
              <div className="grid grid-cols-[60px_repeat(6,1fr)] gap-1 mb-1">
                <div className="text-xs font-medium text-muted-foreground p-1">Period</div>
                {weekDates.map((d, i) => (
                  <div key={i} className={cn(
                    "text-center text-xs font-semibold p-1 rounded",
                    isSameDay(d, new Date()) && "bg-primary/10 text-primary"
                  )}>
                    <div>{DAYS[i]}</div>
                    <div className="text-muted-foreground">{format(d, 'MMM d')}</div>
                  </div>
                ))}
              </div>
              {/* Period rows */}
              {PERIODS.map(period => (
                <div key={period} className="grid grid-cols-[60px_repeat(6,1fr)] gap-1 mb-1">
                  <div className="flex items-center justify-center text-xs font-medium text-muted-foreground bg-muted rounded p-1">
                    P{period}
                  </div>
                  {DAYS.map((_, dayIdx) => {
                    const plan = getPlanForCell(dayIdx, period);
                    return (
                      <div
                        key={dayIdx}
                        className={cn(
                          "min-h-[56px] rounded border p-1 text-xs cursor-pointer transition-colors",
                          plan
                            ? cn(subjectColorMap[plan.subject_id] || 'bg-muted', plan.is_completed && 'opacity-60')
                            : "bg-card hover:bg-muted/50 border-dashed border-border"
                        )}
                        onClick={() => plan
                          ? (isTeacherOrAbove ? openEditLesson(plan) : null)
                          : (isTeacherOrAbove ? openAddLesson(dayIdx, period) : null)
                        }
                      >
                        {plan ? (
                          <div className="flex flex-col h-full">
                            <div className="font-semibold truncate">{plan.title}</div>
                            <div className="truncate text-[10px] opacity-70">{subjectNameMap[plan.subject_id]}</div>
                            <div className="mt-auto flex items-center gap-1">
                              {plan.is_completed && <CheckCircle className="w-3 h-3 text-green-600" />}
                              {isTeacherOrAbove && (
                                <button onClick={e => { e.stopPropagation(); toggleComplete(plan); }}
                                  className="p-0.5 rounded hover:bg-white/40">
                                  <CheckCircle className={cn("w-3 h-3", plan.is_completed ? "text-green-600" : "text-muted-foreground")} />
                                </button>
                              )}
                              {isTeacherOrAbove && (
                                <button onClick={e => { e.stopPropagation(); deleteLesson(plan.id); }}
                                  className="p-0.5 rounded hover:bg-white/40 ml-auto">
                                  <Trash2 className="w-3 h-3 text-red-500" />
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          isTeacherOrAbove && <Plus className="w-3 h-3 text-muted-foreground mx-auto mt-4" />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-2 mt-3">
            {subjects.filter(s => filteredPlans.some(p => p.subject_id === s.id)).map(s => (
              <Badge key={s.id} variant="outline" className={cn("text-xs", subjectColorMap[s.id])}>
                {s.name}
              </Badge>
            ))}
          </div>
        </TabsContent>

        {/* HOMEWORK TAB */}
        <TabsContent value="homework" className="mt-3 space-y-3">
          {isTeacherOrAbove && (
            <Button size="sm" onClick={() => openAddHomework()}><Plus className="w-4 h-4 mr-1" />Add Homework</Button>
          )}
          {homework.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground">No homework this week</CardContent></Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {homework.map(hw => {
                const sub = submissions.filter(s => s.homework_id === hw.id);
                const studentSubmission = isStudent ? sub.find(s => s.student_id === user?.id) : null;
                return (
                  <Card key={hw.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-sm">{hw.title}</CardTitle>
                          <p className="text-xs text-muted-foreground">
                            {subjectNameMap[hw.subject_id]} • {classNameMap[hw.class_id]} • Due {format(parseISO(hw.due_date), 'MMM d')}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          {isTeacherOrAbove && (
                            <>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                                setEditingHomework(hw);
                                setHf({
                                  title: hw.title, description: hw.description || '',
                                  class_id: hw.class_id, subject_id: hw.subject_id,
                                  due_date: parseISO(hw.due_date), max_marks: hw.max_marks?.toString() || '',
                                  lesson_plan_id: hw.lesson_plan_id || ''
                                });
                                setShowHomeworkModal(true);
                              }}><Edit className="w-3 h-3" /></Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteHomework(hw.id)}>
                                <Trash2 className="w-3 h-3 text-red-500" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {hw.description && <p className="text-xs mb-2">{hw.description}</p>}
                      {hw.max_marks && <Badge variant="secondary" className="text-xs">Max: {hw.max_marks} marks</Badge>}
                      {isStudent && !studentSubmission && (
                        <Button size="sm" className="mt-2 w-full" onClick={() => {
                          setSelectedHomework(hw);
                          setSf({ submission_text: '' });
                          setShowSubmitModal(true);
                        }}><Send className="w-3 h-3 mr-1" />Submit</Button>
                      )}
                      {isStudent && studentSubmission && (
                        <div className="mt-2 p-2 bg-muted rounded text-xs">
                          <Badge variant={studentSubmission.status === 'graded' ? 'default' : 'secondary'}>
                            {studentSubmission.status}
                          </Badge>
                          {studentSubmission.grade != null && <span className="ml-2 font-bold">Grade: {studentSubmission.grade}</span>}
                          {studentSubmission.feedback && <p className="mt-1">{studentSubmission.feedback}</p>}
                        </div>
                      )}
                      {isTeacherOrAbove && sub.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-2">{sub.length} submission(s)</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ADMIN REPORTS */}
        {isAdminOrAbove && (
          <TabsContent value="reports" className="mt-3">
            <Card>
              <CardHeader><CardTitle className="text-sm">Teacher Planning Report — This Week</CardTitle></CardHeader>
              <CardContent>
                {reportData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No lesson plans this week</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Teacher</th>
                          <th className="text-center p-2">Planned</th>
                          <th className="text-center p-2">Completed</th>
                          <th className="text-center p-2">Completion %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.map(r => (
                          <tr key={r.id} className="border-b">
                            <td className="p-2">{r.name}</td>
                            <td className="text-center p-2">{r.planned}</td>
                            <td className="text-center p-2">{r.completed}</td>
                            <td className="text-center p-2">
                              <Badge variant={r.planned > 0 && r.completed / r.planned >= 0.8 ? 'default' : 'secondary'}>
                                {r.planned > 0 ? Math.round((r.completed / r.planned) * 100) : 0}%
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* ADD/EDIT LESSON MODAL */}
      <Dialog open={showLessonModal} onOpenChange={setShowLessonModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingLesson ? 'Edit' : 'Add'} Lesson Plan</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title *</Label><Input value={lf.title} onChange={e => setLf(p => ({ ...p, title: e.target.value }))} placeholder="Topic to teach" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Class *</Label>
                <Select value={lf.class_id} onValueChange={v => setLf(p => ({ ...p, class_id: v, subject_id: '', chapter_id: '' }))}>
                  <SelectTrigger><SelectValue placeholder="Select Class" /></SelectTrigger>
                  <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Subject *</Label>
                <Select value={lf.subject_id} onValueChange={v => setLf(p => ({ ...p, subject_id: v, chapter_id: '' }))}>
                  <SelectTrigger><SelectValue placeholder="Select Subject" /></SelectTrigger>
                  <SelectContent>{filteredSubjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Chapter</Label>
              <Select value={lf.chapter_id} onValueChange={v => setLf(p => ({ ...p, chapter_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select Chapter (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {filteredChapters.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(lf.planned_date, 'PPP')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={lf.planned_date}
                      onSelect={d => d && setLf(p => ({ ...p, planned_date: d }))}
                      className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div><Label>Period *</Label>
                <Select value={String(lf.period_number)} onValueChange={v => setLf(p => ({ ...p, period_number: parseInt(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PERIODS.map(p => <SelectItem key={p} value={String(p)}>Period {p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Duration (minutes)</Label>
              <Input type="number" value={lf.duration_minutes} onChange={e => setLf(p => ({ ...p, duration_minutes: parseInt(e.target.value) || 45 }))} />
            </div>
            <div><Label>Objectives</Label><Textarea value={lf.objectives} onChange={e => setLf(p => ({ ...p, objectives: e.target.value }))} rows={2} /></div>
            <div><Label>Resources</Label><Textarea value={lf.resources} onChange={e => setLf(p => ({ ...p, resources: e.target.value }))} rows={2} /></div>
            <div><Label>Notes</Label><Textarea value={lf.notes} onChange={e => setLf(p => ({ ...p, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLessonModal(false)}>Cancel</Button>
            <Button onClick={saveLesson}>{editingLesson ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* HOMEWORK MODAL */}
      <Dialog open={showHomeworkModal} onOpenChange={setShowHomeworkModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingHomework ? 'Edit' : 'Add'} Homework</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title *</Label><Input value={hf.title} onChange={e => setHf(p => ({ ...p, title: e.target.value }))} /></div>
            <div><Label>Description</Label><Textarea value={hf.description} onChange={e => setHf(p => ({ ...p, description: e.target.value }))} rows={3} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Class *</Label>
                <Select value={hf.class_id} onValueChange={v => setHf(p => ({ ...p, class_id: v, subject_id: '' }))}>
                  <SelectTrigger><SelectValue placeholder="Select Class" /></SelectTrigger>
                  <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Subject *</Label>
                <Select value={hf.subject_id} onValueChange={v => setHf(p => ({ ...p, subject_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select Subject" /></SelectTrigger>
                  <SelectContent>{hwFilteredSubjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Due Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(hf.due_date, 'PPP')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={hf.due_date}
                      onSelect={d => d && setHf(p => ({ ...p, due_date: d }))}
                      className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div><Label>Max Marks</Label>
                <Input type="number" value={hf.max_marks} onChange={e => setHf(p => ({ ...p, max_marks: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHomeworkModal(false)}>Cancel</Button>
            <Button onClick={saveHomework}>{editingHomework ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BULK PLAN MODAL */}
      <Dialog open={showBulkModal} onOpenChange={setShowBulkModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Bulk Plan — Week of {format(currentWeekStart, 'MMM d')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Class *</Label>
                <Select value={bf.class_id} onValueChange={v => setBf(p => ({ ...p, class_id: v, subject_id: '', chapter_id: '' }))}>
                  <SelectTrigger><SelectValue placeholder="Class" /></SelectTrigger>
                  <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Subject *</Label>
                <Select value={bf.subject_id} onValueChange={v => setBf(p => ({ ...p, subject_id: v, chapter_id: '' }))}>
                  <SelectTrigger><SelectValue placeholder="Subject" /></SelectTrigger>
                  <SelectContent>{bfFilteredSubjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Chapter</Label>
                <Select value={bf.chapter_id} onValueChange={v => setBf(p => ({ ...p, chapter_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Chapter" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {bfFilteredChapters.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              {bf.slots.map((slot, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="checkbox" checked={slot.enabled}
                    onChange={e => setBf(p => {
                      const s = [...p.slots]; s[i] = { ...s[i], enabled: e.target.checked }; return { ...p, slots: s };
                    })} className="rounded" />
                  <span className="w-10 text-sm font-medium">{DAYS[slot.day]}</span>
                  <Select value={String(slot.period)} onValueChange={v => setBf(p => {
                    const s = [...p.slots]; s[i] = { ...s[i], period: parseInt(v) }; return { ...p, slots: s };
                  })}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>{PERIODS.map(p => <SelectItem key={p} value={String(p)}>P{p}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input placeholder="Topic" value={slot.title} disabled={!slot.enabled}
                    onChange={e => setBf(p => {
                      const s = [...p.slots]; s[i] = { ...s[i], title: e.target.value }; return { ...p, slots: s };
                    })} className="flex-1" />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkModal(false)}>Cancel</Button>
            <Button onClick={saveBulkPlan}>Create {bf.slots.filter(s => s.enabled && s.title).length} Plans</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* STUDENT SUBMIT MODAL */}
      <Dialog open={showSubmitModal} onOpenChange={setShowSubmitModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Submit Homework — {selectedHomework?.title}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Your Answer</Label>
              <Textarea value={sf.submission_text} onChange={e => setSf({ submission_text: e.target.value })}
                rows={5} placeholder="Write your submission here..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubmitModal(false)}>Cancel</Button>
            <Button onClick={submitHomework}><Send className="w-4 h-4 mr-1" />Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LessonPlannerPage;
