import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Star, MessageSquare, Plus } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const FeedbackPage = () => {
  const { user } = useAuth();
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [form, setForm] = useState({ class_id: '', subject_id: '', rating: 5, comments: '', is_anonymous: false });

  const isStudent = user?.role === 'student';

  const fetchFeedback = async () => {
    const { data } = await supabase.from('feedback').select('*').order('created_at', { ascending: false });
    const sIds = [...new Set((data || []).filter(f => f.student_id).map(f => f.student_id))];
    let pMap: Record<string, string> = {};
    if (sIds.length) {
      const { data: p } = await supabase.from('profiles').select('user_id, full_name').in('user_id', sIds);
      p?.forEach(pr => { pMap[pr.user_id] = pr.full_name; });
    }
    setFeedbacks((data || []).map(f => ({ ...f, student_name: f.is_anonymous ? 'Anonymous' : (pMap[f.student_id] || 'Unknown') })));
    setLoading(false);
  };

  useEffect(() => {
    fetchFeedback();
    Promise.all([
      supabase.from('classes').select('id, name'),
      supabase.from('subjects').select('id, name'),
    ]).then(([c, s]) => { setClasses(c.data || []); setSubjects(s.data || []); });
  }, []);

  const handleSubmit = async () => {
    const { error } = await supabase.from('feedback').insert({
      student_id: user!.id, class_id: form.class_id || null,
      subject_id: form.subject_id || null, rating: form.rating,
      comments: form.comments || null, is_anonymous: form.is_anonymous,
      school_id: user!.school_id,
    });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Feedback submitted' });
    setShowAdd(false);
    setForm({ class_id: '', subject_id: '', rating: 5, comments: '', is_anonymous: false });
    fetchFeedback();
  };

  const avgRating = feedbacks.length > 0 ? (feedbacks.reduce((s, f) => s + f.rating, 0) / feedbacks.length).toFixed(1) : '0';

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Feedback</h1>
          <p className="text-muted-foreground text-sm mt-1">{isStudent ? 'Share your feedback' : 'View student feedback'}</p>
        </div>
        {isStudent && <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90"><Plus className="w-4 h-4" /> Give Feedback</button>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="stat-card"><Star className="w-8 h-8 text-amber-500 mb-2" /><p className="text-2xl font-bold">{avgRating}</p><p className="text-sm text-muted-foreground">Average Rating</p></div>
        <div className="stat-card"><MessageSquare className="w-8 h-8 text-primary mb-2" /><p className="text-2xl font-bold">{feedbacks.length}</p><p className="text-sm text-muted-foreground">Total Feedback</p></div>
      </div>

      {feedbacks.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-border">
          <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">No feedback yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {feedbacks.map(f => (
            <div key={f.id} className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm">{f.student_name}</span>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map(s => (
                    <Star key={s} className={`w-4 h-4 ${s <= f.rating ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/30'}`} />
                  ))}
                </div>
              </div>
              {f.comments && <p className="text-sm text-muted-foreground">{f.comments}</p>}
              <p className="text-xs text-muted-foreground mt-2">{new Date(f.created_at).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAdd(false)}>
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md mx-4 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold">Give Feedback</h2>
            <select value={form.class_id} onChange={e => setForm(f => ({ ...f, class_id: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm">
              <option value="">Select Class (optional)</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={form.subject_id} onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm">
              <option value="">Select Subject (optional)</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div>
              <label className="text-sm font-medium mb-2 block">Rating</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(s => (
                  <button key={s} onClick={() => setForm(f => ({ ...f, rating: s }))}>
                    <Star className={`w-8 h-8 transition-colors ${s <= form.rating ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/30 hover:text-amber-300'}`} />
                  </button>
                ))}
              </div>
            </div>
            <textarea placeholder="Your feedback..." value={form.comments} onChange={e => setForm(f => ({ ...f, comments: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm resize-none" rows={3} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_anonymous} onChange={e => setForm(f => ({ ...f, is_anonymous: e.target.checked }))} className="rounded" />
              Submit anonymously
            </label>
            <div className="flex gap-2">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2 border border-border rounded-xl text-sm">Cancel</button>
              <button onClick={handleSubmit} className="flex-1 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeedbackPage;
