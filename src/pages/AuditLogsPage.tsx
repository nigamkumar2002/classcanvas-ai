import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Shield, Search } from 'lucide-react';

const ROLE_BADGE: Record<string, string> = {
  developer: 'bg-purple-100 text-purple-800',
  super_admin: 'bg-indigo-100 text-indigo-800',
  admin: 'bg-blue-100 text-blue-800',
  teacher: 'bg-emerald-100 text-emerald-800',
  student: 'bg-amber-100 text-amber-800',
};

const AuditLogsPage = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterRole, setFilterRole] = useState('all');

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(500);
      const ids = [...new Set((data || []).map(l => l.user_id))];
      const pMap: Record<string, { name: string; role: string }> = {};
      if (ids.length) {
        const [{ data: p }, { data: r }] = await Promise.all([
          supabase.from('profiles').select('user_id, full_name').in('user_id', ids),
          supabase.from('user_roles').select('user_id, role').in('user_id', ids),
        ]);
        const roles: Record<string, string> = {};
        r?.forEach(rr => { roles[rr.user_id] = rr.role; });
        p?.forEach(pr => { pMap[pr.user_id] = { name: pr.full_name, role: roles[pr.user_id] || 'user' }; });
      }
      setLogs((data || []).map(l => ({
        ...l,
        user_name: pMap[l.user_id]?.name || 'System',
        user_role: pMap[l.user_id]?.role || 'system',
      })));
      setLoading(false);
    };
    fetch();
  }, []);

  const entityTypes = [...new Set(logs.map(l => l.entity_type))];
  const visibleRoles = [...new Set(logs.map(l => l.user_role))];

  const filtered = logs.filter(l =>
    (filterType === 'all' || l.entity_type === filterType) &&
    (filterRole === 'all' || l.user_role === filterRole) &&
    (!search || l.action.toLowerCase().includes(search.toLowerCase()) || l.user_name.toLowerCase().includes(search.toLowerCase()))
  );

  const scopeLabel = user?.role === 'developer' ? 'All platforms' :
    user?.role === 'super_admin' ? 'Everyone in your school' :
    user?.role === 'admin' ? 'Students & teachers in your school' :
    user?.role === 'teacher' ? 'Students in your school' : 'Your activity';

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Logs</h1>
        <p className="text-muted-foreground text-sm mt-1">Tracking platform activity · <span className="font-medium text-foreground">Scope: {scopeLabel}</span></p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search action or user..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-background text-sm" />
        </div>
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
          className="px-3 py-2 rounded-xl border border-border bg-background text-sm">
          <option value="all">All Roles</option>
          {visibleRoles.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="px-3 py-2 rounded-xl border border-border bg-background text-sm">
          <option value="all">All Types</option>
          {entityTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-border">
          <Shield className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">No audit logs found in your scope</p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/30 border-b border-border">
                <th className="text-left p-3 font-semibold">Time</th>
                <th className="text-left p-3 font-semibold">User</th>
                <th className="text-left p-3 font-semibold">Role</th>
                <th className="text-left p-3 font-semibold">Action</th>
                <th className="text-left p-3 font-semibold">Entity</th>
                <th className="text-left p-3 font-semibold">Details</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {filtered.map(l => (
                  <tr key={l.id} className="hover:bg-muted/20">
                    <td className="p-3 text-muted-foreground whitespace-nowrap text-xs">{new Date(l.created_at).toLocaleString()}</td>
                    <td className="p-3 font-medium">{l.user_name}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE[l.user_role] || 'bg-muted'}`}>
                        {l.user_role}
                      </span>
                    </td>
                    <td className="p-3">{l.action}</td>
                    <td className="p-3"><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-muted">{l.entity_type}</span></td>
                    <td className="p-3 text-xs text-muted-foreground max-w-xs truncate" title={JSON.stringify(l.details)}>
                      {l.details && Object.keys(l.details).length > 0 ? JSON.stringify(l.details).slice(0, 80) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLogsPage;
