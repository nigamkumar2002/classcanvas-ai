import React, { useEffect, useState } from 'react';
import { X, CheckCircle, XCircle, RotateCcw, ExternalLink, FileText, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface Props {
  contentType: string;
  contentId: string;
  approvalId: string;
  onClose: () => void;
  onReviewed: () => void;
}

const ContentPreviewModal: React.FC<Props> = ({ contentType, contentId, approvalId, onClose, onReviewed }) => {
  const { user } = useAuth();
  const [content, setContent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reviewComment, setReviewComment] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [extraInfo, setExtraInfo] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchData = async () => {
      const table = contentType === 'material' ? 'materials'
        : contentType === 'class' ? 'classes'
        : contentType === 'chapter' ? 'chapters'
        : null;
      if (!table) { setLoading(false); return; }

      const { data } = await supabase.from(table).select('*').eq('id', contentId).single();
      setContent(data);

      // Fetch context info
      const info: Record<string, string> = {};
      if (data) {
        const d = data as any;
        if (contentType === 'material' && d.chapter_id) {
          const { data: ch } = await supabase.from('chapters').select('name, subject_id').eq('id', d.chapter_id).single();
          if (ch) {
            info.chapter = ch.name;
            const { data: sub } = await supabase.from('subjects').select('name, class_id').eq('id', ch.subject_id).single();
            if (sub) {
              info.subject = sub.name;
              const { data: cls } = await supabase.from('classes').select('name').eq('id', sub.class_id).single();
              if (cls) info.class = cls.name;
            }
          }
        }
        if (contentType === 'chapter' && d.subject_id) {
          const { data: sub } = await supabase.from('subjects').select('name, class_id').eq('id', d.subject_id).single();
          if (sub) {
            info.subject = sub.name;
            const { data: cls } = await supabase.from('classes').select('name').eq('id', sub.class_id).single();
            if (cls) info.class = cls.name;
          }
        }
        if (contentType === 'class' && d.school_id) {
          const { data: sch } = await supabase.from('schools').select('name').eq('id', d.school_id).single();
          if (sch) info.school = sch.name;
        }
      }
      setExtraInfo(info);
      setLoading(false);
    };
    fetchData();
  }, [contentType, contentId]);

  const handleReview = async (status: string) => {
    setActionLoading(true);
    try {
      await supabase.from('content_approvals').update({
        status,
        reviewer_id: user?.user_id,
        comments: reviewComment || null,
        updated_at: new Date().toISOString(),
      } as any).eq('id', approvalId);

      const table = contentType === 'material' ? 'materials'
        : contentType === 'class' ? 'classes'
        : contentType === 'chapter' ? 'chapters'
        : null;

      if (table) {
        await supabase.from(table).update({
          is_active: status === 'approved',
        } as any).eq('id', contentId);
      }

      toast.success(status === 'approved' ? 'Content approved!' : status === 'rejected' ? 'Content rejected' : 'Revision requested');
      onReviewed();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed');
    } finally {
      setActionLoading(false);
    }
  };

  const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'developer';

  if (loading) return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-card rounded-2xl p-8"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
    </div>
  );

  if (!content) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-card rounded-2xl border border-border shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-bold">Content Preview</h2>
            <p className="text-sm text-muted-foreground capitalize">{contentType}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-xl"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Content details */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground w-20">Title:</span>
              <span className="text-sm font-semibold">{content.title || content.name}</span>
            </div>
            {content.description && (
              <div className="flex items-start gap-2">
                <span className="text-sm font-medium text-muted-foreground w-20">Description:</span>
                <span className="text-sm">{content.description}</span>
              </div>
            )}
            {content.type && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground w-20">Type:</span>
                <span className="text-sm capitalize">{content.type.replace('_', ' ')}</span>
              </div>
            )}
            {Object.entries(extraInfo).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground w-20 capitalize">{k}:</span>
                <span className="text-sm">{v}</span>
              </div>
            ))}
            {content.file_name && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground w-20">File:</span>
                <span className="text-sm">{content.file_name}</span>
              </div>
            )}
          </div>

          {/* File preview */}
          {content.file_url && (
            <div className="border border-border rounded-xl overflow-hidden">
              {content.file_type?.startsWith('image/') ? (
                <img src={content.file_url} alt={content.title || 'Preview'} className="max-h-96 w-full object-contain bg-muted/20" />
              ) : content.file_type === 'application/pdf' ? (
                <iframe src={content.file_url} className="w-full h-96" title="PDF Preview" />
              ) : content.file_type?.startsWith('video/') ? (
                <video controls className="w-full max-h-96">
                  <source src={content.file_url} type={content.file_type} />
                </video>
              ) : (
                <div className="p-8 text-center">
                  <FileText className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">Preview not available for this file type</p>
                  <a href={content.file_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90">
                    <Download className="w-4 h-4" /> Download File
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Super admin final warning */}
          {isSuperAdmin && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              <strong>⚠️ Final Submission:</strong> Your approval is final. Content will be published to students immediately.
            </div>
          )}

          {/* Review actions */}
          <div className="border-t border-border pt-4 space-y-3">
            <textarea value={reviewComment} onChange={e => setReviewComment(e.target.value)}
              placeholder="Add review comment (optional)..."
              className="w-full p-3 text-sm rounded-xl border border-border bg-background resize-none focus:ring-2 focus:ring-primary/20" rows={2} />
            <div className="flex flex-wrap gap-2">
              <button onClick={() => handleReview('approved')} disabled={actionLoading}
                className="flex items-center gap-1 px-4 py-2 text-sm bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50">
                <CheckCircle className="w-4 h-4" /> Approve
              </button>
              <button onClick={() => handleReview('rejected')} disabled={actionLoading}
                className="flex items-center gap-1 px-4 py-2 text-sm bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50">
                <XCircle className="w-4 h-4" /> Reject
              </button>
              <button onClick={() => handleReview('revision_requested')} disabled={actionLoading}
                className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50">
                <RotateCcw className="w-4 h-4" /> Request Revision
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContentPreviewModal;
