import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { AlertTriangle, Plus, Search, MessageSquare, CheckCircle, ArrowUp, X, Clock, Star, Trash2, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface Complaint {
  id: string; school_id: string; raised_by: string; raised_against: string | null;
  against_role: string | null; category: string; title: string; description: string;
  priority: string; status: string; current_assignee: string | null; current_level: string;
  escalation_count: number; resolved_at: string | null; resolution_notes: string | null;
  created_at: string; updated_at: string;
}

interface Profile { user_id: string; full_name: string; role: string; admission_no?: string | null; }

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700 border-blue-300',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-300',
  escalated: 'bg-orange-100 text-orange-700 border-orange-300',
  resolved: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  closed: 'bg-gray-100 text-gray-700 border-gray-300',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

const ComplaintsPage: React.FC = () => {
  const { user } = useAuth();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'mine' | 'assigned' | 'all'>('mine');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Complaint | null>(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'developer';
  const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'developer';

  const load = async () => {
    if (!user?.school_id && user?.role !== 'developer') return;
    setLoading(true);
    let q = supabase.from('complaints').select('*').order('created_at', { ascending: false }).limit(1000);
    if (user?.school_id) q = q.eq('school_id', user.school_id);
    const { data } = await q;
    const list = (data || []) as Complaint[];
    setComplaints(list);

    // batch fetch profiles
    const ids = new Set<string>();
    list.forEach(c => { ids.add(c.raised_by); if (c.raised_against) ids.add(c.raised_against); if (c.current_assignee) ids.add(c.current_assignee); });
    if (ids.size) {
      const { data: ps } = await supabase.from('profiles').select('user_id, full_name, role, admission_no').in('user_id', Array.from(ids));
      const m = new Map<string, Profile>();
      (ps || []).forEach((p: any) => m.set(p.user_id, p));
      setProfiles(m);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.school_id]);

  const filtered = useMemo(() => {
    let list = complaints;
    if (tab === 'mine') list = list.filter(c => c.raised_by === user?.user_id);
    else if (tab === 'assigned') list = list.filter(c => c.current_assignee === user?.user_id);
    if (statusFilter !== 'all') list = list.filter(c => c.status === statusFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(c => {
        const byP = profiles.get(c.raised_by);
        const agP = c.raised_against ? profiles.get(c.raised_against) : null;
        return c.title.toLowerCase().includes(s) ||
          c.description.toLowerCase().includes(s) ||
          byP?.full_name.toLowerCase().includes(s) ||
          byP?.admission_no?.toLowerCase().includes(s) ||
          agP?.full_name.toLowerCase().includes(s);
      });
    }
    return list;
  }, [complaints, tab, statusFilter, search, profiles, user?.user_id]);

  const stats = useMemo(() => ({
    total: complaints.length,
    open: complaints.filter(c => c.status === 'open').length,
    inProgress: complaints.filter(c => c.status === 'in_progress').length,
    escalated: complaints.filter(c => c.status === 'escalated').length,
    resolved: complaints.filter(c => c.status === 'resolved').length,
  }), [complaints]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-orange-500" /> Complaints & Grievances
          </h1>
          <p className="text-muted-foreground mt-1">Raise, track, and resolve issues with full transparency</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 font-semibold shadow-sm">
          <Plus className="w-4 h-4" /> Raise Complaint
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total" value={stats.total} color="bg-gradient-to-br from-violet-500 to-purple-600" />
        <StatCard label="Open" value={stats.open} color="bg-gradient-to-br from-blue-500 to-indigo-600" />
        <StatCard label="In Progress" value={stats.inProgress} color="bg-gradient-to-br from-amber-500 to-orange-600" />
        <StatCard label="Escalated" value={stats.escalated} color="bg-gradient-to-br from-orange-500 to-red-600" />
        <StatCard label="Resolved" value={stats.resolved} color="bg-gradient-to-br from-emerald-500 to-teal-600" />
      </div>

      {/* Tabs + Filters */}
      <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <TabBtn active={tab === 'mine'} onClick={() => setTab('mine')}>My Complaints</TabBtn>
          <TabBtn active={tab === 'assigned'} onClick={() => setTab('assigned')}>Assigned to Me</TabBtn>
          {isAdmin && <TabBtn active={tab === 'all'} onClick={() => setTab('all')}>All Complaints</TabBtn>}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by title, name, admission no..."
              className="w-full pl-10 pr-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm">
            <option value="all">All Status</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="escalated">Escalated</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-border">
          <AlertTriangle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No complaints found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => {
            const byP = profiles.get(c.raised_by);
            const agP = c.raised_against ? profiles.get(c.raised_against) : null;
            const daysOpen = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000);
            const overdue = daysOpen >= 7 && !['resolved', 'closed'].includes(c.status);
            return (
              <div key={c.id} onClick={() => setSelected(c)}
                className="bg-card rounded-2xl border border-border p-4 hover:shadow-lg hover:border-primary/30 cursor-pointer transition-all">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-bold truncate">{c.title}</h3>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full border", STATUS_COLORS[c.status])}>{c.status.replace('_', ' ')}</span>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full", PRIORITY_COLORS[c.priority])}>{c.priority}</span>
                      {overdue && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1"><Clock className="w-3 h-3" /> {daysOpen}d overdue</span>}
                      {c.escalation_count > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 flex items-center gap-1"><ArrowUp className="w-3 h-3" /> Escalated x{c.escalation_count}</span>}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{c.description}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>By: <strong className="text-foreground">{byP?.full_name || 'Unknown'}</strong>{byP?.admission_no && ` (${byP.admission_no})`}</span>
                  {agP && <span>Against: <strong className="text-foreground">{agP.full_name}</strong></span>}
                  <span>Level: <strong className="text-foreground capitalize">{c.current_level.replace('_', ' ')}</strong></span>
                  <span>{format(new Date(c.created_at), 'MMM d, yyyy')}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && <CreateComplaintModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
      {selected && <ComplaintDetailModal complaint={selected} profiles={profiles} canResolve={isAdmin || selected.current_assignee === user?.user_id} canDelete={isSuperAdmin} onClose={() => setSelected(null)} onUpdate={() => { load(); setSelected(null); }} />}
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div className={cn("rounded-2xl p-4 text-white shadow-lg", color)}>
    <p className="text-xs opacity-90">{label}</p>
    <p className="text-3xl font-bold mt-1">{value}</p>
  </div>
);

const TabBtn: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button onClick={onClick} className={cn("px-4 py-1.5 rounded-lg text-sm font-medium transition", active ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70")}>{children}</button>
);

// =============== Create Modal ===============
const CreateComplaintModal: React.FC<{ onClose: () => void; onCreated: () => void }> = ({ onClose, onCreated }) => {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [priority, setPriority] = useState('medium');
  const [againstId, setAgainstId] = useState('');
  const [staff, setStaff] = useState<Profile[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (!user?.school_id) return;
      const { data } = await supabase.from('profiles').select('user_id, full_name, role, admission_no')
        .eq('school_id', user.school_id).in('role', ['teacher', 'admin']).limit(500);
      setStaff((data || []) as Profile[]);
    })();
  }, [user?.school_id]);

  const submit = async () => {
    if (!title.trim() || !description.trim()) { toast({ title: 'Title and description required', variant: 'destructive' }); return; }
    if (!user?.school_id) return;
    setSaving(true);
    try {
      // Determine initial assignee: if against teacher → admin, else next level up
      const targetProfile = againstId ? staff.find(s => s.user_id === againstId) : null;
      const initialLevel = targetProfile?.role === 'admin' ? 'super_admin' : targetProfile?.role === 'teacher' ? 'admin' : 'teacher';
      // Find an assignee at that level
      const { data: assignees } = await supabase.from('user_roles').select('user_id')
        .eq('role', initialLevel as any).limit(50);
      const ids = (assignees || []).map((a: any) => a.user_id);
      let initialAssignee: string | null = null;
      if (ids.length) {
        const { data: ps } = await supabase.from('profiles').select('user_id').in('user_id', ids).eq('school_id', user.school_id).limit(1);
        initialAssignee = ps?.[0]?.user_id || null;
      }

      const { data, error } = await supabase.from('complaints').insert({
        school_id: user.school_id,
        raised_by: user.user_id,
        raised_against: againstId || null,
        against_role: targetProfile?.role || null,
        category, title: title.trim(), description: description.trim(), priority,
        status: 'open',
        current_assignee: initialAssignee,
        current_level: initialLevel,
      } as any).select().single();
      if (error) throw error;

      await supabase.from('complaint_activity').insert({
        complaint_id: data.id, actor_id: user.user_id, action: 'created',
        details: { initial_level: initialLevel } as any, school_id: user.school_id,
      });
      if (initialAssignee) {
        await supabase.from('notifications').insert({
          user_id: initialAssignee, school_id: user.school_id,
          title: 'New complaint assigned', message: title.trim(),
          type: 'info', link: '/complaints',
        });
      }
      toast({ title: 'Complaint submitted' });
      onCreated();
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-bold text-lg">Raise a Complaint</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          <Field label="Title *"><input value={title} onChange={e => setTitle(e.target.value)} className="input" placeholder="Brief title" /></Field>
          <Field label="Description *"><textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} className="input" placeholder="Describe the issue in detail" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <select value={category} onChange={e => setCategory(e.target.value)} className="input">
                <option value="general">General</option>
                <option value="academic">Academic</option>
                <option value="behavior">Behavior</option>
                <option value="infrastructure">Infrastructure</option>
                <option value="bullying">Bullying</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Priority">
              <select value={priority} onChange={e => setPriority(e.target.value)} className="input">
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
              </select>
            </Field>
          </div>
          <Field label="Against (optional)">
            <select value={againstId} onChange={e => setAgainstId(e.target.value)} className="input">
              <option value="">— None / general issue —</option>
              {staff.map(s => <option key={s.user_id} value={s.user_id}>{s.full_name} ({s.role})</option>)}
            </select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-50">{saving ? 'Submitting...' : 'Submit'}</button>
        </div>
      </div>
      <style>{`.input{width:100%;padding:0.5rem 0.75rem;border-radius:0.5rem;border:1px solid hsl(var(--border));background:hsl(var(--background));font-size:0.875rem;outline:none}.input:focus{box-shadow:0 0 0 2px hsl(var(--primary)/0.2)}`}</style>
    </div>
  );
};

// =============== Detail Modal ===============
const ComplaintDetailModal: React.FC<{ complaint: Complaint; profiles: Map<string, Profile>; canResolve: boolean; canDelete: boolean; onClose: () => void; onUpdate: () => void; }> = ({ complaint, profiles, canResolve, canDelete, onClose, onUpdate }) => {
  const { user } = useAuth();
  const [responses, setResponses] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [resolution, setResolution] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [r, a] = await Promise.all([
        supabase.from('complaint_responses').select('*').eq('complaint_id', complaint.id).order('created_at'),
        supabase.from('complaint_activity').select('*').eq('complaint_id', complaint.id).order('created_at'),
      ]);
      setResponses(r.data || []);
      setActivity(a.data || []);
    })();
  }, [complaint.id]);

  const sendResponse = async () => {
    if (!newMsg.trim() || !user) return;
    setSaving(true);
    try {
      await supabase.from('complaint_responses').insert({
        complaint_id: complaint.id, responder_id: user.user_id,
        school_id: complaint.school_id, message: newMsg.trim(),
      });
      await supabase.from('complaints').update({ status: 'in_progress' }).eq('id', complaint.id);
      await supabase.from('complaint_activity').insert({
        complaint_id: complaint.id, actor_id: user.user_id, action: 'responded',
        details: {} as any, school_id: complaint.school_id,
      });
      setNewMsg('');
      const { data } = await supabase.from('complaint_responses').select('*').eq('complaint_id', complaint.id).order('created_at');
      setResponses(data || []);
      toast({ title: 'Response posted' });
    } finally { setSaving(false); }
  };

  const resolve = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await supabase.from('complaints').update({
        status: 'resolved', resolved_at: new Date().toISOString(),
        resolved_by: user.user_id, resolution_notes: resolution.trim() || null,
      }).eq('id', complaint.id);
      await supabase.from('complaint_activity').insert({
        complaint_id: complaint.id, actor_id: user.user_id, action: 'resolved',
        details: { notes: resolution } as any, school_id: complaint.school_id,
      });
      await supabase.from('notifications').insert({
        user_id: complaint.raised_by, school_id: complaint.school_id,
        title: 'Your complaint was resolved', message: complaint.title,
        type: 'success', link: '/complaints',
      });
      toast({ title: 'Marked as resolved' });
      onUpdate();
    } finally { setSaving(false); }
  };

  const escalate = async () => {
    if (!user) return;
    const nextLevel = complaint.current_level === 'teacher' ? 'admin' : 'super_admin';
    setSaving(true);
    try {
      const { data: roles } = await supabase.from('user_roles').select('user_id').eq('role', nextLevel as any).limit(50);
      const ids = (roles || []).map((r: any) => r.user_id);
      let assignee: string | null = null;
      if (ids.length) {
        const { data: ps } = await supabase.from('profiles').select('user_id').in('user_id', ids).eq('school_id', complaint.school_id).limit(1);
        assignee = ps?.[0]?.user_id || null;
      }
      await supabase.from('complaints').update({
        current_level: nextLevel, current_assignee: assignee,
        escalation_count: complaint.escalation_count + 1, status: 'escalated',
      }).eq('id', complaint.id);
      await supabase.from('complaint_activity').insert({
        complaint_id: complaint.id, actor_id: user.user_id, action: 'escalated',
        details: { to_level: nextLevel } as any, school_id: complaint.school_id,
      });
      if (assignee) {
        await supabase.from('notifications').insert({
          user_id: assignee, school_id: complaint.school_id,
          title: 'Complaint escalated to you', message: complaint.title,
          type: 'warning', link: '/complaints',
        });
      }
      toast({ title: `Escalated to ${nextLevel.replace('_', ' ')}` });
      onUpdate();
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!confirm('Permanently delete this complaint?')) return;
    await supabase.from('complaints').delete().eq('id', complaint.id);
    toast({ title: 'Complaint deleted' });
    onUpdate();
  };

  const byP = profiles.get(complaint.raised_by);
  const agP = complaint.raised_against ? profiles.get(complaint.raised_against) : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between p-4 border-b border-border">
          <div>
            <h2 className="font-bold text-lg">{complaint.title}</h2>
            <div className="flex flex-wrap gap-2 mt-1">
              <span className={cn("text-xs px-2 py-0.5 rounded-full border", STATUS_COLORS[complaint.status])}>{complaint.status.replace('_', ' ')}</span>
              <span className={cn("text-xs px-2 py-0.5 rounded-full", PRIORITY_COLORS[complaint.priority])}>{complaint.priority}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted">{complaint.category}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Raised by: <strong className="text-foreground">{byP?.full_name}</strong>{byP?.admission_no && ` (${byP.admission_no})`}</p>
            {agP && <p>Against: <strong className="text-foreground">{agP.full_name}</strong> ({agP.role})</p>}
            <p>Current level: <strong className="text-foreground capitalize">{complaint.current_level.replace('_', ' ')}</strong></p>
          </div>
          <div className="p-3 bg-muted/30 rounded-lg text-sm whitespace-pre-wrap">{complaint.description}</div>

          {/* Conversation */}
          <div className="space-y-2">
            <h4 className="font-semibold text-sm flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Responses ({responses.length})</h4>
            {responses.map(r => {
              const p = profiles.get(r.responder_id);
              return (
                <div key={r.id} className="p-3 bg-muted/30 rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">{p?.full_name || 'Unknown'} ({p?.role}) · {format(new Date(r.created_at), 'MMM d, h:mm a')}</div>
                  <p className="text-sm whitespace-pre-wrap">{r.message}</p>
                </div>
              );
            })}
          </div>

          {/* Activity log */}
          {activity.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Activity log ({activity.length})</summary>
              <div className="mt-2 space-y-1">
                {activity.map(a => (
                  <div key={a.id} className="text-muted-foreground">
                    {format(new Date(a.created_at), 'MMM d, h:mm a')} — <strong className="capitalize">{a.action.replace('_', ' ')}</strong>
                    {a.details && Object.keys(a.details).length > 0 && <span> · {JSON.stringify(a.details)}</span>}
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Reply box */}
          {complaint.status !== 'resolved' && complaint.status !== 'closed' && (
            <div className="space-y-2">
              <textarea value={newMsg} onChange={e => setNewMsg(e.target.value)} rows={2}
                placeholder="Type a response..." className="w-full p-2 rounded-lg border border-border bg-background text-sm" />
              <button onClick={sendResponse} disabled={saving || !newMsg.trim()} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-50">Send Response</button>
            </div>
          )}

          {/* Resolve */}
          {canResolve && complaint.status !== 'resolved' && complaint.status !== 'closed' && (
            <div className="space-y-2 pt-3 border-t border-border">
              <h4 className="font-semibold text-sm">Resolve this complaint</h4>
              <textarea value={resolution} onChange={e => setResolution(e.target.value)} rows={2}
                placeholder="Resolution notes (optional)" className="w-full p-2 rounded-lg border border-border bg-background text-sm" />
              <div className="flex flex-wrap gap-2">
                <button onClick={resolve} disabled={saving} className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm disabled:opacity-50"><CheckCircle className="w-4 h-4" /> Mark Resolved</button>
                {complaint.current_level !== 'super_admin' && (
                  <button onClick={escalate} disabled={saving} className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm disabled:opacity-50"><ArrowUp className="w-4 h-4" /> Escalate</button>
                )}
              </div>
            </div>
          )}

          {complaint.resolved_at && complaint.resolution_notes && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <p className="text-xs font-semibold text-emerald-700 mb-1">Resolution ({format(new Date(complaint.resolved_at), 'MMM d, yyyy')})</p>
              <p className="text-sm">{complaint.resolution_notes}</p>
            </div>
          )}
        </div>
        {canDelete && (
          <div className="p-4 border-t border-border">
            <button onClick={remove} className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"><Trash2 className="w-3 h-3" /> Permanently delete</button>
          </div>
        )}
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div><label className="block text-xs font-semibold text-muted-foreground mb-1">{label}</label>{children}</div>
);

export default ComplaintsPage;
