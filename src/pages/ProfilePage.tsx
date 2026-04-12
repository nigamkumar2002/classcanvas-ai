import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { User, Lock, Save, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

const ProfilePage = () => {
  const { user } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  // Content approval toggle for super_admin
  const [approvalRequired, setApprovalRequired] = useState(true);
  const [loadingApproval, setLoadingApproval] = useState(false);
  const isSuperAdmin = user?.role === 'super_admin';
  const isDemo = user?.is_demo ?? false;

  useEffect(() => {
    if (!isSuperAdmin || !user?.school_id) return;
    const load = async () => {
      const { data } = await supabase
        .from('school_settings' as any)
        .select('value')
        .eq('school_id', user.school_id)
        .eq('key', 'require_content_approval')
        .single();
      if (data) {
        setApprovalRequired(data.value === true || data.value === 'true');
      }
    };
    load();
  }, [isSuperAdmin, user?.school_id]);

  const toggleApproval = async () => {
    if (!user?.school_id) return;
    setLoadingApproval(true);
    const newValue = !approvalRequired;
    
    // Upsert the setting
    const { error } = await supabase
      .from('school_settings' as any)
      .upsert({
        school_id: user.school_id,
        key: 'require_content_approval',
        value: newValue,
        updated_by: user.user_id,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: 'school_id,key' });
    
    if (error) {
      toast.error('Failed to update approval setting');
    } else {
      setApprovalRequired(newValue);
      toast.success(newValue 
        ? 'Content approval is now required for teachers and admins' 
        : 'Content approval is now disabled — all content will be published automatically');
    }
    setLoadingApproval(false);
  };

  const handleSaveProfile = async () => {
    if (!fullName.trim()) { toast.error('Name cannot be empty'); return; }
    setSavingProfile(true);
    try {
      const { error } = await supabase.from('profiles').update({
        full_name: fullName.trim(),
        updated_at: new Date().toISOString(),
      }).eq('user_id', user?.user_id);
      if (error) throw error;
      toast.success('Profile updated successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!oldPassword) { toast.error('Enter your current password'); return; }
    if (newPassword.length < 6) { toast.error('New password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }

    setChangingPw(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: oldPassword,
      });
      if (signInError) { toast.error('Current password is incorrect'); setChangingPw(false); return; }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      toast.success('Password changed successfully!');
      setOldPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to change password');
    } finally {
      setChangingPw(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">My Profile</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your personal information and security</p>
      </div>

      {/* Profile Info */}
      <div className="bg-card rounded-2xl border border-border shadow-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
            <User className="w-4 h-4 text-primary-foreground" />
          </div>
          <h2 className="font-bold">Profile Information</h2>
        </div>

        <div className="flex items-center gap-4 mb-6 p-4 rounded-xl bg-muted/30">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center text-primary-foreground font-bold text-xl ${
            user?.role === 'developer' ? 'bg-gradient-to-br from-cyan-500 to-blue-600' :
            user?.role === 'super_admin' ? 'bg-gradient-to-br from-purple-500 to-violet-600' :
            user?.role === 'admin' ? 'bg-gradient-to-br from-blue-500 to-indigo-600' :
            user?.role === 'teacher' ? 'bg-gradient-to-br from-emerald-500 to-green-600' : 'bg-gradient-to-br from-amber-500 to-orange-600'
          }`}>
            {user?.full_name?.[0]?.toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-lg">{user?.full_name}</p>
            <p className="text-muted-foreground text-sm">{user?.email}</p>
            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary capitalize">
              {user?.role?.replace('_', ' ')}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold mb-1.5 block">Full Name</label>
            <input value={fullName} onChange={e => setFullName(e.target.value)} disabled={isDemo}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm disabled:opacity-50" />
          </div>
          <div>
            <label className="text-sm font-semibold mb-1.5 block">Email</label>
            <input value={user?.email || ''} disabled
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-muted text-muted-foreground text-sm cursor-not-allowed" />
          </div>
          {!isDemo && (
            <button onClick={handleSaveProfile} disabled={savingProfile}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-50">
              {savingProfile ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
              {savingProfile ? 'Saving...' : 'Save Profile'}
            </button>
          )}
        </div>
      </div>

      {/* Content Approval Toggle - Super Admin only */}
      {isSuperAdmin && (
        <div className="bg-card rounded-2xl border border-border shadow-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <h2 className="font-bold">Content Approval</h2>
          </div>
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border/50">
            <div>
              <p className="font-medium text-sm">Require approval for teacher/admin content</p>
              <p className="text-xs text-muted-foreground mt-1">
                {approvalRequired 
                  ? 'When enabled, teachers and admins must submit new content for approval before it becomes visible.'
                  : 'When disabled, new school content is published automatically.'}
              </p>
            </div>
            <button
              onClick={toggleApproval}
              disabled={loadingApproval}
              className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${approvalRequired ? 'bg-primary' : 'bg-muted-foreground/30'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${approvalRequired ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-3 px-1">
            💡 Turn this off when you want teachers to upload bulk content without waiting for approval. Turn it back on when you want to review new submissions.
          </p>
        </div>
      )}

      {/* Change Password */}
      <div className="bg-card rounded-2xl border border-border shadow-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center">
            <Lock className="w-4 h-4 text-white" />
          </div>
          <h2 className="font-bold">Change Password</h2>
        </div>

        {isDemo ? (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm flex items-center gap-2">
            <Lock className="w-4 h-4" /> Demo accounts cannot change passwords.
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold mb-1.5 block">Current Password *</label>
              <div className="relative">
                <input type={showOld ? 'text' : 'password'} value={oldPassword} onChange={e => setOldPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full px-4 py-2.5 pr-10 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
                <button type="button" onClick={() => setShowOld(!showOld)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold mb-1.5 block">New Password *</label>
              <div className="relative">
                <input type={showNew ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full px-4 py-2.5 pr-10 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
                <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold mb-1.5 block">Confirm New Password *</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
            </div>
            <button onClick={handleChangePassword} disabled={changingPw}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-50">
              {changingPw ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <Lock className="w-4 h-4" />}
              {changingPw ? 'Changing...' : 'Change Password'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;
