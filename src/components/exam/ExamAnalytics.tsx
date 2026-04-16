import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { BarChart3, TrendingUp, Target, Users, Award, AlertTriangle, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import type { ExamData } from '@/pages/ExamPage';

interface ExamResultRow {
  id: string; exam_id: string; student_id: string; score: number;
  total_marks: number; completed_at: string; answers: any;
}

interface ProfileRow {
  user_id: string; full_name: string; class_id: string | null;
  admission_no: string | null; roll_no: string | null;
}

interface Props { exams: ExamData[]; }

const ExamAnalytics: React.FC<Props> = ({ exams }) => {
  const { user } = useAuth();
  const [results, setResults] = useState<ExamResultRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExam, setSelectedExam] = useState<string>('all');

  const isStudent = user?.role === 'student';
  const canManage = !isStudent;

  const fetchData = useCallback(async () => {
    try {
      let rQuery = supabase.from('exam_results').select('*').order('completed_at', { ascending: false });
      if (isStudent) rQuery = rQuery.eq('student_id', user!.user_id);

      const [{ data: r }, { data: p }] = await Promise.all([
        rQuery,
        supabase.from('profiles').select('user_id, full_name, class_id, admission_no, roll_no'),
      ]);
      setResults(r || []);
      setProfiles(p || []);
    } finally { setLoading(false); }
  }, [user, isStudent]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getProfile = (uid: string) => profiles.find(p => p.user_id === uid);

  const filteredResults = selectedExam === 'all' ? results : results.filter(r => r.exam_id === selectedExam);
  const getExamTitle = (eid: string) => exams.find(e => e.id === eid)?.title || 'Unknown Exam';

  // ─── Student view ───
  if (isStudent) {
    const myResults = filteredResults;
    const avgScore = myResults.length ? Math.round(myResults.reduce((a, r) => a + (r.score / r.total_marks) * 100, 0) / myResults.length) : 0;
    const bestScore = myResults.length ? Math.max(...myResults.map(r => Math.round((r.score / r.total_marks) * 100))) : 0;
    const totalExams = myResults.length;
    const passed = myResults.filter(r => {
      const exam = exams.find(e => e.id === r.exam_id);
      return exam && r.score >= exam.pass_marks;
    }).length;

    // Class ranking for each exam
    const getRankInfo = (examId: string) => {
      const examResults = results.filter(r => r.exam_id === examId);
      const sorted = [...examResults].sort((a, b) => b.score - a.score);
      const myIdx = sorted.findIndex(r => r.student_id === user!.user_id);
      return { rank: myIdx + 1, total: sorted.length };
    };

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">My Exam Analytics</h2>
          <select value={selectedExam} onChange={e => setSelectedExam(e.target.value)}
            className="px-3 py-2 rounded-xl border border-border bg-background text-sm">
            <option value="all">All Exams</option>
            {exams.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Exams Taken', value: totalExams, icon: BarChart3, color: 'bg-blue-500' },
            { label: 'Average Score', value: `${avgScore}%`, icon: TrendingUp, color: 'bg-green-500' },
            { label: 'Best Score', value: `${bestScore}%`, icon: Award, color: 'bg-purple-500' },
            { label: 'Passed', value: `${passed}/${totalExams}`, icon: Target, color: 'bg-emerald-500' },
          ].map(s => (
            <div key={s.label} className="bg-card rounded-2xl border border-border p-4">
              <div className={`w-10 h-10 rounded-xl ${s.color} flex items-center justify-center mb-3`}>
                <s.icon className="w-5 h-5 text-white" />
              </div>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Exam history */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <h3 className="font-semibold mb-4">Exam History</h3>
          {myResults.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">No exams taken yet</p>
          ) : (
            <div className="space-y-3">
              {myResults.map(r => {
                const exam = exams.find(e => e.id === r.exam_id);
                const pct = Math.round((r.score / r.total_marks) * 100);
                const passed = exam && r.score >= exam.pass_marks;
                const rankInfo = getRankInfo(r.exam_id);
                const trend = myResults.indexOf(r) < myResults.length - 1
                  ? pct > Math.round((myResults[myResults.indexOf(r) + 1].score / myResults[myResults.indexOf(r) + 1].total_marks) * 100) ? 'up' : pct < Math.round((myResults[myResults.indexOf(r) + 1].score / myResults[myResults.indexOf(r) + 1].total_marks) * 100) ? 'down' : 'same'
                  : 'same';

                return (
                  <div key={r.id} className="flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-muted/30 transition-colors">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm ${passed ? 'bg-green-500' : 'bg-red-500'}`}>
                      {pct}%
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{getExamTitle(r.exam_id)}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.score}/{r.total_marks} marks · {new Date(r.completed_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className={`px-2 py-1 rounded-full font-medium ${passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {passed ? 'Passed' : 'Failed'}
                      </span>
                      <span className="text-muted-foreground">Rank: {rankInfo.rank}/{rankInfo.total}</span>
                      {trend === 'up' && <ArrowUp className="w-4 h-4 text-green-500" />}
                      {trend === 'down' && <ArrowDown className="w-4 h-4 text-red-500" />}
                      {trend === 'same' && <Minus className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Performance breakdown per exam (question-wise) */}
        {myResults.length > 0 && selectedExam !== 'all' && (
          <div className="bg-card rounded-2xl border border-border p-5">
            <h3 className="font-semibold mb-4">Question-wise Breakdown</h3>
            <QuestionBreakdown examId={selectedExam} result={myResults.find(r => r.exam_id === selectedExam)} />
          </div>
        )}
      </div>
    );
  }

  // ─── Teacher/Admin view ───
  const uniqueStudents = [...new Set(filteredResults.map(r => r.student_id))];
  const avgScore = filteredResults.length ? Math.round(filteredResults.reduce((a, r) => a + (r.score / r.total_marks) * 100, 0) / filteredResults.length) : 0;
  const passRate = filteredResults.length ? Math.round(filteredResults.filter(r => {
    const exam = exams.find(e => e.id === r.exam_id);
    return exam && r.score >= exam.pass_marks;
  }).length / filteredResults.length * 100) : 0;

  // Per-student performance
  const studentPerformance = uniqueStudents.map(sid => {
    const sResults = filteredResults.filter(r => r.student_id === sid);
    const profile = getProfile(sid);
    const avg = Math.round(sResults.reduce((a, r) => a + (r.score / r.total_marks) * 100, 0) / sResults.length);
    const best = Math.max(...sResults.map(r => Math.round((r.score / r.total_marks) * 100)));
    const worst = Math.min(...sResults.map(r => Math.round((r.score / r.total_marks) * 100)));
    const examsTaken = sResults.length;
    const passed = sResults.filter(r => {
      const exam = exams.find(e => e.id === r.exam_id);
      return exam && r.score >= exam.pass_marks;
    }).length;
    return { sid, profile, avg, best, worst, examsTaken, passed };
  }).sort((a, b) => b.avg - a.avg);

  const weakStudents = studentPerformance.filter(s => s.avg < 40);
  const topStudents = studentPerformance.slice(0, 5);

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Exam Analytics</h2>
            <select value={selectedExam} onChange={e => setSelectedExam(e.target.value)}
              className="px-3 py-2 rounded-xl border border-border bg-background text-sm">
              <option value="all">All Exams</option>
              {exams.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </div>

          {/* Overview cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Attempts', value: filteredResults.length, icon: BarChart3, color: 'bg-blue-500' },
              { label: 'Avg Score', value: `${avgScore}%`, icon: TrendingUp, color: 'bg-green-500' },
              { label: 'Pass Rate', value: `${passRate}%`, icon: Target, color: 'bg-emerald-500' },
              { label: 'Students', value: uniqueStudents.length, icon: Users, color: 'bg-purple-500' },
            ].map(s => (
              <div key={s.label} className="bg-card rounded-2xl border border-border p-4">
                <div className={`w-10 h-10 rounded-xl ${s.color} flex items-center justify-center mb-3`}>
                  <s.icon className="w-5 h-5 text-white" />
                </div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Weak students alert */}
          {weakStudents.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <h3 className="font-semibold text-red-700 text-sm">Students Needing Attention ({weakStudents.length})</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {weakStudents.map(s => (
                  <span key={s.sid} className="px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                    {s.profile?.full_name || 'Unknown'} ({s.avg}%)
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Student leaderboard */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <h3 className="font-semibold mb-4">Student Performance Rankings</h3>
            {studentPerformance.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">No exam results yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-2 text-xs text-muted-foreground font-medium">Rank</th>
                      <th className="text-left py-3 px-2 text-xs text-muted-foreground font-medium">Student</th>
                      <th className="text-left py-3 px-2 text-xs text-muted-foreground font-medium">Adm No</th>
                      <th className="text-center py-3 px-2 text-xs text-muted-foreground font-medium">Exams</th>
                      <th className="text-center py-3 px-2 text-xs text-muted-foreground font-medium">Avg</th>
                      <th className="text-center py-3 px-2 text-xs text-muted-foreground font-medium">Best</th>
                      <th className="text-center py-3 px-2 text-xs text-muted-foreground font-medium">Passed</th>
                      <th className="text-center py-3 px-2 text-xs text-muted-foreground font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentPerformance.map((s, i) => (
                      <tr key={s.sid} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-3 px-2 font-bold text-primary">#{i + 1}</td>
                        <td className="py-3 px-2 font-medium">{s.profile?.full_name || 'Unknown'}</td>
                        <td className="py-3 px-2 text-muted-foreground">{s.profile?.admission_no || '-'}</td>
                        <td className="py-3 px-2 text-center">{s.examsTaken}</td>
                        <td className="py-3 px-2 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${s.avg >= 70 ? 'bg-green-100 text-green-700' : s.avg >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                            {s.avg}%
                          </span>
                        </td>
                        <td className="py-3 px-2 text-center text-green-600 font-medium">{s.best}%</td>
                        <td className="py-3 px-2 text-center">{s.passed}/{s.examsTaken}</td>
                        <td className="py-3 px-2 text-center">
                          {s.avg >= 70 ? <span className="text-green-600 text-xs font-medium">Excellent</span> :
                           s.avg >= 40 ? <span className="text-amber-600 text-xs font-medium">Average</span> :
                           <span className="text-red-600 text-xs font-medium">Weak</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Top performers */}
          {topStudents.length > 0 && (
            <div className="bg-card rounded-2xl border border-border p-5">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-500" /> Top Performers
              </h3>
              <div className="grid sm:grid-cols-5 gap-3">
                {topStudents.map((s, i) => (
                  <div key={s.sid} className="text-center p-3 rounded-xl border border-border bg-muted/20">
                    <div className={`w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center text-white font-bold text-sm ${
                      i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-orange-400' : 'bg-blue-400'
                    }`}>#{i + 1}</div>
                    <p className="font-semibold text-xs truncate">{s.profile?.full_name || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">{s.avg}% avg</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Question breakdown sub-component
const QuestionBreakdown: React.FC<{ examId: string; result?: ExamResultRow }> = ({ examId, result }) => {
  const [questions, setQuestions] = useState<any[]>([]);

  useEffect(() => {
    supabase.from('questions').select('*').eq('exam_id', examId).order('order_index')
      .then(({ data }) => setQuestions(data || []));
  }, [examId]);

  if (!result || !result.answers || questions.length === 0) {
    return <p className="text-muted-foreground text-sm">No detailed data available</p>;
  }

  const answersMap = typeof result.answers === 'object' ? result.answers as Record<string, string> : {};

  return (
    <div className="space-y-2">
      {questions.map((q, i) => {
        const userAns = answersMap[q.id];
        const isCorrect = userAns === q.correct_answer;
        return (
          <div key={q.id} className={`p-3 rounded-xl border text-sm ${isCorrect ? 'border-green-200 bg-green-50/50' : userAns ? 'border-red-200 bg-red-50/50' : 'border-border bg-muted/20'}`}>
            <div className="flex items-center justify-between">
              <span className="font-medium">Q{i + 1}: {q.question_text.substring(0, 80)}...</span>
              <span className={`text-xs font-bold ${isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                {isCorrect ? `✓ +${q.marks}` : userAns ? '✗ 0' : 'Skipped'}
              </span>
            </div>
            {!isCorrect && (
              <p className="text-xs text-muted-foreground mt-1">
                Your answer: {userAns || 'None'} · Correct: {q.correct_answer}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ExamAnalytics;
