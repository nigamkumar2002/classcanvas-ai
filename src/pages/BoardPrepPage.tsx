import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { GraduationCap, Trophy, BookOpen, Brain, Target, Calendar, Loader2, Upload, Settings as SettingsIcon, Languages, ChevronRight, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useBoardPrepAccess } from '@/hooks/useBoardPrepAccess';

interface MockExam {
  id: string;
  title: string;
  pyq_year: number | null;
  total_marks: number;
  duration_minutes: number;
  created_at: string;
  subject_name: string;
  chapter_name: string;
  question_count: number;
}
interface ChapterRow { id: string; name: string; subject_id: string; }
interface SubjectRow { id: string; name: string; }
interface WrittenQ {
  id: string;
  question_text: string;
  marks: number;
  pyq_year: number | null;
  question_type: string;
  chapter_id: string;
  subject_id: string | null;
  chapter_name?: string;
  subject_name?: string;
}

interface SectionCard {
  key: 'full' | 'chapter' | 'written' | 'revision';
  title: string;
  subtitle: string;
  countLabel: string;
}

const BoardPrepPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { enabled, loading: accessLoading } = useBoardPrepAccess();

  const [mocks, setMocks] = useState<MockExam[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [revisionCount, setRevisionCount] = useState(0);
  const [generating, setGenerating] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'full' | 'chapter' | 'written' | 'revision'>('full');
  const [written, setWritten] = useState<WrittenQ[]>([]);
  const [writtenSubject, setWrittenSubject] = useState<string>('all');
  const [writtenYear, setWrittenYear] = useState<string>('all');

  const isStaff = user && ['developer', 'super_admin', 'admin'].includes(user.role);
  const canRename = user && ['developer', 'super_admin', 'admin'].includes(user.role);

  const renameExam = async (mock: MockExam) => {
    const next = window.prompt('Rename mock test:', mock.title);
    if (!next || next.trim() === '' || next.trim() === mock.title) return;
    const { error } = await supabase.from('exams').update({ title: next.trim() }).eq('id', mock.id);
    if (error) { toast.error(error.message); return; }
    setMocks(prev => prev.map(m => m.id === mock.id ? { ...m, title: next.trim() } : m));
    toast.success('Renamed');
  };

  const renameChapter = async (chapter: ChapterRow) => {
    const next = window.prompt('Rename chapter:', chapter.name);
    if (!next || next.trim() === '' || next.trim() === chapter.name) return;
    const { error } = await supabase.from('chapters').update({ name: next.trim() }).eq('id', chapter.id);
    if (error) { toast.error(error.message); return; }
    setChapters(prev => prev.map(c => c.id === chapter.id ? { ...c, name: next.trim() } : c));
    toast.success('Renamed');
  };

  useEffect(() => {
    if (!user || accessLoading) return;
    if (!enabled) { setLoading(false); return; }
    (async () => {
      // Year-wise full mock exams with subject/chapter labels and duplicate cleanup
      const { data: exams } = await supabase
        .from('exams')
        .select('id, title, pyq_year, total_marks, duration_minutes, created_at, chapter:chapters(name, subject:subjects(name))')
        .eq('is_board_prep', true)
        .eq('exam_kind', 'pyq_mock')
        .order('created_at', { ascending: false }) as any;

      const examIds = (exams || []).map((exam: any) => exam.id);
      const counts = new Map<string, number>();
      if (examIds.length) {
        const { data: questionRows } = await supabase.from('questions').select('exam_id').in('exam_id', examIds) as any;
        (questionRows || []).forEach((row: any) => counts.set(row.exam_id, (counts.get(row.exam_id) || 0) + 1));
      }

      const deduped = new Map<string, MockExam>();
      (exams || []).forEach((exam: any) => {
        const mock: MockExam = {
          id: exam.id,
          title: exam.title,
          pyq_year: exam.pyq_year,
          total_marks: exam.total_marks,
          duration_minutes: exam.duration_minutes,
          created_at: exam.created_at,
          subject_name: exam.chapter?.subject?.name || 'Subject pending',
          chapter_name: exam.chapter?.name || 'Chapter pending',
          question_count: counts.get(exam.id) || 0,
        };

        if (mock.question_count === 0) return;
        const key = `${mock.title}::${mock.pyq_year}::${mock.subject_name}`;
        const existing = deduped.get(key);

        if (!existing || mock.question_count > existing.question_count || (mock.question_count === existing.question_count && mock.created_at > existing.created_at)) {
          deduped.set(key, mock);
        }
      });

      setMocks(Array.from(deduped.values()).sort((a, b) => (b.pyq_year || 0) - (a.pyq_year || 0) || b.question_count - a.question_count));

      // Subjects + chapters that have PYQ questions (scoped to user's school via RLS)
      const { data: qs } = await supabase
        .from('questions')
        .select('chapter_id')
        .eq('source', 'pyq')
        .not('chapter_id', 'is', null) as any;
      const chapterIds = Array.from(new Set((qs || []).map((q: any) => q.chapter_id).filter(Boolean))) as string[];
      if (chapterIds.length) {
        const { data: chRows } = await supabase
          .from('chapters')
          .select('id, name, subject_id')
          .in('id', chapterIds)
          .order('name') as any;
        setChapters(chRows || []);
        const subjIds = Array.from(new Set((chRows || []).map((c: any) => c.subject_id))) as string[];
        if (subjIds.length) {
          const { data: sRows } = await supabase
            .from('subjects')
            .select('id, name')
            .in('id', subjIds)
            .order('name') as any;
          setSubjects(sRows || []);
        }
      } else {
        setChapters([]);
        setSubjects([]);
      }

      // Written / subjective questions
      const { data: wRows } = await (supabase as any)
        .from('written_questions')
        .select('id, question_text, marks, pyq_year, question_type, chapter_id, subject_id, chapter:chapters(name, subject:subjects(name))')
        .order('pyq_year', { ascending: false })
        .order('order_index', { ascending: true })
        .limit(2000);
      const enrichedWritten: WrittenQ[] = (wRows || []).map((w: any) => ({
        id: w.id,
        question_text: w.question_text,
        marks: w.marks,
        pyq_year: w.pyq_year,
        question_type: w.question_type,
        chapter_id: w.chapter_id,
        subject_id: w.subject_id,
        chapter_name: w.chapter?.name || 'Unmapped',
        subject_name: w.chapter?.subject?.name || 'General',
      }));
      setWritten(enrichedWritten);

      // Revision count
      if (user.role === 'student') {
        const { count } = await (supabase as any)
          .from('revision_items')
          .select('id', { count: 'exact', head: true })
          .eq('student_id', user.user_id);
        setRevisionCount(count || 0);
      }
      setLoading(false);
    })();
  }, [user, enabled, accessLoading]);

  const generateTest = async (mode: 'chapter' | 'mixed' | 'revision', opts: any = {}) => {
    setGenerating(mode + JSON.stringify(opts));
    try {
      const { data, error } = await supabase.functions.invoke('generate-board-prep-test', {
        body: { mode, num_questions: 20, duration_minutes: 30, ...opts },
      });
      if (error) throw error;
      if (data?.exam_id) {
        navigate(`/exams?take=${data.exam_id}`);
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate');
    } finally {
      setGenerating(null);
    }
  };

  if (accessLoading || loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!enabled) {
    return (
      <div className="max-w-2xl mx-auto mt-12 p-8 bg-card rounded-2xl border text-center">
        <GraduationCap className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold mb-2">Board Preparation Not Enabled</h2>
        <p className="text-muted-foreground">Ask your Super Admin to enable BSEB Board Preparation for your class in Settings.</p>
      </div>
    );
  }

  const subjectChapters = (sid: string) => chapters.filter(c => c.subject_id === sid);
  const writtenSubjects = Array.from(new Map(written.map(w => [w.subject_name || 'General', w.subject_name || 'General'])).keys()).sort();
  const writtenYears = Array.from(new Set(written.map(w => w.pyq_year).filter(Boolean) as number[])).sort((a, b) => b - a);
  const filteredWritten = written.filter(w =>
    (writtenSubject === 'all' || w.subject_name === writtenSubject) &&
    (writtenYear === 'all' || String(w.pyq_year) === writtenYear)
  );
  const writtenGroups = filteredWritten.reduce<Record<string, WrittenQ[]>>((acc, w) => {
    const key = `${w.subject_name} • ${w.chapter_name} • ${w.pyq_year || 'N/A'}`;
    (acc[key] ||= []).push(w);
    return acc;
  }, {});

  const sectionCards: SectionCard[] = [
    { key: 'full', title: 'Full Mock Tests (MCQ)', subtitle: 'Approved year-wise subject mocks', countLabel: `${mocks.length} ready` },
    { key: 'chapter', title: 'Chapter Mock Tests', subtitle: 'Subject-wise chapter practice', countLabel: `${chapters.length} chapters` },
    { key: 'written', title: 'Written / Subjective', subtitle: 'PYQ written questions by subject + chapter', countLabel: `${written.length} questions` },
    { key: 'revision', title: 'Revision Tests', subtitle: 'Focused student revision sets', countLabel: `${revisionCount} revision items` },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 p-6 text-white">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 text-white/80 text-sm mb-1"><GraduationCap className="w-4 h-4" /> BSEB Class 10</div>
            <h1 className="text-3xl font-bold">Board Preparation</h1>
              <p className="text-white/90 mt-1">100-question approved mocks, subject-wise chapter practice, and bilingual Hindi/English exams.</p>
          </div>
          {isStaff && (
            <div className="flex gap-2">
              <button onClick={() => navigate('/board-prep/upload')} className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl flex items-center gap-2 font-medium">
                <Upload className="w-4 h-4" /> Upload PYQ PDF
              </button>
              <button onClick={() => navigate('/settings')} className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl flex items-center gap-2 font-medium">
                <SettingsIcon className="w-4 h-4" /> Settings
              </button>
            </div>
          )}
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {sectionCards.map((card) => {
          const isActive = activeSection === card.key;
          return (
            <button
              key={card.key}
              onClick={() => setActiveSection(card.key)}
              className={`text-left rounded-2xl border p-5 transition-all ${isActive ? 'border-primary bg-primary/5 shadow-lg' : 'border-border bg-card hover:border-primary/40'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">{card.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{card.subtitle}</p>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{card.countLabel}</span>
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm font-medium text-primary">
                Open <ChevronRight className="h-4 w-4" />
              </div>
            </button>
          );
        })}
      </section>

      {/* Year-wise Full Mocks */}
      <section className={activeSection === 'full' ? 'block' : 'hidden'}>
        <h2 className="text-xl font-bold mb-3 flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-500" /> Full Mock Tests (Year-wise)</h2>
        {mocks.length === 0 ? (
          <p className="text-muted-foreground bg-muted/40 p-6 rounded-xl text-center">No PYQ mock tests yet. {isStaff && 'Upload a PYQ PDF to begin.'}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mocks.map(m => (
              <div key={m.id} className="relative">
                <button onClick={() => navigate(`/exams?take=${m.id}`)}
                  className="w-full text-left p-5 rounded-2xl bg-card border hover:border-primary hover:shadow-lg transition-all">
                  <div className="flex items-center gap-2 text-amber-600 font-bold mb-1"><Calendar className="w-4 h-4" /> Year {m.pyq_year || 'N/A'}</div>
                  <p className="text-xs font-medium text-primary mb-1">{m.subject_name}</p>
                  <h3 className="font-bold pr-7">{m.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{m.chapter_name}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{m.total_marks} marks</span>
                    <span>·</span>
                    <span>{m.duration_minutes} min</span>
                    <span>·</span>
                    <span>{m.question_count} questions</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1"><Languages className="h-3.5 w-3.5" /> Hindi + English</span>
                  </div>
                </button>
                {canRename && (
                  <button onClick={(e) => { e.stopPropagation(); renameExam(m); }}
                    className="absolute top-3 right-3 p-1.5 rounded-lg bg-muted hover:bg-primary hover:text-primary-foreground transition-colors"
                    title="Rename test">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Chapter Practice */}
      <section className={activeSection === 'chapter' ? 'block' : 'hidden'}>
        <h2 className="text-xl font-bold mb-3 flex items-center gap-2"><BookOpen className="w-5 h-5 text-blue-500" /> Chapter Practice (Combined Years)</h2>
        {subjects.length === 0 ? (
          <p className="text-muted-foreground bg-muted/40 p-6 rounded-xl text-center">No chapters with PYQs yet.</p>
        ) : (
          <div className="space-y-3">
            {subjects.map(s => (
              <details key={s.id} className="bg-card border rounded-xl p-4">
                <summary className="font-semibold cursor-pointer">{s.name} <span className="text-xs text-muted-foreground">({subjectChapters(s.id).length} chapters)</span></summary>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {subjectChapters(s.id).map(c => (
                    <div key={c.id} className="relative">
                      <button disabled={generating !== null}
                        onClick={() => generateTest('chapter', { chapter_id: c.id })}
                        className="w-full text-left text-sm p-3 rounded-lg bg-muted/40 hover:bg-primary/10 hover:text-primary transition-all disabled:opacity-50">
                        <span className="block font-medium pr-6">{c.name}</span>
                        <span className="text-xs text-muted-foreground">{s.name}</span>
                      </button>
                      {canRename && (
                        <button onClick={(e) => { e.stopPropagation(); renameChapter(c); }}
                          className="absolute top-2 right-2 p-1 rounded-md bg-background/80 hover:bg-primary hover:text-primary-foreground transition-colors"
                          title="Rename chapter">
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      {/* Mixed + Revision */}
      <section className={activeSection === 'revision' ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : 'hidden'}>
        <button onClick={() => generateTest('mixed')} disabled={generating !== null}
          className="p-6 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white text-left hover:shadow-xl transition-all disabled:opacity-50">
          <Target className="w-8 h-8 mb-2" />
          <h3 className="font-bold text-lg">Full Revision Mock</h3>
          <p className="text-sm text-white/90 mt-1">Approved mixed PYQs with subject-balanced revision practice.</p>
        </button>
        {user?.role === 'student' && (
          <button onClick={() => generateTest('revision')} disabled={generating !== null || revisionCount === 0}
            className="p-6 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 text-white text-left hover:shadow-xl transition-all disabled:opacity-50">
            <Brain className="w-8 h-8 mb-2" />
            <h3 className="font-bold text-lg">Smart Revision Test</h3>
            <p className="text-sm text-white/90 mt-1">{revisionCount > 0 ? `${revisionCount} questions in your revision plan.` : 'Take exams to build your revision list.'}</p>
          </button>
        )}
      </section>
    </div>
  );
};

export default BoardPrepPage;
