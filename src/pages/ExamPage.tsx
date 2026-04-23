import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ExamList from '@/components/exam/ExamList';
import CreateExamModal from '@/components/exam/CreateExamModal';
import TakeExam from '@/components/exam/TakeExam';
import ExamResult from '@/components/exam/ExamResult';
import ExamAnalytics from '@/components/exam/ExamAnalytics';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface ExamData {
  id: string; title: string; description: string | null; duration_minutes: number;
  total_marks: number; pass_marks: number; chapter_id: string; is_active: boolean;
  created_at: string; created_by: string | null; school_id: string | null;
  scheduled_date?: string | null; scheduled_start_time?: string | null;
  scheduled_end_time?: string | null; publish_status?: string;
  day_plan_id?: string | null; leaderboard_visible?: boolean;
}

export interface QuestionData {
  id: string; exam_id: string; question_text: string;
  option_a: string; option_b: string; option_c: string; option_d: string;
  correct_answer?: string; marks: number; order_index: number;
}

const ExamPage = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [exams, setExams] = useState<ExamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeExam, setActiveExam] = useState<ExamData | null>(null);
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [currentIdx, setCurrentIdx] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [activeTab, setActiveTab] = useState('exams');

  const canManage = user?.role === 'teacher' || user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'developer';
  const isStudent = user?.role === 'student';

  const fetchExams = useCallback(async () => {
    try {
      let query = supabase.from('exams').select('*').order('created_at', { ascending: false });

      if (isStudent) {
        query = query.eq('is_active', true);
        if (user?.class_id) {
          const { data: subjects } = await supabase.from('subjects').select('id').eq('class_id', user.class_id);
          if (subjects && subjects.length > 0) {
            const { data: chapters } = await supabase.from('chapters').select('id').in('subject_id', subjects.map(s => s.id));
            if (chapters && chapters.length > 0) {
              query = query.in('chapter_id', chapters.map(c => c.id));
            } else { setExams([]); setLoading(false); return; }
          } else { setExams([]); setLoading(false); return; }
        }
      }

      const { data } = await query;
      setExams((data as ExamData[]) || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [user, isStudent]);

  useEffect(() => { fetchExams(); }, [fetchExams]);

  useEffect(() => {
    const takeExamId = searchParams.get('take');
    if (!takeExamId || loading || !exams.length || activeExam) return;

    const exam = exams.find((entry) => entry.id === takeExamId);
    if (!exam) return;

    startExam(exam).finally(() => {
      const next = new URLSearchParams(searchParams);
      next.delete('take');
      setSearchParams(next, { replace: true });
    });
  }, [searchParams, loading, exams, activeExam]);

  const isExamAccessible = (exam: ExamData): { accessible: boolean; reason: string } => {
    if (!isStudent) return { accessible: true, reason: '' };
    if (!exam.scheduled_date) return { accessible: true, reason: '' };

    const now = new Date();
    const examDate = new Date(exam.scheduled_date);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const examDay = new Date(examDate.getFullYear(), examDate.getMonth(), examDate.getDate());

    if (today < examDay) return { accessible: false, reason: `Opens on ${examDate.toLocaleDateString()}` };
    if (today > examDay) return { accessible: false, reason: 'Exam window has passed' };

    if (exam.scheduled_start_time && exam.scheduled_end_time) {
      const [sh, sm] = exam.scheduled_start_time.split(':').map(Number);
      const [eh, em] = exam.scheduled_end_time.split(':').map(Number);
      const currentMins = now.getHours() * 60 + now.getMinutes();
      const startMins = sh * 60 + sm;
      const endMins = eh * 60 + em;
      if (currentMins < startMins) return { accessible: false, reason: `Opens at ${exam.scheduled_start_time}` };
      if (currentMins > endMins) return { accessible: false, reason: 'Exam window has passed' };
    }
    return { accessible: true, reason: '' };
  };

  const startExam = async (exam: ExamData) => {
    const access = isExamAccessible(exam);
    if (!access.accessible && isStudent) {
      toast.error(access.reason);
      return;
    }

    if (isStudent) {
      const { data: studentQuestions, error } = await supabase.rpc('get_exam_questions_for_student', { _exam_id: exam.id });
      if (error) { toast.error('Unable to load exam questions securely'); return; }
      if (!studentQuestions || studentQuestions.length === 0) { toast.error('No questions found'); return; }
      setQuestions(studentQuestions as QuestionData[]);
    } else {
      const { data: qs } = await supabase.from('questions').select('*').eq('exam_id', exam.id).order('order_index');
      if (!qs || qs.length === 0) { toast.error('No questions found'); return; }
      setQuestions(qs as QuestionData[]);
    }

    setActiveExam(exam); setAnswers({}); setFlagged(new Set());
    setCurrentIdx(0); setSubmitted(false); setTimeLeft(exam.duration_minutes * 60);
  };

  const handleSubmit = useCallback(async () => {
    if (!activeExam || submitted) return;
    try {
      let finalScore = 0;
      if (isStudent) {
        const { data, error } = await supabase.rpc('grade_exam_submission', { _exam_id: activeExam.id, _answers: answers });
        if (error) { toast.error('Could not grade exam securely'); return; }
        const result = Array.isArray(data) ? data[0] : data;
        finalScore = result?.score ?? 0;
        if (Array.isArray(result?.reviewed_questions)) setQuestions(result.reviewed_questions as unknown as QuestionData[]);
      } else {
        questions.forEach(q => { if (answers[q.id] === q.correct_answer) finalScore += q.marks; });
      }
      setScore(finalScore); setSubmitted(true);
      if (user) {
        await supabase.from('exam_results').insert({
          exam_id: activeExam.id, student_id: user.user_id, score: finalScore,
          total_marks: activeExam.total_marks, answers: answers as any, school_id: user.school_id || null,
        });
      }
    } catch { toast.error('Failed to submit exam.'); }
  }, [activeExam, answers, questions, submitted, user, isStudent]);

  useEffect(() => {
    if (!activeExam || submitted) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => { if (prev <= 1) { clearInterval(timer); handleSubmit(); return 0; } return prev - 1; });
    }, 1000);
    return () => clearInterval(timer);
  }, [activeExam, submitted, handleSubmit]);

  const resetExam = () => {
    setActiveExam(null); setQuestions([]); setAnswers({}); setFlagged(new Set());
    setCurrentIdx(0); setSubmitted(false); setScore(0); setTimeLeft(0);
  };

  if (activeExam && submitted) {
    return <ExamResult exam={activeExam} score={score} questions={questions} answers={answers} onBack={resetExam} />;
  }
  if (activeExam && questions.length > 0) {
    return (
      <TakeExam exam={activeExam} questions={questions} answers={answers} setAnswers={setAnswers}
        flagged={flagged} setFlagged={setFlagged} currentIdx={currentIdx} setCurrentIdx={setCurrentIdx}
        timeLeft={timeLeft} onSubmit={handleSubmit} />
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="exams">Exams</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>
        <TabsContent value="exams">
          <ExamList exams={exams} loading={loading} canManage={canManage} onStartExam={startExam}
            onCreateExam={() => setShowCreateModal(true)} onRefresh={fetchExams} isExamAccessible={isExamAccessible} />
          {showCreateModal && (
            <CreateExamModal onClose={() => setShowCreateModal(false)} onCreated={() => { setShowCreateModal(false); fetchExams(); }} />
          )}
        </TabsContent>
        <TabsContent value="analytics">
          <ExamAnalytics exams={exams} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ExamPage;
