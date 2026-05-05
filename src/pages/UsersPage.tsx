import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Users, Plus, Search, Mail, Shield, GraduationCap, BookOpen, UserCheck, X, Eye, EyeOff, School, Trash2, AlertTriangle, Upload, Pencil, ChevronLeft, KeyRound, Copy } from 'lucide-react';
import { toast } from 'sonner';
import BulkStudentImportModal from '@/components/users/BulkStudentImportModal';

interface Profile {
  id: string; user_id: string; full_name: string; email: string;
  role: string; is_demo: boolean; created_at: string; school_id?: string;
  class_id?: string; admission_no?: string; roll_no?: string; section?: string;
  date_of_birth?: string;
}

interface SchoolItem { id: string; name: string; code: string; }

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  developer: { label: 'Developer', color: 'bg-cyan-100 text-cyan-700 border-cyan-200', icon: Shield },
  super_admin: { label: 'Super Admin', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: Shield },
  admin: { label: 'School Admin', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Shield },
  teacher: { label: 'Teacher', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: BookOpen },
  student: { label: 'Student', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: GraduationCap },
};

const UsersPage = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'student', school_id: '', class_id: '' });
  const [availableClasses, setAvailableClasses] = useState<{id: string; name: string}[]>([]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);

  // Edit user modal
  const [editUser, setEditUser] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', email: '', role: '', class_id: '', admission_no: '', roll_no: '', section: '', date_of_birth: '' });
  const [editLoading, setEditLoading] = useState(false);
  const [editClasses, setEditClasses] = useState<{id: string; name: string}[]>([]);

  // Drill-down: clicking a role card filters to that role
  const [drillRole, setDrillRole] = useState<string | null>(null);
  // Details modal
  const [detailsUser, setDetailsUser] = useState<Profile | null>(null);
  const [classNamesById, setClassNamesById] = useState<Record<string, string>>({});

  const myRole = user?.role || 'student';
  const isDeveloper = myRole === 'developer';
  const canBulkImport = myRole === 'super_admin' || myRole === 'developer';

  const canEditUsers = myRole === 'super_admin' || myRole === 'admin' || myRole === 'developer';

  const creatableRoles: Record<string, string[]> = {
    developer: ['super_admin', 'admin', 'teacher', 'student'],
    super_admin: ['admin', 'teacher', 'student'],
    admin: ['teacher', 'student'],
    teacher: ['student'],
  };
  const canCreate = creatableRoles[myRole] || [];

  const visibleRoles: Record<string, string[]> = {
    developer: ['developer', 'super_admin', 'admin', 'teacher', 'student'],
    super_admin: ['super_admin', 'admin', 'teacher', 'student'],
    admin: ['admin', 'teacher', 'student'],
    teacher: ['student'],
  };
  const showRoles = visibleRoles[myRole] || [];

  const fetchUsers = async () => {
    try {
      setLoading(true);
      // Fetch all profiles (handle >1000)
      const allProfiles: any[] = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;
      while (hasMore) {
        const { data } = await supabase.from('profiles').select('*').range(from, from + batchSize - 1);
        if (data && data.length > 0) {
          allProfiles.push(...data);
          from += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      const { data: roles } = await supabase.from('user_roles').select('*');

      if (allProfiles.length && roles) {
        const roleMap = new Map(roles.map((r: any) => [r.user_id, r.role]));
        const enriched = allProfiles.map((p: any) => ({
          ...p,
          role: roleMap.get(p.user_id) || p.role,
        }));
        setUsers(enriched.filter((u: any) => showRoles.includes(u.role)));
      }

      if (isDeveloper) {
        const { data: schoolData } = await supabase.from('schools').select('id, name, code');
        setSchools((schoolData as SchoolItem[]) || []);
      }

      // class id -> name map for student details
      const { data: classRows } = await supabase.from('classes').select('id, name');
      const map: Record<string, string> = {};
      (classRows || []).forEach((c: any) => { map[c.id] = c.name; });
      setClassNamesById(map);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  // Read URL params for initial drill-down
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const role = params.get('role');
    if (role && showRoles.includes(role)) {
      setDrillRole(role);
      setFilterRole(role);
    }
  }, []);

  useEffect(() => {
    if (form.role !== 'student' || !showAdd) {
      setAvailableClasses([]);
      return;
    }

    let query = supabase.from('classes').select('id, name').order('name');
    if (isDeveloper) {
      if (!form.school_id) { setAvailableClasses([]); return; }
      query = query.eq('school_id', form.school_id);
    } else if (user?.school_id) {
      query = query.eq('school_id', user.school_id);
    }
    query.then(({ data }) => { setAvailableClasses(data || []); });
  }, [form.role, showAdd, form.school_id, isDeveloper, user?.school_id]);

  const handleAddUser = async () => {
    if (!form.full_name.trim() || !form.email.trim() || !form.password.trim()) {
      setAddError('All fields are required'); return;
    }
    if (form.password.length < 6) { setAddError('Password must be at least 6 characters'); return; }
    if (isDeveloper && !form.school_id && form.role !== 'developer') {
      setAddError('Please select a school for this user'); return;
    }
    if (form.role === 'student' && !form.class_id) {
      setAddError('Please assign a class for this student'); return;
    }
    setAdding(true); setAddError(''); setAddSuccess('');

    try {
      const body: any = { email: form.email, password: form.password, full_name: form.full_name, role: form.role };
      if (isDeveloper && form.school_id) body.school_id = form.school_id;
      if (form.role === 'student' && form.class_id) body.class_id = form.class_id;

      const { data, error } = await supabase.functions.invoke('create-user', { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setAddSuccess(`✅ ${form.full_name} created successfully!`);
      setForm({ full_name: '', email: '', password: '', role: canCreate[0] || 'student', school_id: '', class_id: '' });
      setTimeout(() => fetchUsers(), 500);
    } catch (error: any) {
      setAddError(error.message || 'Failed to create user');
    } finally {
      setAdding(false);
    }
  };

  // Load classes for edit modal whenever a student is selected for editing
  useEffect(() => {
    if (!editUser || editForm.role !== 'student') { setEditClasses([]); return; }
    const schoolId = editUser.school_id;
    if (!schoolId) { setEditClasses([]); return; }
    supabase.from('classes').select('id, name').eq('school_id', schoolId).order('name')
      .then(({ data }) => setEditClasses(data || []));
  }, [editUser, editForm.role]);

  const handleEditUser = async () => {
    if (!editUser || !editForm.full_name.trim() || !editForm.email.trim()) return;
    if (editForm.role === 'student' && !editForm.class_id) {
      toast.error('Please assign a class for this student');
      return;
    }
    setEditLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('update-user', {
        body: {
          target_user_id: editUser.user_id,
          full_name: editForm.full_name.trim(),
          email: editForm.email.trim(),
          role: editForm.role,
          class_id: editForm.role === 'student' ? editForm.class_id : null,
          admission_no: editForm.role === 'student' ? editForm.admission_no.trim() || null : null,
          roll_no: editForm.role === 'student' ? editForm.roll_no.trim() || null : null,
          section: editForm.role === 'student' ? editForm.section.trim() || null : null,
          date_of_birth: editForm.role === 'student' ? editForm.date_of_birth || null : null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('User updated successfully');
      setEditUser(null);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update user');
    } finally {
      setEditLoading(false);
    }
  };

  const [deleteConfirm, setDeleteConfirm] = useState<Profile | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);

  // Reset password modal
  const [pwUser, setPwUser] = useState<Profile | null>(null);
  const [pwValue, setPwValue] = useState('');
  const [pwShow, setPwShow] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState('');

  const canResetPassword = (target: Profile) => {
    if (target.is_demo) return false;
    if (target.user_id === user?.user_id) return false;
    if (myRole === 'developer') return ['super_admin', 'admin', 'teacher', 'student'].includes(target.role);
    if (myRole === 'super_admin') return ['admin', 'teacher', 'student'].includes(target.role);
    if (myRole === 'admin') return ['teacher', 'student'].includes(target.role);
    return false;
  };

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let out = '';
    for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
    setPwValue(out);
    setPwShow(true);
  };

  const handleResetPassword = async () => {
    if (!pwUser) return;
    if (pwValue.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setPwLoading(true);
    setPwSuccess('');
    try {
      const { data, error } = await supabase.functions.invoke('reset-user-password', {
        body: { target_user_id: pwUser.user_id, new_password: pwValue },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPwSuccess(`✅ Password updated. Share it with ${pwUser.full_name} so they can sign in.`);
      toast.success('Password changed successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  };

  const canDeleteUser = (target: Profile) => {
    if (target.user_id === user?.user_id) return false;
    if (user?.role === 'developer') return true;
    if (user?.role === 'super_admin' && ['admin', 'teacher', 'student'].includes(target.role)) return true;
    return false;
  };

  const handleDeleteUser = async () => {
    if (!deleteConfirm) return;
    setDeletingUser(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { target_user_id: deleteConfirm.user_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`${deleteConfirm.full_name} has been removed`);
      setUsers(prev => prev.filter(item => item.user_id !== deleteConfirm.user_id));
      setDeleteConfirm(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete user');
    } finally {
      setDeletingUser(false);
    }
  };

  const filteredUsers = users.filter(u => {
    if (!isDeveloper && u.is_demo) return false;
    const matchSearch = u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const activeFilter = drillRole || filterRole;
    const matchRole = activeFilter === 'all' || u.role === activeFilter;
    return matchSearch && matchRole;
  });

  const roleCounts = users.reduce((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          {drillRole ? (
            <div className="flex items-center gap-2">
              <button onClick={() => { setDrillRole(null); setFilterRole('all'); window.history.replaceState({}, '', window.location.pathname); }}
                className="p-1.5 rounded-lg hover:bg-muted"><ChevronLeft className="w-5 h-5" /></button>
              <div>
                <h1 className="text-2xl font-bold">{ROLE_CONFIG[drillRole]?.label || drillRole}s</h1>
                <p className="text-muted-foreground text-sm mt-1">{filteredUsers.length} users</p>
              </div>
            </div>
          ) : (
            <div>
              <h1 className="text-2xl font-bold">User Management</h1>
              <p className="text-muted-foreground text-sm mt-1">{users.length} total users</p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {canBulkImport && (
            <button onClick={() => setShowBulkImport(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-background font-medium text-sm hover:bg-muted transition-all">
              <Upload className="w-4 h-4" /> Bulk Import Students
            </button>
          )}
          {canCreate.length > 0 && (
            <button onClick={() => { setShowAdd(true); setAddError(''); setAddSuccess(''); setForm(f => ({ ...f, role: canCreate[0] || 'student' })); }}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-blue text-white rounded-xl font-medium text-sm shadow-glow-blue hover:opacity-90 transition-all">
              <Plus className="w-4 h-4" /> Add User
            </button>
          )}
        </div>
      </div>

      {/* Clickable Role Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(roleCounts).map(([role, count]) => {
          const cfg = ROLE_CONFIG[role];
          if (!cfg) return null;
          return (
            <button key={role} onClick={() => {
              if (drillRole === role) { setDrillRole(null); setFilterRole('all'); } else { setDrillRole(role); setFilterRole(role); }
            }}
              className={`stat-card flex items-center gap-3 p-4 cursor-pointer hover:shadow-md transition-all text-left ${drillRole === role ? 'ring-2 ring-primary' : ''}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                role === 'developer' ? 'bg-gradient-blue' :
                role === 'super_admin' ? 'bg-gradient-purple' :
                role === 'admin' ? 'bg-gradient-blue' :
                role === 'teacher' ? 'bg-gradient-green' : 'bg-gradient-amber'
              }`}>
                <cfg.icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xl font-bold">{count}</p>
                <p className="text-xs text-muted-foreground">{cfg.label}s</p>
              </div>
            </button>
          );
        })}
      </div>

      {!drillRole && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
          </div>
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm">
            <option value="all">All Roles</option>
            {showRoles.map(r => <option key={r} value={r}>{ROLE_CONFIG[r]?.label || r}</option>)}
          </select>
        </div>
      )}

      {drillRole && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${ROLE_CONFIG[drillRole]?.label || ''}s...`}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">User</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Joined</th>
                   <th className="text-left px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                   <th className="text-left px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredUsers.map(u => {
                  const cfg = ROLE_CONFIG[u.role] || ROLE_CONFIG.student;
                  return (
                    <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                            u.role === 'developer' ? 'bg-gradient-blue' :
                            u.role === 'super_admin' ? 'bg-gradient-purple' :
                            u.role === 'admin' ? 'bg-gradient-blue' :
                            u.role === 'teacher' ? 'bg-gradient-green' : 'bg-gradient-amber'
                          }`}>
                            {u.full_name[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-sm">{u.full_name}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.color}`}>
                          <cfg.icon className="w-3 h-3" />{cfg.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          u.is_demo ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-green-100 text-green-700 border border-green-200'
                        }`}>
                         {u.is_demo ? '🔒 Demo' : '✅ Active'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setDetailsUser(u)}
                            className="p-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors" title="View details">
                            <Eye className="w-4 h-4" />
                          </button>
                          {canEditUsers && (
                            <button onClick={() => {
                              setEditUser(u);
                              setEditForm({
                                full_name: u.full_name,
                                email: u.email,
                                role: u.role,
                                class_id: u.class_id || '',
                                admission_no: u.admission_no || '',
                                roll_no: u.roll_no || '',
                                section: u.section || '',
                                date_of_birth: u.date_of_birth || '',
                              });
                            }}
                              className="p-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors" title="Edit user">
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {canResetPassword(u) && (
                            <button onClick={() => { setPwUser(u); setPwValue(''); setPwShow(false); setPwSuccess(''); }}
                              className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors" title="Change password">
                              <KeyRound className="w-4 h-4" />
                            </button>
                          )}
                          {canDeleteUser(u) && (
                            <button onClick={() => setDeleteConfirm(u)}
                              className="p-2 rounded-lg text-destructive hover:bg-destructive/10 transition-colors" title="Remove user">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>No users found</p>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-blue flex items-center justify-center"><UserCheck className="w-5 h-5 text-white" /></div>
                <h2 className="text-lg font-bold">Add New User</h2>
              </div>
              <button onClick={() => setShowAdd(false)} className="p-2 rounded-xl hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {addError && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{addError}</div>}
              {addSuccess && <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">{addSuccess}</div>}

              {isDeveloper && (
                <div>
                  <label className="text-sm font-semibold mb-1.5 block flex items-center gap-1"><School className="w-3.5 h-3.5" /> Assign to School *</label>
                  <select value={form.school_id} onChange={e => setForm(f => ({ ...f, school_id: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm">
                    <option value="">Select school...</option>
                    {schools.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="text-sm font-semibold mb-1.5 block">Full Name *</label>
                <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="e.g. John Smith"
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Email (Login ID) *</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="e.g. john@school.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Password *</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 6 characters"
                    className="w-full px-4 py-2.5 pr-10 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Role *</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm">
                  {canCreate.map(r => <option key={r} value={r}>{ROLE_CONFIG[r]?.label || r}</option>)}
                </select>
              </div>
              {form.role === 'student' && availableClasses.length > 0 && (
                <div>
                  <label className="text-sm font-semibold mb-1.5 block flex items-center gap-1"><GraduationCap className="w-3.5 h-3.5" /> Assign to Class *</label>
                  <select value={form.class_id} onChange={e => setForm(f => ({ ...f, class_id: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm">
                    <option value="">Select class...</option>
                    {availableClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-xs">
                💡 Share email & password with the user so they can login.
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-border">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl border border-border font-medium text-sm hover:bg-muted">Cancel</button>
              <button onClick={handleAddUser} disabled={adding}
                className="flex-1 py-2.5 rounded-xl bg-gradient-blue text-white font-medium text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                {adding ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Plus className="w-4 h-4" />}
                {adding ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Pencil className="w-5 h-5 text-primary" /></div>
                <h2 className="text-lg font-bold">Edit User</h2>
              </div>
              <button onClick={() => setEditUser(null)} className="p-2 rounded-xl hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Full Name *</label>
                <input value={editForm.full_name} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Email *</label>
                <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Role</label>
                <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm">
                  {showRoles.filter(r => r !== 'developer').map(r => <option key={r} value={r}>{ROLE_CONFIG[r]?.label || r}</option>)}
                </select>
              </div>
              {editForm.role === 'student' && (
                <div>
                  <label className="text-sm font-semibold mb-1.5 block flex items-center gap-1"><GraduationCap className="w-3.5 h-3.5" /> Assigned Class *</label>
                  <select value={editForm.class_id} onChange={e => setEditForm(f => ({ ...f, class_id: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm">
                    <option value="">Select class...</option>
                    {editClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">Changing the class will move the student instantly.</p>
                </div>
              )}
            </div>
            <div className="flex gap-3 p-6 border-t border-border">
              <button onClick={() => setEditUser(null)} className="flex-1 py-2.5 rounded-xl border border-border font-medium text-sm hover:bg-muted">Cancel</button>
              <button onClick={handleEditUser} disabled={editLoading}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                {editLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkImport && (
        <BulkStudentImportModal
          schools={schools}
          onClose={() => setShowBulkImport(false)}
          onSuccess={() => {
            setShowBulkImport(false);
            fetchUsers();
          }}
        />
      )}

      {/* Reset Password Modal */}
      {pwUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center"><KeyRound className="w-5 h-5 text-blue-600" /></div>
                <div>
                  <h2 className="text-lg font-bold">Change Password</h2>
                  <p className="text-xs text-muted-foreground">{pwUser.full_name} · {pwUser.email}</p>
                </div>
              </div>
              <button onClick={() => setPwUser(null)} className="p-2 rounded-xl hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-semibold">New Password *</label>
                  <button type="button" onClick={generateRandomPassword}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium">Generate strong password</button>
                </div>
                <div className="relative">
                  <input type={pwShow ? 'text' : 'password'} value={pwValue}
                    onChange={e => setPwValue(e.target.value)} placeholder="Min 6 characters" autoFocus
                    className="w-full px-4 py-2.5 pr-20 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm font-mono" />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {pwValue && (
                      <button type="button" onClick={() => { navigator.clipboard.writeText(pwValue); toast.success('Copied'); }}
                        className="p-1.5 text-muted-foreground hover:text-foreground" title="Copy">
                        <Copy className="w-4 h-4" />
                      </button>
                    )}
                    <button type="button" onClick={() => setPwShow(!pwShow)}
                      className="p-1.5 text-muted-foreground hover:text-foreground">
                      {pwShow ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
              {pwSuccess && (
                <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">{pwSuccess}</div>
              )}
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                ⚠️ Share the new password securely with the user. They will need it to sign in.
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-border">
              <button onClick={() => setPwUser(null)} className="flex-1 py-2.5 rounded-xl border border-border font-medium text-sm hover:bg-muted">Close</button>
              <button onClick={handleResetPassword} disabled={pwLoading || pwValue.length < 6}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-medium text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                {pwLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <KeyRound className="w-4 h-4" />}
                {pwLoading ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-sm">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <h3 className="font-bold">Remove User</h3>
                  <p className="text-sm text-muted-foreground">{deleteConfirm.full_name}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Are you sure you want to remove <strong>{deleteConfirm.full_name}</strong> ({deleteConfirm.email})?
                This will delete their profile and role assignment. This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 p-6 border-t border-border">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl border border-border font-medium text-sm hover:bg-muted">Cancel</button>
              <button onClick={handleDeleteUser} disabled={deletingUser}
                className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground font-medium text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                {deletingUser ? <div className="w-4 h-4 border-2 border-destructive-foreground border-t-transparent rounded-full animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deletingUser ? 'Removing...' : 'Remove User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User details modal */}
      {detailsUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Eye className="w-5 h-5 text-primary" /></div>
                <h2 className="text-lg font-bold">User Details</h2>
              </div>
              <button onClick={() => setDetailsUser(null)} className="p-2 rounded-xl hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-3 text-sm">
              {[
                ['Full name', detailsUser.full_name],
                ['Email', detailsUser.email],
                ['Role', ROLE_CONFIG[detailsUser.role]?.label || detailsUser.role],
                ['Class', detailsUser.class_id ? (classNamesById[detailsUser.class_id] || '—') : '—'],
                ['Admission No.', detailsUser.admission_no || '—'],
                ['Roll No.', detailsUser.roll_no || '—'],
                ['Section', detailsUser.section || '—'],
                ['Date of birth', detailsUser.date_of_birth ? new Date(detailsUser.date_of_birth).toLocaleDateString() : '—'],
                ['Joined', new Date(detailsUser.created_at).toLocaleString()],
                ['Status', detailsUser.is_demo ? 'Demo' : 'Active'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-border/50 pb-2">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-medium text-right break-all">{v as string}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 p-6 border-t border-border">
              <button onClick={() => setDetailsUser(null)} className="flex-1 py-2.5 rounded-xl border border-border font-medium text-sm hover:bg-muted">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;