import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Megaphone, Plus, X, Trash2, AlertTriangle, Info, CheckCircle, AlertOctagon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Announcement {
  id: string;
  title: string;
  message: string;
  type: string;
  created_by: string;
  target_role: string | null;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  info: { label: 'Info', icon: Info, color: 'bg-blue-100 text-blue-700' },
  warning: { label: 'Warning', icon: AlertTriangle, color: 'bg-amber-100 text-amber-700' },
  success: { label: 'Success', icon: CheckCircle, color: 'bg-green-100 text-green-700' },
  urgent: { label: 'Urgent', icon: AlertOctagon, color: 'bg-red-100 text-red-700' },
};

const AnnouncementsPage = () => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: '', message: '', type: 'info', target_role: '' });
  const [adding, setAdding] = useState(false);

  const canManage = user?.role === 'developer' || user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'teacher';

  const fetchAnnouncements = async () => {
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });
    setAnnouncements((data as Announcement[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchAnnouncements(); }, []);

  const handleCreate = async () => {
    if (!form.title.trim() || !form.message.trim()) return;
    setAdding(true);
    const { error } = await supabase.from('announcements').insert({
      title: form.title,
      message: form.message,
      type: form.type,
      target_role: form.target_role || null,
      created_by: user?.user_id,
      school_id: user?.school_id || null,
    } as any);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Announcement posted!');
      setShowAdd(false);
      setForm({ title: '', message: '', type: 'info', target_role: '' });

      // Send notifications to relevant users
      const { data: profiles } = await supabase.from('profiles').select('user_id');
      if (profiles) {
        const notifications = profiles.map((p: any) => ({
          user_id: p.user_id,
          title: `📢 ${form.title}`,
          message: form.message,
          type: 'announcement',
          school_id: user?.school_id || null,
        }));
        await supabase.from('notifications').insert(notifications as any);
      }
      fetchAnnouncements();
    }
    setAdding(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this announcement?')) return;
    await supabase.from('announcements').delete().eq('id', id);
    fetchAnnouncements();
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Announcements</h1>
          <p className="text-muted-foreground text-sm mt-1">{announcements.length} announcements</p>
        </div>
        {canManage && (
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-blue text-white rounded-xl font-medium text-sm shadow-glow-blue hover:opacity-90 transition-all">
            <Plus className="w-4 h-4" /> New Announcement
          </button>
        )}
      </div>

      <div className="space-y-3">
        {announcements.map(a => {
          const cfg = TYPE_CONFIG[a.type] || TYPE_CONFIG.info;
          return (
            <div key={a.id} className="bg-card rounded-2xl border border-border shadow-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', cfg.color)}>
                    <cfg.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm">{a.title}</h3>
                      <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', cfg.color)}>{cfg.label}</span>
                      {!a.is_active && <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground">Expired</span>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{a.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-2">
                      {new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {a.target_role && <span className="ml-2">· For: <span className="capitalize">{a.target_role.replace('_', ' ')}s</span></span>}
                    </p>
                  </div>
                </div>
                {canManage && (
                  <button onClick={() => handleDelete(a.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {announcements.length === 0 && (
          <div className="bg-card rounded-2xl border border-border shadow-card p-12 text-center">
            <Megaphone className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-muted-foreground">No announcements yet</p>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-blue flex items-center justify-center"><Megaphone className="w-5 h-5 text-white" /></div>
                <h2 className="text-lg font-bold">New Announcement</h2>
              </div>
              <button onClick={() => setShowAdd(false)} className="p-2 rounded-xl hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Type</label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                    <button key={key} onClick={() => setForm(f => ({ ...f, type: key }))}
                      className={cn('flex flex-col items-center gap-1 p-2 rounded-xl border text-xs transition-all',
                        form.type === key ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50')}>
                      <cfg.icon className="w-4 h-4" />
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Announcement title"
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Message *</label>
                <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="Announcement details..." rows={3}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm resize-none" />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Target Audience</label>
                <select value={form.target_role} onChange={e => setForm(f => ({ ...f, target_role: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm">
                  <option value="">Everyone</option>
                  <option value="teacher">Teachers Only</option>
                  <option value="student">Students Only</option>
                  <option value="admin">Admins Only</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-border">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl border border-border font-medium text-sm hover:bg-muted">Cancel</button>
              <button onClick={handleCreate} disabled={adding || !form.title.trim() || !form.message.trim()}
                className="flex-1 py-2.5 rounded-xl bg-gradient-blue text-white font-medium text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                {adding ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Megaphone className="w-4 h-4" />}
                {adding ? 'Posting...' : 'Post Announcement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnnouncementsPage;
