import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Megaphone, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Announcement {
  id: string;
  title: string;
  message: string;
  type: string;
  created_at: string;
}

const TYPE_STYLES: Record<string, string> = {
  info: 'bg-primary/10 border-primary/20 text-primary',
  warning: 'bg-amber-50 border-amber-200 text-amber-700',
  success: 'bg-green-50 border-green-200 text-green-700',
  urgent: 'bg-destructive/10 border-destructive/20 text-destructive',
};

const AnnouncementBanner = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('announcements')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(3);
      setAnnouncements((data as Announcement[]) || []);
    };
    fetch();
  }, []);

  const visible = announcements.filter(a => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {visible.map(a => (
        <div key={a.id} className={cn('flex items-center gap-3 p-3 rounded-xl border', TYPE_STYLES[a.type] || TYPE_STYLES.info)}>
          <Megaphone className="w-4 h-4 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold">{a.title}</span>
            {a.message && <span className="text-sm ml-1 opacity-80">— {a.message}</span>}
          </div>
          <button onClick={() => setDismissed(prev => new Set(prev).add(a.id))} className="p-1 rounded-lg hover:bg-black/5">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};

export default AnnouncementBanner;
