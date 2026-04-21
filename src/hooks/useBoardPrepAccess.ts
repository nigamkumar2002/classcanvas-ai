import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Returns whether the current user should see Board Preparation in the sidebar.
 * - Admins/Super Admins/Developers: always see it for management.
 * - Students: only if their class_id is in board_prep_settings.enabled_class_ids.
 */
export function useBoardPrepAccess() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    if (['developer', 'super_admin', 'admin'].includes(user.role)) {
      setEnabled(true);
      setLoading(false);
      return;
    }
    if (user.role === 'student' && user.school_id && user.class_id) {
      (async () => {
        const { data } = await (supabase as any)
          .from('board_prep_settings')
          .select('enabled_class_ids')
          .eq('school_id', user.school_id)
          .maybeSingle();
        const list: string[] = data?.enabled_class_ids || [];
        setEnabled(list.includes(user.class_id!));
        setLoading(false);
      })();
    } else {
      setLoading(false);
    }
  }, [user]);

  return { enabled, loading };
}
