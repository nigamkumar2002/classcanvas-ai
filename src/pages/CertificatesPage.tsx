import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Award, Plus, Download } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const CertificatesPage = () => {
  const { user } = useAuth();
  const [certificates, setCertificates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [students, setStudents] = useState<any[]>([]);
  const [form, setForm] = useState({ student_id: '', title: '', description: '', certificate_type: 'completion' });

  const isStudent = user?.role === 'student';
  const canIssue = !isStudent;

  const fetchCerts = async () => {
    const { data } = await supabase.from('certificates').select('*').order('issued_at', { ascending: false });
    const ids = [...new Set((data || []).map(c => c.student_id))];
    let pMap: Record<string, string> = {};
    if (ids.length) {
      const { data: p } = await supabase.from('profiles').select('user_id, full_name').in('user_id', ids);
      p?.forEach(pr => { pMap[pr.user_id] = pr.full_name; });
    }
    setCertificates((data || []).map(c => ({ ...c, student_name: pMap[c.student_id] || 'Unknown' })));
    setLoading(false);
  };

  useEffect(() => {
    fetchCerts();
    if (canIssue) supabase.from('profiles').select('user_id, full_name').eq('role', 'student').then(({ data }) => setStudents(data || []));
  }, []);

  const handleIssue = async () => {
    if (!form.student_id || !form.title) { toast({ title: 'Student and title required', variant: 'destructive' }); return; }
    const { error } = await supabase.from('certificates').insert({
      student_id: form.student_id, title: form.title,
      description: form.description || null, certificate_type: form.certificate_type,
      issued_by: user!.id, school_id: user!.school_id,
    });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Certificate issued' });
    setShowAdd(false);
    setForm({ student_id: '', title: '', description: '', certificate_type: 'completion' });
    fetchCerts();
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Certificates</h1>
          <p className="text-muted-foreground text-sm mt-1">{isStudent ? 'View your certificates' : 'Issue and manage certificates'}</p>
        </div>
        {canIssue && <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90"><Plus className="w-4 h-4" /> Issue Certificate</button>}
      </div>

      {certificates.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-border">
          <Award className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">No certificates issued yet</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {certificates.map(c => (
            <div key={c.id} className="bg-card rounded-2xl border border-border p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-primary/10 to-transparent rounded-bl-full" />
              <Award className="w-10 h-10 text-primary mb-3" />
              <h3 className="font-bold text-lg">{c.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{c.description || 'Certificate of ' + c.certificate_type}</p>
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-sm"><span className="text-muted-foreground">Awarded to:</span> <span className="font-medium">{c.student_name}</span></p>
                <p className="text-xs text-muted-foreground mt-1">Issued {new Date(c.issued_at).toLocaleDateString()}</p>
              </div>
              <span className="mt-2 inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary capitalize">{c.certificate_type}</span>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAdd(false)}>
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md mx-4 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold">Issue Certificate</h2>
            <select value={form.student_id} onChange={e => setForm(f => ({ ...f, student_id: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm">
              <option value="">Select Student</option>
              {students.map(s => <option key={s.user_id} value={s.user_id}>{s.full_name}</option>)}
            </select>
            <input type="text" placeholder="Certificate Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm" />
            <textarea placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm resize-none" rows={2} />
            <select value={form.certificate_type} onChange={e => setForm(f => ({ ...f, certificate_type: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm">
              <option value="completion">Completion</option><option value="excellence">Excellence</option><option value="participation">Participation</option><option value="achievement">Achievement</option>
            </select>
            <div className="flex gap-2">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2 border border-border rounded-xl text-sm">Cancel</button>
              <button onClick={handleIssue} className="flex-1 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">Issue</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CertificatesPage;
