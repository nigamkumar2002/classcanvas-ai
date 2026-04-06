import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Shield, Search, Filter } from 'lucide-react';

const AuditLogsPage = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200);
      const ids = [...new Set((data || []).map(l => l.user_id))];
      let pMap: Record<string, string> = {};
      if (ids.length) {
        const { data: p } = await supabase.from('profiles').select('user_id, full_name').in('user_id', ids);
        p?.forEach(pr => { pMap[pr.user_id] = pr.full_name; });
      }
      setLogs((data || []).map(l => ({ ...l, user_name: pMap[l.user_id] || 'System' })));
      setLoading(false);
    };
    fetch();
  }, []);

  const entityTypes = [...new Set(logs.map(l => l.entity_type))];
  const filtered = logs.filter(l =>
    (filterType === 'all' || l.entity_type === filterType) &&
    (!search || l.action.toLowerCase().includes(search.toLowerCase()) || l.user_name.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Logs</h1>
        <p className="text-muted-foreground text-sm mt-1">Track all platform activity and changes</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search logs..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-background text-sm" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="px-3 py-2 rounded-xl border border-border bg-background text-sm">
          <option value="all">All Types</option>
          {entityTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-border">
          <Shield className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">No audit logs found</p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/30 border-b border-border">
                <th className="text-left p-3 font-semibold">Time</th>
                <th className="text-left p-3 font-semibold">User</th>
                <th className="text-left p-3 font-semibold">Action</th>
                <th className="text-left p-3 font-semibold">Entity</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {filtered.map(l => (
                  <tr key={l.id} className="hover:bg-muted/20">
                    <td className="p-3 text-muted-foreground whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td>
                    <td className="p-3 font-medium">{l.user_name}</td>
                    <td className="p-3">{l.action}</td>
                    <td className="p-3"><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-muted">{l.entity_type}</span></td>
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
