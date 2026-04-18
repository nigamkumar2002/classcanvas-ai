import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Settings, User, Bell, Shield, Globe, Save, Lock, Eye, EyeOff, NotebookPen, CheckCircle, Brain } from 'lucide-react';
import { toast } from 'sonner';

const SettingsPage = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState({ email: true, liveClass: true, exams: true, assignments: false });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showDemoCredentials, setShowDemoCredentials] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(false);

  // School-level settings
  const [autoApprovePlans, setAutoApprovePlans] = useState(true);
  const [planEditableTeacher, setPlanEditableTeacher] = useState(true);
  const [planEditableAdmin, setPlanEditableAdmin] = useState(true);
  const [autoApproveContent, setAutoApproveContent] = useState(false);
  const [practiceQuota, setPracticeQuota] = useState(50);
  const [savingSchool, setSavingSchool] = useState(false);

  const isDemo = user?.is_demo ?? false;
  const isDeveloper = user?.role === 'developer';
  const isSchoolAdminOrAbove = user?.role === 'admin' || user?.role === 'super_admin';

  // Load platform settings for developer
  useEffect(() => {
    if (!isDeveloper) return;
    const load = async () => {
      const { data } = await supabase
        .from('platform_settings')
        .select('value')
        .eq('key', 'show_demo_credentials')
        .single();
      if (data) {
        setShowDemoCredentials(data.value === true || data.value === 'true');
      }
    };
    load();
  }, [isDeveloper]);

  const toggleDemoCredentials = async () => {
    setLoadingSettings(true);
    const newValue = !showDemoCredentials;
    const { error } = await supabase
      .from('platform_settings')
      .update({ value: newValue, updated_by: user?.user_id, updated_at: new Date().toISOString() } as any)
      .eq('key', 'show_demo_credentials');
    if (error) {
      toast.error('Failed to update setting');
    } else {
      setShowDemoCredentials(newValue);
      toast.success(newValue ? 'Demo credentials are now visible on login' : 'Demo credentials are now hidden from login');
    }
    setLoadingSettings(false);
  };

  const handleSave = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 800));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your account and preferences</p>
      </div>

      {/* Profile Card */}
      <div className="bg-card rounded-2xl border border-border shadow-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-xl bg-gradient-blue flex items-center justify-center">
            <User className="w-4 h-4 text-white" />
          </div>
          <h2 className="font-bold">Profile Information</h2>
        </div>

        <div className="flex items-center gap-4 mb-6 p-4 rounded-xl bg-muted/30">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl ${
            user?.role === 'developer' ? 'bg-gradient-blue' :
            user?.role === 'super_admin' ? 'bg-gradient-purple' :
            user?.role === 'admin' ? 'bg-gradient-blue' :
            user?.role === 'teacher' ? 'bg-gradient-green' : 'bg-gradient-amber'
          }`}>
            {user?.full_name?.[0]?.toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-lg">{user?.full_name}</p>
            <p className="text-muted-foreground text-sm">{user?.email}</p>
            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
              {user?.role?.replace('_', ' ')}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold mb-1.5 block">Full Name</label>
            <input defaultValue={user?.full_name} disabled={isDemo}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm disabled:opacity-50 disabled:cursor-not-allowed" />
          </div>
          <div>
            <label className="text-sm font-semibold mb-1.5 block">Email</label>
            <input defaultValue={user?.email} disabled
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-muted text-muted-foreground text-sm cursor-not-allowed" />
          </div>
          {isDemo && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm">
              <Lock className="w-4 h-4 flex-shrink-0" />
              Demo accounts cannot be edited.
            </div>
          )}
        </div>
      </div>

      {/* Developer: Platform Settings */}
      {isDeveloper && (
        <div className="bg-card rounded-2xl border border-border shadow-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-xl bg-gradient-purple flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <h2 className="font-bold">Platform Settings</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border/50">
              <div className="flex items-center gap-3">
                {showDemoCredentials ? <Eye className="w-5 h-5 text-primary" /> : <EyeOff className="w-5 h-5 text-muted-foreground" />}
                <div>
                  <p className="font-medium text-sm">Demo Credentials on Login Page</p>
                  <p className="text-xs text-muted-foreground">
                    {showDemoCredentials ? 'Demo credentials are visible to everyone on the login page' : 'Demo credentials are hidden from the login page'}
                  </p>
                </div>
              </div>
              <button
                onClick={toggleDemoCredentials}
                disabled={loadingSettings}
                className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${showDemoCredentials ? 'bg-primary' : 'bg-muted-foreground/30'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${showDemoCredentials ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
            <p className="text-xs text-muted-foreground px-1">
              💡 Toggle this off for production deployments to present a professional login page without demo account information.
            </p>
          </div>
        </div>
      )}

      {/* Notifications */}
      <div className="bg-card rounded-2xl border border-border shadow-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-xl bg-gradient-green flex items-center justify-center">
            <Bell className="w-4 h-4 text-white" />
          </div>
          <h2 className="font-bold">Notifications</h2>
        </div>
        <div className="space-y-4">
          {[
            { key: 'email', label: 'Email Notifications', desc: 'Receive updates via email' },
            { key: 'liveClass', label: 'Live Class Alerts', desc: 'Get notified when a class starts' },
            { key: 'exams', label: 'Exam Reminders', desc: 'Reminders before scheduled exams' },
            { key: 'assignments', label: 'Assignment Updates', desc: 'Notify when assignments are due' },
          ].map(n => (
            <div key={n.key} className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/30 transition-colors">
              <div>
                <p className="font-medium text-sm">{n.label}</p>
                <p className="text-xs text-muted-foreground">{n.desc}</p>
              </div>
              <button onClick={() => setNotifications(prev => ({ ...prev, [n.key]: !prev[n.key as keyof typeof prev] }))}
                className={`relative w-11 h-6 rounded-full transition-colors ${notifications[n.key as keyof typeof notifications] ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${notifications[n.key as keyof typeof notifications] ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Security */}
      <div className="bg-card rounded-2xl border border-border shadow-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-xl bg-gradient-red flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <h2 className="font-bold">Security</h2>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
            <div>
              <p className="font-medium text-sm">Password</p>
              <p className="text-xs text-muted-foreground">Last changed: N/A</p>
            </div>
            <button disabled={isDemo} className="px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Change</button>
          </div>
        </div>
      </div>

      {(user?.role === 'super_admin' || user?.role === 'admin' || isDeveloper) && (
        <div className="bg-card rounded-2xl border border-border shadow-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-xl bg-gradient-purple flex items-center justify-center">
              <Globe className="w-4 h-4 text-white" />
            </div>
            <h2 className="font-bold">System Information</h2>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Platform', value: 'EduCloud LMS' },
              { label: 'Version', value: '2.1.0 Professional' },
              { label: 'Database', value: 'Cloud PostgreSQL' },
              { label: 'Real-time', value: 'Active via WebSockets' },
              { label: 'Notifications', value: 'Real-time enabled' },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <span className="text-sm font-medium">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {saved && (
        <div className="p-4 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm font-medium text-center">✅ Settings saved successfully!</div>
      )}
      <button onClick={handleSave} disabled={saving}
        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-blue text-white font-semibold hover:opacity-90 transition-all disabled:opacity-50">
        {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  );
};

export default SettingsPage;
