import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  CheckCheck,
  CheckCircle,
  Clock,
  Eye,
  FileText,
  Filter,
  GraduationCap,
  Loader2,
  MessageSquare,
  RotateCcw,
  Search,
  ShieldCheck,
  XCircle,
  BookOpen,
  ClipboardList,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import ExamPreviewModal from '@/components/approval/ExamPreviewModal';
import ContentPreviewModal from '@/components/approval/ContentPreviewModal';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

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
  class_name?: string;
  subject_name?: string;
  chapter_name?: string;
  school_name?: string;
}

interface ApprovalStats {
  pending: number;
  approved: number;
  rejected: number;
  revision_requested: number;
  total: number;
}

const PAGE_SIZE = 50;

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

const ACTIVATION_TABLES: Record<string, string | undefined> = {
  class: 'classes',
  chapter: 'chapters',
  material: 'materials',
  exam: 'exams',
};

const uniq = (values: Array<string | null | undefined>) => [...new Set(values.filter(Boolean) as string[])];

const ContentApprovalPage = () => {
  const { user } = useAuth();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [stats, setStats] = useState<ApprovalStats>({
    pending: 0,
    approved: 0,
    rejected: 0,
    revision_requested: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const [previewExam, setPreviewExam] = useState<{ examId: string; approvalId: string } | null>(null);
  const [previewContent, setPreviewContent] = useState<{ contentType: string; contentId: string; approvalId: string } | null>(null);

  const debouncedSearch = useDebouncedValue(searchQuery, 250);
  const canReview = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'developer';

  const canReviewItem = useCallback((approval: Approval) => {
    if (user?.role === 'developer') return true;
    if (user?.role === 'admin' && approval.submitter_role === 'teacher') return true;
    if (user?.role === 'super_admin' && (approval.submitter_role === 'admin' || approval.submitter_role === 'teacher')) return true;
    return false;
  }, [user?.role]);

  const fetchRowsByIds = useCallback(async (
    table: string,
    idColumn: string,
    columns: string,
    ids: string[],
  ) => {
    if (ids.length === 0) return [] as any[];

    const { data, error } = await (supabase as any)
      .from(table)
      .select(columns)
      .in(idColumn, ids);

    if (error) throw error;
    return data || [];
  }, []);

  const enrichApprovals = useCallback(async (rows: Approval[]) => {
    if (rows.length === 0) return [];

    const userIds = uniq(rows.map((row) => row.submitted_by));
    const schoolIds = uniq(rows.map((row) => row.school_id));
    const examIds = uniq(rows.filter((row) => row.content_type === 'exam').map((row) => row.content_id));
    const materialIds = uniq(rows.filter((row) => row.content_type === 'material').map((row) => row.content_id));
    const directChapterIds = uniq(rows.filter((row) => row.content_type === 'chapter').map((row) => row.content_id));
    const directSubjectIds = uniq(rows.filter((row) => row.content_type === 'subject').map((row) => row.content_id));
    const directClassIds = uniq(rows.filter((row) => row.content_type === 'class').map((row) => row.content_id));

    const [profiles, schools, exams, materials] = await Promise.all([
      fetchRowsByIds('profiles', 'user_id', 'user_id, full_name, role', userIds),
      fetchRowsByIds('schools', 'id', 'id, name', schoolIds),
      fetchRowsByIds('exams', 'id', 'id, chapter_id', examIds),
      fetchRowsByIds('materials', 'id', 'id, chapter_id', materialIds),
    ]);

    const examChapterIds = uniq(exams.map((exam: any) => exam.chapter_id));
    const materialChapterIds = uniq(materials.map((material: any) => material.chapter_id));
    const allChapterIds = uniq([...directChapterIds, ...examChapterIds, ...materialChapterIds]);
    const chapters = await fetchRowsByIds('chapters', 'id', 'id, name, subject_id', allChapterIds);

    const chapterSubjectIds = uniq(chapters.map((chapter: any) => chapter.subject_id));
    const allSubjectIds = uniq([...directSubjectIds, ...chapterSubjectIds]);
    const subjects = await fetchRowsByIds('subjects', 'id', 'id, name, class_id', allSubjectIds);

    const subjectClassIds = uniq(subjects.map((subject: any) => subject.class_id));
    const allClassIds = uniq([...directClassIds, ...subjectClassIds]);
    const classes = await fetchRowsByIds('classes', 'id', 'id, name, school_id', allClassIds);

    const classSchoolIds = uniq(classes.map((classItem: any) => classItem.school_id));
    const missingSchoolIds = classSchoolIds.filter((schoolId) => !schoolIds.includes(schoolId));
    const extraSchools = await fetchRowsByIds('schools', 'id', 'id, name', missingSchoolIds);

    const profileMap = new Map(profiles.map((profile: any) => [profile.user_id, profile]));
    const schoolMap = new Map([...schools, ...extraSchools].map((school: any) => [school.id, school]));
    const examMap = new Map(exams.map((exam: any) => [exam.id, exam]));
    const materialMap = new Map(materials.map((material: any) => [material.id, material]));
    const chapterMap = new Map(chapters.map((chapter: any) => [chapter.id, chapter]));
    const subjectMap = new Map(subjects.map((subject: any) => [subject.id, subject]));
    const classMap = new Map(classes.map((classItem: any) => [classItem.id, classItem]));

    return rows.map((row) => {
      const submitter = profileMap.get(row.submitted_by);

      let chapterName = '';
      let subjectName = '';
      let className = '';
      let derivedSchoolId = row.school_id || null;

      if (row.content_type === 'exam') {
        const exam: any = examMap.get(row.content_id);
        const chapter: any = exam ? chapterMap.get(exam.chapter_id) : null;
        const subject: any = chapter ? subjectMap.get(chapter.subject_id) : null;
        const classItem: any = subject ? classMap.get(subject.class_id) : null;
        chapterName = chapter?.name || '';
        subjectName = subject?.name || '';
        className = classItem?.name || '';
        derivedSchoolId = derivedSchoolId || classItem?.school_id || null;
      } else if (row.content_type === 'material') {
        const material: any = materialMap.get(row.content_id);
        const chapter: any = material ? chapterMap.get(material.chapter_id) : null;
        const subject: any = chapter ? subjectMap.get(chapter.subject_id) : null;
        const classItem: any = subject ? classMap.get(subject.class_id) : null;
        chapterName = chapter?.name || '';
        subjectName = subject?.name || '';
        className = classItem?.name || '';
        derivedSchoolId = derivedSchoolId || classItem?.school_id || null;
      } else if (row.content_type === 'chapter') {
        const chapter: any = chapterMap.get(row.content_id);
        const subject: any = chapter ? subjectMap.get(chapter.subject_id) : null;
        const classItem: any = subject ? classMap.get(subject.class_id) : null;
        chapterName = chapter?.name || '';
        subjectName = subject?.name || '';
        className = classItem?.name || '';
        derivedSchoolId = derivedSchoolId || classItem?.school_id || null;
      } else if (row.content_type === 'subject') {
        const subject: any = subjectMap.get(row.content_id);
        const classItem: any = subject ? classMap.get(subject.class_id) : null;
        subjectName = subject?.name || '';
        className = classItem?.name || '';
        derivedSchoolId = derivedSchoolId || classItem?.school_id || null;
      } else if (row.content_type === 'class') {
        const classItem: any = classMap.get(row.content_id);
        className = classItem?.name || '';
        derivedSchoolId = derivedSchoolId || classItem?.school_id || null;
      }

      const sub: any = submitter;
      return {
        ...row,
        submitter_name: sub?.full_name || 'Unknown',
        submitter_role: sub?.role || 'unknown',
        chapter_name: chapterName || undefined,
        subject_name: subjectName || undefined,
        class_name: className || undefined,
        school_name: derivedSchoolId ? schoolMap.get(derivedSchoolId)?.name || undefined : undefined,
      };
    });
  }, [fetchRowsByIds]);

  const fetchStats = useCallback(async () => {
    try {
      const buildCountQuery = (status: string) =>
        supabase
          .from('content_approvals')
          .select('*', { count: 'exact', head: true })
          .eq('status', status);

      const [pendingRes, approvedRes, rejectedRes, revisionRes] = await Promise.all([
        buildCountQuery('pending'),
        buildCountQuery('approved'),
        buildCountQuery('rejected'),
        buildCountQuery('revision_requested'),
      ]);

      setStats({
        pending: pendingRes.count || 0,
        approved: approvedRes.count || 0,
        rejected: rejectedRes.count || 0,
        revision_requested: revisionRes.count || 0,
        total: (pendingRes.count || 0) + (approvedRes.count || 0) + (rejectedRes.count || 0) + (revisionRes.count || 0),
      });
    } catch (error) {
      console.error('Failed to fetch approval stats:', error);
    }
  }, []);

  const fetchApprovals = useCallback(async (reset = false) => {
    try {
      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const from = reset ? 0 : approvals.length;
      const to = from + PAGE_SIZE - 1;
      let query = supabase
        .from('content_approvals')
        .select('id, content_type, content_id, content_title, status, submitted_by, reviewer_id, comments, school_id, created_at, updated_at')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      if (debouncedSearch.trim()) {
        const term = debouncedSearch.trim();
        query = query.or(`content_title.ilike.%${term}%,content_type.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      const enriched = await enrichApprovals((data as Approval[]) || []);

      setApprovals((previous) => {
        if (reset) return enriched;

        const merged = new Map<string, Approval>();
        [...previous, ...enriched].forEach((approval) => merged.set(approval.id, approval));
        return [...merged.values()];
      });

      if (reset) {
        setSelectedIds(new Set());
      }

      setHasMore((data || []).length === PAGE_SIZE);
    } catch (error) {
      console.error('Failed to fetch approvals:', error);
      toast({ title: 'Failed to load approvals', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [approvals.length, debouncedSearch, enrichApprovals, filter]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchStats(), fetchApprovals(true)]);
  }, [fetchApprovals, fetchStats]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const channel = supabase
      .channel(`content-approvals-${user?.user_id || 'guest'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_approvals' }, () => {
        refreshAll();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshAll, user?.user_id]);

  const handleOpenPreview = (approval: Approval) => {
    if (approval.content_type === 'exam') {
      setPreviewExam({ examId: approval.content_id, approvalId: approval.id });
      return;
    }

    setPreviewContent({
      contentType: approval.content_type,
      contentId: approval.content_id,
      approvalId: approval.id,
    });
  };

  const handleBulkApprove = async (ids: string[]) => {
    const itemsToApprove = approvals.filter(
      (approval) => ids.includes(approval.id) && approval.status === 'pending' && canReviewItem(approval),
    );

    if (itemsToApprove.length === 0) return;

    setBulkApproving(true);
    try {
      const approvalIds = itemsToApprove.map((approval) => approval.id);
      const now = new Date().toISOString();

      const { error: approvalError } = await supabase
        .from('content_approvals')
        .update({ status: 'approved', reviewer_id: user?.user_id, updated_at: now })
        .in('id', approvalIds);

      if (approvalError) throw approvalError;

      const groupedActivationIds = itemsToApprove.reduce<Record<string, string[]>>((accumulator, approval) => {
        const table = ACTIVATION_TABLES[approval.content_type];
        if (!table) return accumulator;
        accumulator[table] = accumulator[table] || [];
        accumulator[table].push(approval.content_id);
        return accumulator;
      }, {});

      await Promise.all(
        Object.entries(groupedActivationIds).map(([table, contentIds]) =>
          (supabase as any)
            .from(table)
            .update({ is_active: true })
            .in('id', contentIds),
        ),
      );

      toast({ title: `${itemsToApprove.length} item(s) approved` });
      await refreshAll();
    } catch (error: any) {
      toast({
        title: 'Bulk approval failed',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setBulkApproving(false);
      setSelectedIds(new Set());
    }
  };

  const filtered = useMemo(() => approvals, [approvals]);

  const pendingFiltered = useMemo(
    () => filtered.filter((approval) => approval.status === 'pending' && canReviewItem(approval)),
    [canReviewItem, filtered],
  );

  const allPendingSelected = pendingFiltered.length > 0 && pendingFiltered.every((approval) => selectedIds.has(approval.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllPending = () => {
    if (allPendingSelected) {
      setSelectedIds(new Set());
      return;
    }

    setSelectedIds(new Set(pendingFiltered.map((approval) => approval.id)));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="w-7 h-7 text-primary" /> Content Approvals
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {canReview
            ? 'Large approval queues now load in fast batches with realtime refresh.'
            : 'Track your submissions and their review status.'}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: 'pending', label: 'Pending', count: stats.pending, color: 'text-amber-600 bg-amber-50 border-amber-200' },
          { key: 'approved', label: 'Approved', count: stats.approved, color: 'text-green-600 bg-green-50 border-green-200' },
          { key: 'rejected', label: 'Rejected', count: stats.rejected, color: 'text-red-600 bg-red-50 border-red-200' },
          { key: 'revision_requested', label: 'Revision', count: stats.revision_requested, color: 'text-blue-600 bg-blue-50 border-blue-200' },
        ].map((stat) => (
          <button
            key={stat.key}
            onClick={() => setFilter(filter === stat.key ? 'all' : stat.key)}
            className={`p-3 rounded-xl border text-left transition-all hover:shadow-sm ${stat.color} ${filter === stat.key ? 'ring-2 ring-primary/20' : ''}`}
          >
            <p className="text-2xl font-bold">{stat.count}</p>
            <p className="text-xs font-medium">{stat.label}</p>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-muted-foreground" />
          {['all', 'pending', 'approved', 'rejected', 'revision_requested'].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === status ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {status === 'all' ? 'All' : STATUS_STYLES[status]?.label || status}
            </button>
          ))}
          <span className="text-xs text-muted-foreground ml-auto">
            Showing {filtered.length} of {stats.total} approvals
          </span>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by title or content type..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {canReview && pendingFiltered.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => handleBulkApprove(pendingFiltered.map((approval) => approval.id))}
            disabled={bulkApproving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {bulkApproving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
            Approve Loaded Pending ({pendingFiltered.length})
          </button>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={allPendingSelected}
              onChange={toggleSelectAllPending}
              className="w-4 h-4 rounded border-border accent-primary"
            />
            Select loaded pending
          </label>
          {selectedIds.size > 0 && (
            <button
              onClick={() => handleBulkApprove([...selectedIds])}
              disabled={bulkApproving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" /> Approve Selected ({selectedIds.size})
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-border">
          <Clock className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground font-medium">No approval requests found</p>
          <p className="text-xs text-muted-foreground mt-1">Try a different filter or search.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((approval) => {
            const style = STATUS_STYLES[approval.status] || STATUS_STYLES.pending;
            const ContentIcon = CONTENT_ICONS[approval.content_type] || FileText;
            const StatusIcon = style.icon;
            const showReview = canReview && canReviewItem(approval);
            const isPending = approval.status === 'pending';

            return (
              <div key={approval.id} className="bg-card rounded-xl border border-border p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3 flex-1 min-w-0">
                    {isPending && showReview && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(approval.id)}
                        onChange={() => toggleSelect(approval.id)}
                        className="w-4 h-4 mt-3 rounded border-border accent-primary flex-shrink-0"
                      />
                    )}
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${style.bg}`}>
                      <ContentIcon className={`w-5 h-5 ${style.text}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
                          <StatusIcon className="w-3 h-3" />
                          {style.label}
                        </span>
                        <span className="text-xs text-muted-foreground capitalize px-2 py-0.5 rounded bg-muted">
                          {approval.content_type}
                        </span>
                      </div>
                      <h3 className="font-semibold truncate">{approval.content_title}</h3>

                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                        {approval.school_name && <span>🏫 {approval.school_name}</span>}
                        {approval.class_name && <span>📚 {approval.class_name}</span>}
                        {approval.subject_name && <span>📖 {approval.subject_name}</span>}
                        {approval.chapter_name && <span>📄 {approval.chapter_name}</span>}
                      </div>

                      <p className="text-sm text-muted-foreground mt-1">
                        Submitted by <span className="font-medium text-foreground">{approval.submitter_name}</span>
                        <span className="capitalize text-xs ml-1">({approval.submitter_role})</span>
                        {' · '}
                        {new Date(approval.created_at).toLocaleDateString()} {' '}
                        {new Date(approval.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>

                      {approval.comments && (
                        <div className="mt-2 p-2.5 rounded-lg bg-muted/50 text-sm flex items-start gap-2">
                          <MessageSquare className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                          <span>{approval.comments}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 flex-shrink-0">
                    {showReview && (
                      <button
                        onClick={() => handleOpenPreview(approval)}
                        className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:opacity-90 flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" /> {isPending ? 'Review & Preview' : 'View Details'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <button
            onClick={() => fetchApprovals(false)}
            disabled={loadingMore}
            className="px-4 py-2 rounded-xl border border-border bg-background text-sm font-medium hover:bg-muted disabled:opacity-50 inline-flex items-center gap-2"
          >
            {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {loadingMore ? 'Loading more...' : 'Load more approvals'}
          </button>
        </div>
      )}

      {previewExam && (
        <ExamPreviewModal
          examId={previewExam.examId}
          approvalId={previewExam.approvalId}
          mode="review"
          onClose={() => setPreviewExam(null)}
          onApproved={refreshAll}
        />
      )}

      {previewContent && (
        <ContentPreviewModal
          contentType={previewContent.contentType}
          contentId={previewContent.contentId}
          approvalId={previewContent.approvalId}
          onClose={() => setPreviewContent(null)}
          onReviewed={refreshAll}
        />
      )}
    </div>
  );
};

export default ContentApprovalPage;
