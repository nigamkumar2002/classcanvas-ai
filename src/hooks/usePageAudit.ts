import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// Logs every page visit to audit_logs (debounced per route per session)
const seen = new Set<string>();

export const usePageAudit = () => {
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.user_id) return;
    const key = `${user.user_id}::${location.pathname}`;
    if (seen.has(key)) return;
    seen.add(key);
    supabase.from('audit_logs').insert({
      user_id: user.user_id,
      school_id: user.school_id || null,
      action: 'page_visit',
      entity_type: 'navigation',
      details: { path: location.pathname, search: location.search } as any,
    }).then(() => {});
  }, [location.pathname, user?.user_id, user?.school_id, location.search]);
};
