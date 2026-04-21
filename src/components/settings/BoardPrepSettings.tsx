import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { GraduationCap, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const BoardPrepSettings: React.FC = () => {
  const { user } = useAuth();
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [enabledIds, setEnabledIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.school_id) return;
    (async () => {
      const [{ data: cls }, { data: settings }] = await Promise.all([
        supabase.from('classes').select('id, name, grade_level').eq('school_id', user.school_id).eq('grade_level', 10) as any,
        (supabase as any).from('board_prep_settings').select('enabled_class_ids').eq('school_id', user.school_id).maybeSingle(),
      ]);
      setClasses(cls || []);
      setEnabledIds(settings?.enabled_class_ids || []);
      setLoading(false);
    })();
  }, [user?.school_id]);

  const toggle = (id: string) => {
    setEnabledIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const save = async () => {
    if (!user?.school_id) return;
    setSaving(true);
    const { error } = await (supabase as any).from('board_prep_settings').upsert({
      school_id: user.school_id,
      enabled_class_ids: enabledIds,
      updated_by: user.user_id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'school_id' });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success('Board Preparation access updated');
  };

  if (user?.role !== 'super_admin' && user?.role !== 'developer') return null;

  return (
    <div className="bg-card border rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <GraduationCap className="w-5 h-5 text-primary" />
        <h2 className="font-bold text-lg">BSEB Board Preparation Access</h2>
      </div>
      <p className="text-sm text-muted-foreground">Enable Class 10 sections to access PYQ mock tests, chapter practice, and smart revision.</p>
      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : classes.length === 0 ? (
        <p className="text-sm text-muted-foreground bg-muted/40 p-4 rounded-lg">No Class 10 found in this school. Create a class with grade level 10 first.</p>
      ) : (
        <div className="space-y-2">
          {classes.map(c => (
            <label key={c.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/40 cursor-pointer">
              <input type="checkbox" checked={enabledIds.includes(c.id)} onChange={() => toggle(c.id)} className="w-4 h-4" />
              <span className="font-medium">{c.name}</span>
              <span className="text-xs text-muted-foreground ml-auto">Class 10</span>
            </label>
          ))}
        </div>
      )}
      <button onClick={save} disabled={saving || loading} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium flex items-center gap-2 disabled:opacity-50">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save Changes
      </button>
    </div>
  );
};

export default BoardPrepSettings;
