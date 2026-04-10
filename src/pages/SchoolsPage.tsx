import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { School, BookOpen, Users, GraduationCap, FileText, Plus, X, Trash2, AlertTriangle } from 'lucide-react';

interface SchoolItem {
  id: string; name: string; code: string; description?: string;
  address?: string; city?: string; state?: string; country?: string;
  phone?: string; email?: string; is_active: boolean; created_at: string;
}

const SchoolsPage = () => {
  const { user } = useAuth();
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', description: '', address: '', city: '', state: '', country: '', phone: '', email: '' });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [stats, setStats] = useState<Record<string, { teachers: number; students: number; classes: number }>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<SchoolItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState('');

  const isDeveloper = user?.role === 'developer';

  const fetchSchools = async () => {
    try {
      const { data } = await supabase.from('schools').select('*').order('created_at', { ascending: false });
      setSchools((data as SchoolItem[]) || []);
      if (data && data.length > 0) {
        const statsMap: Record<string, { teachers: number; students: number; classes: number }> = {};
        await Promise.all(data.map(async (school: any) => {
          const [{ count: tCount }, { count: sCount }, { count: cCount }] = await Promise.all([
            supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('school_id', school.id).eq('role', 'teacher'),
            supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('school_id', school.id).eq('role', 'student'),
            supabase.from('classes').select('*', { count: 'exact', head: true }).eq('school_id', school.id),
          ]);
          statsMap[school.id] = { teachers: tCount || 0, students: sCount || 0, classes: cCount || 0 };
        }));
        setStats(statsMap);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSchools(); }, []);

  const handleAddSchool = async () => {
    if (!form.name.trim()) { setAddError('School name is required'); return; }
    setAdding(true); setAddError('');
    try {
      const code = form.code.trim() || form.name.trim().toUpperCase().replace(/\s+/g, '-').slice(0, 10) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
      const { error } = await supabase.from('schools').insert({
        name: form.name.trim(), code, description: form.description || null,
        address: form.address || null, city: form.city || null, state: form.state || null,
        country: form.country || null, phone: form.phone || null, email: form.email || null,
        created_by: user?.user_id,
      } as any);
      if (error) throw error;
      setShowAdd(false);
      setForm({ name: '', code: '', description: '', address: '', city: '', state: '', country: '', phone: '', email: '' });
      fetchSchools();
    } catch (error: any) {
      setAddError(error.message || 'Failed to create school');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteSchool = async () => {
    if (!deleteConfirm || deleteTyped !== 'DELETE') return;
    setDeleting(true);
    try {
      const schoolId = deleteConfirm.id;
      // Delete in order: exam_results, questions, exams, materials, chapters, subjects, classes, 
      // content_approvals, attendance, grades, certificates, fee_records, feedback, 
      // study_plans, messages, notifications, announcements, schedules, audit_logs,
      // live_session_participants (via live_sessions), live_sessions, assignment_submissions, profiles, user_roles
      const tables = [
        'exam_results', 'questions', 'exams', 'materials', 'chapters', 'subjects', 'classes',
        'content_approvals', 'attendance', 'grades', 'certificates', 'fee_records', 'feedback',
        'study_plans', 'announcements', 'schedules', 'audit_logs', 'live_sessions', 'assignment_submissions',
      ];
      for (const table of tables) {
        await (supabase.from(table as any).delete() as any).eq('school_id', schoolId);
      }
      // Delete profiles and user_roles for this school's users
      const { data: schoolProfiles } = await supabase.from('profiles').select('user_id').eq('school_id', schoolId);
      if (schoolProfiles && schoolProfiles.length > 0) {
        const userIds = schoolProfiles.map(p => p.user_id);
        await supabase.from('user_roles').delete().in('user_id', userIds);
        await supabase.from('notifications').delete().in('user_id', userIds);
        await supabase.from('messages').delete().in('sender_id', userIds);
        await supabase.from('profiles').delete().eq('school_id', schoolId);
      }
      // Finally delete the school
      await supabase.from('schools').delete().eq('id', schoolId);
      setDeleteConfirm(null);
      setDeleteTyped('');
      fetchSchools();
    } catch (err: any) {
      console.error('Delete error:', err);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Schools Management</h1>
          <p className="text-muted-foreground text-sm mt-1">{schools.length} registered schools</p>
        </div>
        {isDeveloper && (
          <button onClick={() => { setShowAdd(true); setAddError(''); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:opacity-90 transition-all">
            <Plus className="w-4 h-4" /> Add School
          </button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {schools.map(school => {
          const s = stats[school.id] || { teachers: 0, students: 0, classes: 0 };
          return (
            <div key={school.id} className="bg-card rounded-2xl border border-border shadow-card p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <School className="w-6 h-6 text-primary" />
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${school.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {school.is_active ? 'Active' : 'Inactive'}
                  </span>
                  {isDeveloper && (
                    <button onClick={() => { setDeleteConfirm(school); setDeleteTyped(''); }}
                      className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors" title="Delete School">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <h3 className="font-bold text-sm mb-1">{school.name}</h3>
              <p className="text-xs text-muted-foreground mb-1">Code: <span className="font-mono font-medium text-foreground">{school.code}</span></p>
              {school.city && <p className="text-xs text-muted-foreground">{school.city}{school.state ? `, ${school.state}` : ''}</p>}
              <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-border">
                <div className="text-center">
                  <p className="text-lg font-bold">{s.classes}</p>
                  <p className="text-[10px] text-muted-foreground">Classes</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold">{s.teachers}</p>
                  <p className="text-[10px] text-muted-foreground">Teachers</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold">{s.students}</p>
                  <p className="text-[10px] text-muted-foreground">Students</p>
                </div>
              </div>
            </div>
          );
        })}
        {schools.length === 0 && (
          <div className="col-span-full bg-card rounded-2xl border border-border shadow-card p-12 text-center">
            <School className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-muted-foreground">No schools registered yet</p>
          </div>
        )}
      </div>

      {/* Add School Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-card">
              <h2 className="text-lg font-bold">Register New School</h2>
              <button onClick={() => setShowAdd(false)} className="p-2 rounded-xl hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {addError && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{addError}</div>}
              <div>
                <label className="text-sm font-semibold mb-1.5 block">School Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Springfield High School"
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1.5 block">School Code (auto-generated if empty)</label>
                <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="e.g. SPR-HIGH-2024"
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm font-mono" />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description..." rows={2}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold mb-1.5 block">City</label>
                  <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="City"
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-semibold mb-1.5 block">State</label>
                  <input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} placeholder="State"
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="school@example.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Phone</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 XXXXXXXXXX"
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-border">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl border border-border font-medium text-sm hover:bg-muted">Cancel</button>
              <button onClick={handleAddSchool} disabled={adding}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                {adding ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <Plus className="w-4 h-4" />}
                {adding ? 'Creating...' : 'Register School'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-md">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-destructive" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-destructive">Delete School</h2>
                  <p className="text-sm text-muted-foreground">{deleteConfirm.name}</p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/20 text-sm space-y-2">
                <p className="font-semibold text-destructive">⚠️ This action is irreversible!</p>
                <p className="text-muted-foreground">The following data will be permanently deleted:</p>
                <ul className="text-xs text-muted-foreground list-disc ml-4 space-y-1">
                  <li>All classes, subjects, chapters, and materials</li>
                  <li>All exams, questions, and exam results</li>
                  <li>All school admin, teacher, and student accounts</li>
                  <li>All attendance, grades, certificates, and fee records</li>
                  <li>All messages, notifications, and announcements</li>
                  <li>All content approvals and audit logs</li>
                </ul>
              </div>

              <div>
                <label className="text-sm font-semibold mb-1.5 block">Type <span className="font-mono text-destructive">DELETE</span> to confirm</label>
                <input value={deleteTyped} onChange={e => setDeleteTyped(e.target.value)} placeholder="Type DELETE"
                  className="w-full px-4 py-2.5 rounded-xl border border-destructive/30 bg-background focus:outline-none focus:ring-2 focus:ring-destructive/20 text-sm font-mono" />
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-border">
              <button onClick={() => { setDeleteConfirm(null); setDeleteTyped(''); }}
                className="flex-1 py-2.5 rounded-xl border border-border font-medium text-sm hover:bg-muted">Cancel</button>
              <button onClick={handleDeleteSchool} disabled={deleting || deleteTyped !== 'DELETE'}
                className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground font-medium text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                {deleting ? <div className="w-4 h-4 border-2 border-destructive-foreground border-t-transparent rounded-full animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deleting ? 'Deleting...' : 'Delete School'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchoolsPage;
