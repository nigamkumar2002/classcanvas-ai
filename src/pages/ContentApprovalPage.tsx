import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle, XCircle, Clock, Eye, MessageSquare, Filter, RotateCcw, ShieldCheck, FileText, BookOpen, GraduationCap, ClipboardList } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import ExamPreviewModal from '@/components/approval/ExamPreviewModal';
import ContentPreviewModal from '@/components/approval/ContentPreviewModal';

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
  updated_at: string;
  submitter_name?: string;
  submitter_role?: string;
  // Extra context
  class_name?: string;
  subject_name?: string;
  chapter_name?: string;
  school_name?: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string; icon: React.ElementType }> = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending', icon: Clock },
  approved: { bg: 'bg-green-100', text: 'text-green-700', label: 'Approved', icon: CheckCircle },
  rejected: { bg: 'bg-red-100', text: 'text-red-700', label: 'Rejected', icon: XCircle },
  revision_requested: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Revision Requested', icon: RotateCcw },
};

const CONTENT_ICONS: Record<string, React.ElementType> = {
  class: GraduationCap,
  subject: BookOpen,
  chapter: FileText,
  material: FileText,
  exam: ClipboardList,
};

const ContentApprovalPage = () => {
  const { user } = useAuth();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [previewExam, setPreviewExam] = useState<{ examId: string; approvalId: string } | null>(null);
  const [previewContent, setPreviewContent] = useState<{ contentType: string; contentId: string; approvalId: string } | null>(null);

  const canReview = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'developer';

  const fetchApprovals = async () => {
    const { data, error } = await supabase
      .from('content_approvals')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { console.error(error); setLoading(false); return; }

    const userIds = [...new Set((data || []).map(a => a.submitted_by))];
    let profileMap: Record<string, { name: string; role: string }> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('user_id, full_name, role').in('user_id', userIds);
      profiles?.forEach(p => { profileMap[p.user_id] = { name: p.full_name, role: p.role }; });
    }

    // Fetch context info for each approval
    const enriched: Approval[] = [];
    for (const a of (data || [])) {
      const item: Approval = {
        ...a,
        submitter_name: profileMap[a.submitted_by]?.name || 'Unknown',
        submitter_role: profileMap[a.submitted_by]?.role || 'unknown',
      };

      // Fetch hierarchy info
      try {
        if (a.content_type === 'exam') {
          const { data: exam } = await supabase.from('exams').select('chapter_id').eq('id', a.content_id).single();
          if (exam) {
            const { data: ch } = await supabase.from('chapters').select('name, subject_id').eq('id', exam.chapter_id).single();
            if (ch) {
              item.chapter_name = ch.name;
              const { data: sub } = await supabase.from('subjects').select('name, class_id').eq('id', ch.subject_id).single();
              if (sub) {
                item.subject_name = sub.name;
                const { data: cls } = await supabase.from('classes').select('name, school_id').eq('id', sub.class_id).single();
                if (cls) {
                  item.class_name = cls.name;
                  if (cls.school_id) {
                    const { data: sch } = await supabase.from('schools').select('name').eq('id', cls.school_id).single();
                    if (sch) item.school_name = sch.name;
                  }
                }
              }
            }
          }
        } else if (a.content_type === 'material') {
          const { data: mat } = await supabase.from('materials').select('chapter_id').eq('id', a.content_id).single();
          if (mat) {
            const { data: ch } = await supabase.from('chapters').select('name, subject_id').eq('id', mat.chapter_id).single();
            if (ch) {
              item.chapter_name = ch.name;
              const { data: sub } = await supabase.from('subjects').select('name, class_id').eq('id', ch.subject_id).single();
              if (sub) {
                item.subject_name = sub.name;
                const { data: cls } = await supabase.from('classes').select('name').eq('id', sub.class_id).single();
                if (cls) item.class_name = cls.name;
              }
            }
          }
        } else if (a.content_type === 'chapter') {
          const { data: ch } = await supabase.from('chapters').select('name, subject_id').eq('id', a.content_id).single();
          if (ch) {
            item.chapter_name = ch.name;
            const { data: sub } = await supabase.from('subjects').select('name, class_id').eq('id', ch.subject_id).single();
            if (sub) {
              item.subject_name = sub.name;
              const { data: cls } = await supabase.from('classes').select('name').eq('id', sub.class_id).single();
              if (cls) item.class_name = cls.name;
            }
          }
        } else if (a.content_type === 'class') {
          const { data: cls } = await supabase.from('classes').select('name, school_id').eq('id', a.content_id).single();
          if (cls) {
            item.class_name = cls.name;
            if (cls.school_id) {
              const { data: sch } = await supabase.from('schools').select('name').eq('id', cls.school_id).single();
              if (sch) item.school_name = sch.name;
            }
          }
        }
      } catch { /* ignore context fetch errors */ }

      enriched.push(item);
    }

    setApprovals(enriched);
    setLoading(false);
  };

  useEffect(() => { fetchApprovals(); }, []);

  const canReviewItem = (approval: Approval) => {
    if (user?.role === 'developer') return true;
    if (user?.role === 'admin' && approval.submitter_role === 'teacher') return true;
    if (user?.role === 'super_admin' && (approval.submitter_role === 'admin' || approval.submitter_role === 'teacher')) return true;
    return false;
  };

  const handleOpenPreview = (approval: Approval) => {
    if (approval.content_type === 'exam') {
      setPreviewExam({ examId: approval.content_id, approvalId: approval.id });
    } else {
      setPreviewContent({ contentType: approval.content_type, contentId: approval.content_id, approvalId: approval.id });
    }
  };

  const filtered = filter === 'all' ? approvals : approvals.filter(a => a.status === filter);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="w-7 h-7 text-primary" /> Content Approvals
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {canReview ? 'Review and approve content submissions from your team' : 'Track your content submissions and their approval status'}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Pending', count: approvals.filter(a => a.status === 'pending').length, color: 'text-amber-600 bg-amber-50 border-amber-200' },
          { label: 'Approved', count: approvals.filter(a => a.status === 'approved').length, color: 'text-green-600 bg-green-50 border-green-200' },
          { label: 'Rejected', count: approvals.filter(a => a.status === 'rejected').length, color: 'text-red-600 bg-red-50 border-red-200' },
          { label: 'Revision', count: approvals.filter(a => a.status === 'revision_requested').length, color: 'text-blue-600 bg-blue-50 border-blue-200' },
        ].map(s => (
          <div key={s.label} className={`p-3 rounded-xl border ${s.color}`}>
            <p className="text-2xl font-bold">{s.count}</p>
            <p className="text-xs font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
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

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-border">
          <Clock className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground font-medium">No approval requests found</p>
          <p className="text-xs text-muted-foreground mt-1">Content submissions will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(a => {
            const style = STATUS_STYLES[a.status] || STATUS_STYLES.pending;
            const ContentIcon = CONTENT_ICONS[a.content_type] || FileText;
            const StatusIcon = style.icon;
            const showReview = canReview && a.status === 'pending' && canReviewItem(a);

            return (
              <div key={a.id} className="bg-card rounded-xl border border-border p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${style.bg}`}>
                      <ContentIcon className={`w-5 h-5 ${style.text}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
                          <StatusIcon className="w-3 h-3" />
                          {style.label}
                        </span>
                        <span className="text-xs text-muted-foreground capitalize px-2 py-0.5 rounded bg-muted">{a.content_type}</span>
                      </div>
                      <h3 className="font-semibold truncate">{a.content_title}</h3>

                      {/* Context details */}
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                        {a.school_name && <span>🏫 {a.school_name}</span>}
                        {a.class_name && <span>📚 {a.class_name}</span>}
                        {a.subject_name && <span>📖 {a.subject_name}</span>}
                        {a.chapter_name && <span>📄 {a.chapter_name}</span>}
                      </div>

                      <p className="text-sm text-muted-foreground mt-1">
                        Submitted by <span className="font-medium text-foreground">{a.submitter_name}</span>
                        <span className="capitalize text-xs ml-1">({a.submitter_role})</span>
                        {' · '}{new Date(a.created_at).toLocaleDateString()} {new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {a.comments && (
                        <div className="mt-2 p-2.5 rounded-lg bg-muted/50 text-sm flex items-start gap-2">
                          <MessageSquare className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                          <span>{a.comments}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 flex-shrink-0">
                    {/* Open/Preview button - always visible for reviewers */}
                    {canReview && canReviewItem(a) && (
                      <button onClick={() => handleOpenPreview(a)}
                        className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:opacity-90 flex items-center gap-1">
                        <Eye className="w-3 h-3" /> {a.status === 'pending' ? 'Review & Preview' : 'View Details'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Exam preview modal */}
      {previewExam && (
        <ExamPreviewModal
          examId={previewExam.examId}
          approvalId={previewExam.approvalId}
          mode="review"
          onClose={() => setPreviewExam(null)}
          onApproved={fetchApprovals}
        />
      )}

      {/* Content preview modal */}
      {previewContent && (
        <ContentPreviewModal
          contentType={previewContent.contentType}
          contentId={previewContent.contentId}
          approvalId={previewContent.approvalId}
          onClose={() => setPreviewContent(null)}
          onReviewed={fetchApprovals}
        />
      )}
    </div>
  );
};

export default ContentApprovalPage;
