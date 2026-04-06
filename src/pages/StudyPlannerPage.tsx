import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { BookOpen, Plus, Check, Calendar, Clock, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const StudyPlannerPage = () => {
  const { user } = useAuth();
  const [plans, setPlans] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: '', subject_id: '', planned_date: new Date().toISOString().split('T')[0], duration_minutes: '60', notes: '' });

  const fetchPlans = async () => {
    const { data } = await supabase.from('study_plans').select('*').order('planned_date');
    const subIds = [...new Set((data || []).filter(p => p.subject_id).map(p => p.subject_id))];
    let sMap: Record<string, string> = {};
    if (subIds.length) {
      const { data: subs } = await supabase.from('subjects').select('id, name').in('id', subIds);
      subs?.forEach(s => { sMap[s.id] = s.name; });
    }
    setPlans((data || []).map(p => ({ ...p, subject_name: sMap[p.subject_id] || null })));
    setLoading(false);
  };

  useEffect(() => {
    fetchPlans();
    supabase.from('subjects').select('id, name').then(({ data }) => setSubjects(data || []));
  }, []);

  const handleAdd = async () => {
    if (!form.title) { toast({ title: 'Title required', variant: 'destructive' }); return; }
    const { error } = await supabase.from('study_plans').insert({
      student_id: user!.id, title: form.title,
      subject_id: form.subject_id || null, planned_date: form.planned_date,
      duration_minutes: parseInt(form.duration_minutes) || 60,
      notes: form.notes || null, school_id: user!.school_id,
    });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Study plan added' });
    setShowAdd(false);
    setForm({ title: '', subject_id: '', planned_date: new Date().toISOString().split('T')[0], duration_minutes: '60', notes: '' });
    fetchPlans();
  };

  const toggleComplete = async (id: string, current: boolean) => {
    await supabase.from('study_plans').update({ is_completed: !current, updated_at: new Date().toISOString() }).eq('id', id);
    fetchPlans();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('study_plans').delete().eq('id', id);
    fetchPlans();
    toast({ title: 'Plan removed' });
  };

  const today = new Date().toISOString().split('T')[0];
  const todayPlans = plans.filter(p => p.planned_date === today);
  const upcomingPlans = plans.filter(p => p.planned_date > today);
  const completedPlans = plans.filter(p => p.is_completed);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  const renderPlan = (p: any) => (
    <div key={p.id} className={`flex items-center gap-3 p-4 rounded-xl border border-border transition-colors ${p.is_completed ? 'bg-muted/30 opacity-60' : 'bg-card'}`}>
      <button onClick={() => toggleComplete(p.id, p.is_completed)}
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${p.is_completed ? 'bg-primary border-primary' : 'border-border hover:border-primary'}`}>
        {p.is_completed && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`font-medium text-sm ${p.is_completed ? 'line-through' : ''}`}>{p.title}</p>
        <div className="flex items-center gap-3 mt-1">
          {p.subject_name && <span className="text-xs text-primary">{p.subject_name}</span>}
          <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> {p.duration_minutes}min</span>
        </div>
      </div>
      <button onClick={() => handleDelete(p.id)} className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Study Planner</h1>
          <p className="text-muted-foreground text-sm mt-1">Plan and track your study sessions</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90"><Plus className="w-4 h-4" /> Add Plan</button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card"><Calendar className="w-8 h-8 text-primary mb-2" /><p className="text-2xl font-bold">{todayPlans.length}</p><p className="text-sm text-muted-foreground">Today</p></div>
        <div className="stat-card"><BookOpen className="w-8 h-8 text-blue-500 mb-2" /><p className="text-2xl font-bold">{upcomingPlans.length}</p><p className="text-sm text-muted-foreground">Upcoming</p></div>
        <div className="stat-card"><Check className="w-8 h-8 text-green-500 mb-2" /><p className="text-2xl font-bold">{completedPlans.length}</p><p className="text-sm text-muted-foreground">Completed</p></div>
      </div>

      {todayPlans.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /> Today's Plan</h3>
          <div className="space-y-2">{todayPlans.map(renderPlan)}</div>
        </div>
      )}

      {upcomingPlans.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3">Upcoming</h3>
          <div className="space-y-2">{upcomingPlans.map(renderPlan)}</div>
        </div>
      )}

      {plans.length === 0 && (
        <div className="text-center py-16 bg-card rounded-2xl border border-border">
          <BookOpen className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">No study plans yet. Start planning!</p>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAdd(false)}>
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md mx-4 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold">Add Study Plan</h2>
            <input type="text" placeholder="What will you study?" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm" />
            <select value={form.subject_id} onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm">
              <option value="">Select Subject (optional)</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input type="date" value={form.planned_date} onChange={e => setForm(f => ({ ...f, planned_date: e.target.value }))} className="px-3 py-2 rounded-xl border border-border bg-background text-sm" />
              <input type="number" placeholder="Duration (min)" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))} className="px-3 py-2 rounded-xl border border-border bg-background text-sm" />
            </div>
            <textarea placeholder="Notes (optional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm resize-none" rows={2} />
            <div className="flex gap-2">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2 border border-border rounded-xl text-sm">Cancel</button>
              <button onClick={handleAdd} className="flex-1 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">Add Plan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudyPlannerPage;
