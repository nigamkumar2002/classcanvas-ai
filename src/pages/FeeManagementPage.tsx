import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DollarSign, Plus, Clock, CheckCircle, AlertTriangle, Filter } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending' },
  paid: { bg: 'bg-green-100', text: 'text-green-700', label: 'Paid' },
  overdue: { bg: 'bg-red-100', text: 'text-red-700', label: 'Overdue' },
  waived: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Waived' },
};

const FeeManagementPage = () => {
  const { user } = useAuth();
  const [fees, setFees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [students, setStudents] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState({ student_id: '', amount: '', fee_type: 'tuition', description: '', due_date: '', status: 'pending' });

  const isStudent = user?.role === 'student';
  const canManage = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'developer';

  const fetchFees = async () => {
    const { data } = await supabase.from('fee_records').select('*').order('created_at', { ascending: false });
    const ids = [...new Set((data || []).map(f => f.student_id))];
    let pMap: Record<string, string> = {};
    if (ids.length) {
      const { data: p } = await supabase.from('profiles').select('user_id, full_name').in('user_id', ids);
      p?.forEach(pr => { pMap[pr.user_id] = pr.full_name; });
    }
    setFees((data || []).map(f => ({ ...f, student_name: pMap[f.student_id] || 'Unknown' })));
    setLoading(false);
  };

  useEffect(() => {
    fetchFees();
    if (canManage) {
      supabase.from('profiles').select('user_id, full_name').eq('role', 'student').then(({ data }) => setStudents(data || []));
    }
  }, []);

  const handleAdd = async () => {
    if (!form.student_id || !form.amount) { toast({ title: 'Student and amount required', variant: 'destructive' }); return; }
    const { error } = await supabase.from('fee_records').insert({
      student_id: form.student_id, amount: parseFloat(form.amount),
      fee_type: form.fee_type, description: form.description || null,
      due_date: form.due_date || null, status: form.status,
      created_by: user!.id, school_id: user!.school_id,
    });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Fee record added' });
    setShowAdd(false);
    setForm({ student_id: '', amount: '', fee_type: 'tuition', description: '', due_date: '', status: 'pending' });
    fetchFees();
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    const updates: any = { status, updated_at: new Date().toISOString() };
    if (status === 'paid') updates.paid_date = new Date().toISOString().split('T')[0];
    await supabase.from('fee_records').update(updates).eq('id', id);
    fetchFees();
    toast({ title: `Fee marked as ${status}` });
  };

  const filtered = filter === 'all' ? fees : fees.filter(f => f.status === filter);
  const totalPending = fees.filter(f => f.status === 'pending').reduce((s, f) => s + Number(f.amount), 0);
  const totalPaid = fees.filter(f => f.status === 'paid').reduce((s, f) => s + Number(f.amount), 0);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fee Management</h1>
          <p className="text-muted-foreground text-sm mt-1">{isStudent ? 'View your fee records' : 'Manage student fees and payments'}</p>
        </div>
        {canManage && <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90"><Plus className="w-4 h-4" /> Add Fee</button>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="stat-card"><DollarSign className="w-8 h-8 text-green-500 mb-2" /><p className="text-2xl font-bold">₹{totalPaid.toLocaleString()}</p><p className="text-sm text-muted-foreground">Total Collected</p></div>
        <div className="stat-card"><Clock className="w-8 h-8 text-amber-500 mb-2" /><p className="text-2xl font-bold">₹{totalPending.toLocaleString()}</p><p className="text-sm text-muted-foreground">Pending</p></div>
        <div className="stat-card"><AlertTriangle className="w-8 h-8 text-red-500 mb-2" /><p className="text-2xl font-bold">{fees.filter(f => f.status === 'overdue').length}</p><p className="text-sm text-muted-foreground">Overdue</p></div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground" />
        {['all', 'pending', 'paid', 'overdue', 'waived'].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-full text-xs font-medium ${filter === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            {s === 'all' ? 'All' : STATUS_STYLES[s]?.label}
          </button>
        ))}
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-muted/30 border-b border-border">
              {!isStudent && <th className="text-left p-3 font-semibold">Student</th>}
              <th className="text-left p-3 font-semibold">Type</th>
              <th className="text-right p-3 font-semibold">Amount</th>
              <th className="text-center p-3 font-semibold">Status</th>
              <th className="text-left p-3 font-semibold">Due Date</th>
              {canManage && <th className="text-center p-3 font-semibold">Actions</th>}
            </tr></thead>
            <tbody className="divide-y divide-border">
              {filtered.map(f => {
                const style = STATUS_STYLES[f.status] || STATUS_STYLES.pending;
                return (
                  <tr key={f.id} className="hover:bg-muted/20">
                    {!isStudent && <td className="p-3 font-medium">{f.student_name}</td>}
                    <td className="p-3 capitalize">{f.fee_type}</td>
                    <td className="p-3 text-right font-semibold">₹{Number(f.amount).toLocaleString()}</td>
                    <td className="p-3 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>{style.label}</span></td>
                    <td className="p-3 text-muted-foreground">{f.due_date ? new Date(f.due_date).toLocaleDateString() : '-'}</td>
                    {canManage && (
                      <td className="p-3 text-center">
                        {f.status === 'pending' && (
                          <div className="flex gap-1 justify-center">
                            <button onClick={() => handleUpdateStatus(f.id, 'paid')} className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded-lg">Paid</button>
                            <button onClick={() => handleUpdateStatus(f.id, 'waived')} className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-lg">Waive</button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAdd(false)}>
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md mx-4 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold">Add Fee Record</h2>
            <select value={form.student_id} onChange={e => setForm(f => ({ ...f, student_id: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm">
              <option value="">Select Student</option>
              {students.map(s => <option key={s.user_id} value={s.user_id}>{s.full_name}</option>)}
            </select>
            <input type="number" placeholder="Amount (₹)" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm" />
            <select value={form.fee_type} onChange={e => setForm(f => ({ ...f, fee_type: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm">
              <option value="tuition">Tuition</option><option value="exam">Exam Fee</option><option value="library">Library</option><option value="transport">Transport</option><option value="other">Other</option>
            </select>
            <input type="text" placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm" />
            <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm" />
            <div className="flex gap-2">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2 border border-border rounded-xl text-sm">Cancel</button>
              <button onClick={handleAdd} className="flex-1 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">Add Fee</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeeManagementPage;
