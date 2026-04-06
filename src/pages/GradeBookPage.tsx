import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { BookOpen, Plus, Award, TrendingUp } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Grade {
  id: string; student_id: string; subject_id: string; class_id: string;
  exam_type: string; marks_obtained: number; total_marks: number;
  grade_letter: string | null; remarks: string | null; created_at: string;
  student_name?: string; subject_name?: string;
}

const GRADE_LETTERS = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F'];

const GradeBookPage = () => {
  const { user } = useAuth();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [students, setStudents] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [form, setForm] = useState({ student_id: '', subject_id: '', class_id: '', exam_type: 'exam', marks_obtained: '', total_marks: '100', grade_letter: '', remarks: '' });

  const isStudent = user?.role === 'student';
  const canManage = !isStudent;

  const fetchGrades = async () => {
    const { data } = await supabase.from('grades').select('*').order('created_at', { ascending: false });
    const userIds = [...new Set((data || []).map(g => g.student_id))];
    const subIds = [...new Set((data || []).map(g => g.subject_id))];

    let pMap: Record<string, string> = {}, sMap: Record<string, string> = {};
    if (userIds.length) {
      const { data: profiles } = await supabase.from('profiles').select('user_id, full_name').in('user_id', userIds);
      profiles?.forEach(p => { pMap[p.user_id] = p.full_name; });
    }
    if (subIds.length) {
      const { data: subs } = await supabase.from('subjects').select('id, name').in('id', subIds);
      subs?.forEach(s => { sMap[s.id] = s.name; });
    }

    setGrades((data || []).map(g => ({ ...g, student_name: pMap[g.student_id] || 'Unknown', subject_name: sMap[g.subject_id] || 'Unknown' })));
    setLoading(false);
  };

  useEffect(() => {
    fetchGrades();
    if (canManage) {
      Promise.all([
        supabase.from('profiles').select('user_id, full_name').eq('role', 'student'),
        supabase.from('subjects').select('id, name'),
        supabase.from('classes').select('id, name'),
      ]).then(([s, sub, cls]) => {
        setStudents(s.data || []);
        setSubjects(sub.data || []);
        setClasses(cls.data || []);
      });
    }
  }, []);

  const handleAdd = async () => {
    if (!form.student_id || !form.subject_id || !form.class_id) { toast({ title: 'Please fill required fields', variant: 'destructive' }); return; }
    const { error } = await supabase.from('grades').insert({
      student_id: form.student_id, subject_id: form.subject_id, class_id: form.class_id,
      exam_type: form.exam_type, marks_obtained: parseFloat(form.marks_obtained) || 0,
      total_marks: parseFloat(form.total_marks) || 100, grade_letter: form.grade_letter || null,
      remarks: form.remarks || null, graded_by: user!.id, school_id: user!.school_id,
    });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Grade added successfully' });
    setShowAdd(false);
    setForm({ student_id: '', subject_id: '', class_id: '', exam_type: 'exam', marks_obtained: '', total_marks: '100', grade_letter: '', remarks: '' });
    fetchGrades();
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  const avg = grades.length > 0 ? (grades.reduce((s, g) => s + (g.marks_obtained / g.total_marks * 100), 0) / grades.length).toFixed(1) : '0';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Grade Book</h1>
          <p className="text-muted-foreground text-sm mt-1">{isStudent ? 'View your grades and performance' : 'Manage student grades'}</p>
        </div>
        {canManage && (
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90">
            <Plus className="w-4 h-4" /> Add Grade
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="stat-card"><Award className="w-8 h-8 text-primary mb-2" /><p className="text-2xl font-bold">{grades.length}</p><p className="text-sm text-muted-foreground">Total Grades</p></div>
        <div className="stat-card"><TrendingUp className="w-8 h-8 text-green-500 mb-2" /><p className="text-2xl font-bold">{avg}%</p><p className="text-sm text-muted-foreground">Average Score</p></div>
        <div className="stat-card"><BookOpen className="w-8 h-8 text-blue-500 mb-2" /><p className="text-2xl font-bold">{new Set(grades.map(g => g.subject_id)).size}</p><p className="text-sm text-muted-foreground">Subjects</p></div>
      </div>

      {grades.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-border">
          <BookOpen className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">No grades recorded yet</p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/30 border-b border-border">
                {!isStudent && <th className="text-left p-3 font-semibold">Student</th>}
                <th className="text-left p-3 font-semibold">Subject</th>
                <th className="text-left p-3 font-semibold">Type</th>
                <th className="text-center p-3 font-semibold">Marks</th>
                <th className="text-center p-3 font-semibold">Grade</th>
                <th className="text-left p-3 font-semibold">Date</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {grades.map(g => {
                  const pct = (g.marks_obtained / g.total_marks * 100).toFixed(0);
                  return (
                    <tr key={g.id} className="hover:bg-muted/20">
                      {!isStudent && <td className="p-3 font-medium">{g.student_name}</td>}
                      <td className="p-3">{g.subject_name}</td>
                      <td className="p-3 capitalize">{g.exam_type}</td>
                      <td className="p-3 text-center">{g.marks_obtained}/{g.total_marks} ({pct}%)</td>
                      <td className="p-3 text-center"><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">{g.grade_letter || '-'}</span></td>
                      <td className="p-3 text-muted-foreground">{new Date(g.created_at).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAdd(false)}>
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md mx-4 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold">Add Grade</h2>
            <select value={form.student_id} onChange={e => setForm(f => ({ ...f, student_id: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm">
              <option value="">Select Student</option>
              {students.map(s => <option key={s.user_id} value={s.user_id}>{s.full_name}</option>)}
            </select>
            <select value={form.class_id} onChange={e => setForm(f => ({ ...f, class_id: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm">
              <option value="">Select Class</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={form.subject_id} onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm">
              <option value="">Select Subject</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={form.exam_type} onChange={e => setForm(f => ({ ...f, exam_type: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm">
              <option value="exam">Exam</option><option value="quiz">Quiz</option><option value="midterm">Midterm</option><option value="final">Final</option><option value="assignment">Assignment</option>
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input type="number" placeholder="Marks Obtained" value={form.marks_obtained} onChange={e => setForm(f => ({ ...f, marks_obtained: e.target.value }))} className="px-3 py-2 rounded-xl border border-border bg-background text-sm" />
              <input type="number" placeholder="Total Marks" value={form.total_marks} onChange={e => setForm(f => ({ ...f, total_marks: e.target.value }))} className="px-3 py-2 rounded-xl border border-border bg-background text-sm" />
            </div>
            <select value={form.grade_letter} onChange={e => setForm(f => ({ ...f, grade_letter: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm">
              <option value="">Grade Letter</option>
              {GRADE_LETTERS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <textarea placeholder="Remarks (optional)" value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm resize-none" rows={2} />
            <div className="flex gap-2">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2 border border-border rounded-xl text-sm">Cancel</button>
              <button onClick={handleAdd} className="flex-1 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">Save Grade</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GradeBookPage;
