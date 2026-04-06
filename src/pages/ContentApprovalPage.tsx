import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle, XCircle, Clock, Eye, MessageSquare, Filter } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Approval {
  id: string;
  content_type: string;
  content_id: string;
  content_title: string;
  status: string;
  submitted_by: string;
  reviewer_id: string | null;
  comments: string | null;
  school_id: string | null;
  created_at: string;
  submitter_name?: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending' },
  approved: { bg: 'bg-green-100', text: 'text-green-700', label: 'Approved' },
  rejected: { bg: 'bg-red-100', text: 'text-red-700', label: 'Rejected' },
  revision_requested: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Revision Requested' },
};

const ContentApprovalPage = () => {
  const { user } = useAuth();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [reviewComment, setReviewComment] = useState('');
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const isReviewer = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'developer';

  const fetchApprovals = async () => {
    const { data, error } = await supabase
      .from('content_approvals')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { console.error(error); return; }

    const userIds = [...new Set((data || []).map(a => a.submitted_by))];
    let profileMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('user_id, full_name').in('user_id', userIds);
      profiles?.forEach(p => { profileMap[p.user_id] = p.full_name; });
    }

    setApprovals((data || []).map(a => ({ ...a, submitter_name: profileMap[a.submitted_by] || 'Unknown' })));
    setLoading(false);
  };

  useEffect(() => { fetchApprovals(); }, []);

  const handleReview = async (id: string, status: string) => {
    const { error } = await supabase.from('content_approvals').update({
      status, reviewer_id: user?.id, comments: reviewComment || null, updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Success', description: `Content ${status}` });
    setReviewingId(null);
    setReviewComment('');
    fetchApprovals();
  };

  const filtered = filter === 'all' ? approvals : approvals.filter(a => a.status === filter);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Content Approvals</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {isReviewer ? 'Review and approve content submissions' : 'Track your content submissions'}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground" />
        {['all', 'pending', 'approved', 'rejected', 'revision_requested'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
            {s === 'all' ? 'All' : STATUS_STYLES[s]?.label || s}
            {s !== 'all' && <span className="ml-1">({approvals.filter(a => a.status === s).length})</span>}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-border">
          <Clock className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">No approval requests found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(a => {
            const style = STATUS_STYLES[a.status] || STATUS_STYLES.pending;
            return (
              <div key={a.id} className="bg-card rounded-xl border border-border p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>{style.label}</span>
                      <span className="text-xs text-muted-foreground capitalize">{a.content_type}</span>
                    </div>
                    <h3 className="font-semibold truncate">{a.content_title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">Submitted by {a.submitter_name} • {new Date(a.created_at).toLocaleDateString()}</p>
                    {a.comments && (
                      <div className="mt-2 p-2 rounded-lg bg-muted/50 text-sm flex items-start gap-2">
                        <MessageSquare className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                        <span>{a.comments}</span>
                      </div>
                    )}
                  </div>
                  {isReviewer && a.status === 'pending' && (
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      {reviewingId === a.id ? (
                        <div className="space-y-2 w-48">
                          <textarea value={reviewComment} onChange={e => setReviewComment(e.target.value)}
                            placeholder="Add comment..." className="w-full p-2 text-sm rounded-lg border border-border bg-background resize-none" rows={2} />
                          <div className="flex gap-1">
                            <button onClick={() => handleReview(a.id, 'approved')} className="flex-1 px-2 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700">Approve</button>
                            <button onClick={() => handleReview(a.id, 'rejected')} className="flex-1 px-2 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700">Reject</button>
                            <button onClick={() => handleReview(a.id, 'revision_requested')} className="flex-1 px-2 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">Revise</button>
                          </div>
                          <button onClick={() => setReviewingId(null)} className="text-xs text-muted-foreground hover:underline w-full text-center">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setReviewingId(a.id)} className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:opacity-90 flex items-center gap-1">
                          <Eye className="w-3 h-3" /> Review
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ContentApprovalPage;
