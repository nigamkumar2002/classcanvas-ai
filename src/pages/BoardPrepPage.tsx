import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { GraduationCap, Trophy, BookOpen, Brain, Target, Calendar, Loader2, Upload, Settings as SettingsIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useBoardPrepAccess } from '@/hooks/useBoardPrepAccess';

interface MockExam { id: string; title: string; pyq_year: number | null; total_marks: number; duration_minutes: number; }
interface ChapterRow { id: string; name: string; subject_id: string; }
interface SubjectRow { id: string; name: string; }

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

  const isStaff = user && ['developer', 'super_admin', 'admin'].includes(user.role);

  useEffect(() => {
    if (!user || accessLoading) return;
    if (!enabled) { setLoading(false); return; }
    (async () => {
      // Year-wise mock exams (board_prep)
      const { data: exams } = await supabase
        .from('exams')
        .select('id, title, pyq_year, total_marks, duration_minutes')
        .eq('is_board_prep', true)
        .eq('exam_kind', 'pyq_mock')
        .order('pyq_year', { ascending: false }) as any;
      setMocks(exams || []);

      // Subjects + chapters that have PYQ questions
      const { data: qs } = await supabase
        .from('questions')
        .select('chapter_id')
        .eq('source', 'pyq') as any;
      const chapterIds = Array.from(new Set((qs || []).map((q: any) => q.chapter_id).filter(Boolean))) as string[];
      if (chapterIds.length) {
        const { data: chRows } = await supabase.from('chapters').select('id, name, subject_id').in('id', chapterIds) as any;
        setChapters(chRows || []);
        const subjIds = Array.from(new Set((chRows || []).map((c: any) => c.subject_id))) as string[];
        if (subjIds.length) {
          const { data: sRows } = await supabase.from('subjects').select('id, name').in('id', subjIds) as any;
          setSubjects(sRows || []);
        }
      }

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

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 p-6 text-white">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 text-white/80 text-sm mb-1"><GraduationCap className="w-4 h-4" /> BSEB Class 10</div>
            <h1 className="text-3xl font-bold">Board Preparation</h1>
            <p className="text-white/90 mt-1">100-question mock tests, chapter-wise practice, and smart revision.</p>
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

      {/* Year-wise Full Mocks */}
      <section>
        <h2 className="text-xl font-bold mb-3 flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-500" /> Full Mock Tests (Year-wise)</h2>
        {mocks.length === 0 ? (
          <p className="text-muted-foreground bg-muted/40 p-6 rounded-xl text-center">No PYQ mock tests yet. {isStaff && 'Upload a PYQ PDF to begin.'}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mocks.map(m => (
              <button key={m.id} onClick={() => navigate(`/exams?take=${m.id}`)}
                className="text-left p-5 rounded-2xl bg-card border hover:border-primary hover:shadow-lg transition-all">
                <div className="flex items-center gap-2 text-amber-600 font-bold mb-1"><Calendar className="w-4 h-4" /> Year {m.pyq_year || 'N/A'}</div>
                <h3 className="font-bold">{m.title}</h3>
                <p className="text-xs text-muted-foreground mt-1">{m.total_marks} marks · {m.duration_minutes} min</p>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Chapter Practice */}
      <section>
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
                    <button key={c.id} disabled={generating !== null}
                      onClick={() => generateTest('chapter', { chapter_id: c.id })}
                      className="text-left text-sm p-3 rounded-lg bg-muted/40 hover:bg-primary/10 hover:text-primary transition-all disabled:opacity-50">
                      {c.name}
                    </button>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      {/* Mixed + Revision */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button onClick={() => generateTest('mixed')} disabled={generating !== null}
          className="p-6 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white text-left hover:shadow-xl transition-all disabled:opacity-50">
          <Target className="w-8 h-8 mb-2" />
          <h3 className="font-bold text-lg">Mixed Practice</h3>
          <p className="text-sm text-white/90 mt-1">20 random PYQs across all years and chapters.</p>
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
