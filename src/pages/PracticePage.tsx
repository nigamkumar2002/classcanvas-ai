import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Brain, Sparkles, Clock, Trophy, RefreshCw, ChevronRight, X, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface PracticeTest {
  id: string; subject_id: string | null; chapter_id: string | null; topic: string | null;
  num_questions: number; duration_minutes: number; generated_at: string;
  started_at: string | null; completed_at: string | null; score: number | null; total_marks: number | null;
}

interface Subject { id: string; name: string; class_id: string; }
interface Chapter { id: string; name: string; subject_id: string; }

const PracticePage: React.FC = () => {
  const { user } = useAuth();
  const [tests, setTests] = useState<PracticeTest[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [quota, setQuota] = useState<{ used: number; max: number; resetAt: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showGen, setShowGen] = useState(false);
  const [activeTest, setActiveTest] = useState<string | null>(null);

  const load = async () => {
    if (!user?.user_id || !user?.class_id) { setLoading(false); return; }
    setLoading(true);
    const [testsR, subsR, quotaR, settingR] = await Promise.all([
      supabase.from('practice_tests').select('*').eq('student_id', user.user_id).order('generated_at', { ascending: false }).limit(50),
      supabase.from('subjects').select('id, name, class_id').eq('class_id', user.class_id),
      supabase.from('practice_quotas').select('*').eq('student_id', user.user_id).maybeSingle(),
      supabase.from('school_settings').select('value').eq('school_id', user.school_id!).eq('key', 'practice_test_max_questions').maybeSingle(),
    ]);
    setTests((testsR.data || []) as any);
    setSubjects((subsR.data || []) as any);
    if (subsR.data?.length) {
      const { data: chR } = await supabase.from('chapters').select('id, name, subject_id').in('subject_id', subsR.data.map((s: any) => s.id));
      setChapters((chR || []) as any);
    }
    const max = parseInt(String(settingR.data?.value ?? '50')) || 50;
    if (quotaR.data) {
      const resetAt = new Date(new Date(quotaR.data.quota_start_date).getTime() + 7 * 86400000).toISOString();
      const expired = Date.now() > new Date(resetAt).getTime();
      setQuota({ used: expired ? 0 : quotaR.data.questions_used, max, resetAt });
    } else {
      setQuota({ used: 0, max, resetAt: '' });
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.user_id]);

  if (loading) return <div className="text-center py-16 text-muted-foreground">Loading...</div>;

  if (activeTest) return <TakePractice testId={activeTest} onDone={() => { setActiveTest(null); load(); }} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Brain className="w-8 h-8 text-violet-500" /> AI Practice Tests
          </h1>
          <p className="text-muted-foreground mt-1">Generate practice questions instantly. Self-paced, no teacher approval needed.</p>
        </div>
        <button onClick={() => setShowGen(true)} disabled={(quota?.used ?? 0) >= (quota?.max ?? 0)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white hover:opacity-90 font-semibold shadow-lg disabled:opacity-50">
          <Sparkles className="w-4 h-4" /> Generate Practice Test
        </button>
      </div>

      {/* Quota card */}
      {quota && (
        <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl p-5 text-white shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm opacity-90">Weekly Quota</p>
              <p className="text-2xl font-bold">{quota.used} / {quota.max} questions used</p>
            </div>
            <RefreshCw className="w-8 h-8 opacity-80" />
          </div>
          <div className="w-full bg-white/20 rounded-full h-2 mb-2">
            <div className="bg-white h-2 rounded-full transition-all" style={{ width: `${Math.min(100, (quota.used / quota.max) * 100)}%` }} />
          </div>
          <p className="text-xs opacity-90">{quota.resetAt ? `Resets ${format(new Date(quota.resetAt), 'MMM d, yyyy')}` : 'Quota starts on your first generation'}</p>
        </div>
      )}

      {/* History */}
      <div>
        <h2 className="text-lg font-bold mb-3">Your Practice History</h2>
        {tests.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-2xl border border-border">
            <Brain className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No practice tests yet. Generate your first one!</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {tests.map(t => {
              const subj = subjects.find(s => s.id === t.subject_id)?.name;
              const chap = chapters.find(c => c.id === t.chapter_id)?.name;
              return (
                <div key={t.id} className="bg-card rounded-xl border border-border p-4 hover:shadow-md transition">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{t.topic || chap || subj || 'Practice Test'}</h3>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
                        <span>{t.num_questions} questions</span>
                        <span>{t.duration_minutes} min</span>
                        <span>{format(new Date(t.generated_at), 'MMM d, h:mm a')}</span>
                      </div>
                    </div>
                    {t.completed_at ? (
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-2xl font-bold text-emerald-500">{t.score}/{t.total_marks}</p>
                          <p className="text-xs text-muted-foreground">{Math.round((t.score! / (t.total_marks || 1)) * 100)}%</p>
                        </div>
                        <button onClick={() => setActiveTest(t.id)} className="p-2 rounded-lg hover:bg-muted"><ChevronRight className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <button onClick={() => setActiveTest(t.id)} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
                        {t.started_at ? 'Resume' : 'Start'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showGen && quota && <GenerateModal subjects={subjects} chapters={chapters} maxAvail={quota.max - quota.used}
        onClose={() => setShowGen(false)} onGenerated={(id) => { setShowGen(false); load(); setActiveTest(id); }} />}
    </div>
  );
};

const GenerateModal: React.FC<{ subjects: Subject[]; chapters: Chapter[]; maxAvail: number; onClose: () => void; onGenerated: (id: string) => void }> = ({ subjects, chapters, maxAvail, onClose, onGenerated }) => {
  const [subjectId, setSubjectId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(Math.min(10, maxAvail));
  const [duration, setDuration] = useState(15);
  const [loading, setLoading] = useState(false);

  const filteredChapters = chapters.filter(c => !subjectId || c.subject_id === subjectId);

  const generate = async () => {
    if (count < 1) { toast({ title: 'Need at least 1 question', variant: 'destructive' }); return; }
    if (count > maxAvail) { toast({ title: `Quota: only ${maxAvail} questions available`, variant: 'destructive' }); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-practice-test', {
        body: { subject_id: subjectId || null, chapter_id: chapterId || null, topic: topic || null, num_questions: count, duration_minutes: duration },
      });
      if (error || (data as any)?.error) {
        const errMsg = (data as any)?.message || (data as any)?.error || error?.message || 'Failed';
        toast({ title: 'Generation failed', description: errMsg, variant: 'destructive' });
        return;
      }
      toast({ title: `Generated ${data.count} questions!` });
      onGenerated(data.test_id);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl max-w-md w-full">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-bold flex items-center gap-2"><Sparkles className="w-5 h-5 text-violet-500" /> Generate Practice</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Subject (optional)</label>
            <select value={subjectId} onChange={e => { setSubjectId(e.target.value); setChapterId(''); }} className="w-full mt-1 p-2 rounded-lg border border-border bg-background text-sm">
              <option value="">— Any —</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Chapter (optional)</label>
            <select value={chapterId} onChange={e => setChapterId(e.target.value)} className="w-full mt-1 p-2 rounded-lg border border-border bg-background text-sm">
              <option value="">— Any —</option>
              {filteredChapters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Or specify topic</label>
            <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Photosynthesis basics"
              className="w-full mt-1 p-2 rounded-lg border border-border bg-background text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Questions (max {maxAvail})</label>
              <input type="number" min={1} max={maxAvail} value={count} onChange={e => setCount(parseInt(e.target.value) || 1)}
                className="w-full mt-1 p-2 rounded-lg border border-border bg-background text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Duration (min)</label>
              <input type="number" min={5} max={120} value={duration} onChange={e => setDuration(parseInt(e.target.value) || 15)}
                className="w-full mt-1 p-2 rounded-lg border border-border bg-background text-sm" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border">Cancel</button>
          <button onClick={generate} disabled={loading || maxAvail < 1} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-purple-600 text-white disabled:opacity-50">
            {loading ? 'Generating...' : <><Sparkles className="w-4 h-4" /> Generate</>}
          </button>
        </div>
      </div>
    </div>
  );
};

const TakePractice: React.FC<{ testId: string; onDone: () => void }> = ({ testId, onDone }) => {
  const { user } = useAuth();
  const [test, setTest] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: t } = await supabase.from('practice_tests').select('*').eq('id', testId).single();
      const { data: qs } = await supabase.from('practice_questions').select('*').eq('practice_test_id', testId).order('order_index');
      setTest(t);
      setQuestions(qs || []);
      if (t?.completed_at) {
        setSubmitted(true);
        const a: Record<string, string> = {};
        (qs || []).forEach((q: any) => { if (q.student_answer) a[q.id] = q.student_answer; });
        setAnswers(a);
        setScore(t.score || 0);
      } else {
        if (!t?.started_at) {
          await supabase.from('practice_tests').update({ started_at: new Date().toISOString() }).eq('id', testId);
        }
        setTimeLeft((t?.duration_minutes || 15) * 60);
      }
    })();
  }, [testId]);

  useEffect(() => {
    if (submitted || timeLeft <= 0) return;
    const i = setInterval(() => setTimeLeft(s => s - 1), 1000);
    return () => clearInterval(i);
  }, [submitted, timeLeft]);

  useEffect(() => {
    if (!submitted && timeLeft === 0 && questions.length > 0 && test?.started_at) submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, submitted]);

  const submit = async () => {
    let s = 0;
    for (const q of questions) {
      const ans = answers[q.id];
      if (ans === q.correct_answer) s += q.marks || 1;
      await supabase.from('practice_questions').update({ student_answer: ans || null }).eq('id', q.id);
    }
    await supabase.from('practice_tests').update({
      completed_at: new Date().toISOString(), score: s, total_marks: questions.length,
    }).eq('id', testId);
    setScore(s);
    setSubmitted(true);
    toast({ title: `Score: ${s}/${questions.length}` });
  };

  if (!test) return <div className="text-center py-16 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{test.topic || 'Practice Test'}</h1>
          <p className="text-sm text-muted-foreground">{questions.length} questions · {test.duration_minutes} min</p>
        </div>
        {!submitted ? (
          <div className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-bold flex items-center gap-2">
            <Clock className="w-4 h-4" /> {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
          </div>
        ) : (
          <div className="px-4 py-2 rounded-xl bg-emerald-500 text-white font-bold flex items-center gap-2">
            <Trophy className="w-4 h-4" /> {score}/{questions.length} ({Math.round((score / questions.length) * 100)}%)
          </div>
        )}
      </div>

      {questions.map((q, i) => (
        <div key={q.id} className="bg-card rounded-2xl border border-border p-5">
          <p className="font-semibold mb-3">Q{i + 1}. {q.question_text}</p>
          <div className="space-y-2">
            {(['a', 'b', 'c', 'd'] as const).map(opt => {
              const selected = answers[q.id] === opt;
              const isCorrect = submitted && opt === q.correct_answer;
              const isWrong = submitted && selected && opt !== q.correct_answer;
              return (
                <label key={opt} className={cn(
                  "flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition",
                  selected && !submitted && "border-primary bg-primary/5",
                  isCorrect && "border-emerald-500 bg-emerald-50",
                  isWrong && "border-red-500 bg-red-50",
                  !selected && !isCorrect && "border-border hover:bg-muted/50"
                )}>
                  <input type="radio" name={q.id} disabled={submitted}
                    checked={selected} onChange={() => setAnswers(a => ({ ...a, [q.id]: opt }))}
                    className="w-4 h-4" />
                  <span className="font-medium">{opt.toUpperCase()}.</span>
                  <span className="flex-1">{q[`option_${opt}`]}</span>
                  {isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  {isWrong && <XCircle className="w-4 h-4 text-red-500" />}
                </label>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex justify-between gap-3">
        <button onClick={onDone} className="px-5 py-2.5 rounded-xl border border-border">Back to History</button>
        {!submitted && (
          <button onClick={submit} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold">Submit Practice</button>
        )}
      </div>
    </div>
  );
};

export default PracticePage;
