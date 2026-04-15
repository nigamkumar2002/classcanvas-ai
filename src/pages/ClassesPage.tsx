import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Plus, ChevronDown, ChevronRight, BookOpen, FileText,
  Upload, Video, ClipboardList, FileQuestion, BookMarked, GraduationCap, X, Clock, ShieldCheck,
  Pencil, Trash2, Search, Copy, CheckCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ContentUploadModal from '@/components/ContentUploadModal';
import PDFViewerModal from '@/components/PDFViewerModal';
import DayPlanSection from '@/components/DayPlanSection';
import { toast } from '@/hooks/use-toast';

interface Class { id: string; name: string; description: string; grade_level: number; is_active: boolean; }
interface Subject { id: string; class_id: string; name: string; description: string; color: string; is_active?: boolean; teacher_id?: string; }
interface Chapter { id: string; subject_id: string; name: string; description: string; order_index: number; is_active?: boolean; }
interface Material { id: string; chapter_id: string; title: string; type: string; file_url?: string; file_type?: string; is_active: boolean; }
interface DayPlan { id: string; chapter_id: string | null; day_number: number | null; title: string; description: string | null; file_url: string | null; file_name: string | null; file_type: string | null; is_completed: boolean; status: string; }

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType }> = {
  theory: { label: 'Theory', icon: BookOpen },
  question_bank: { label: 'Question Bank', icon: FileQuestion },
  exam_practice: { label: 'Exam Practice', icon: ClipboardList },
  assignment: { label: 'Assignment', icon: FileText },
  notes: { label: 'Notes', icon: BookMarked },
  video: { label: 'Video', icon: Video },
};

const SUBJECT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

const GRADE_OPTIONS = [
  { value: -3, label: 'Nursery' },
  { value: -2, label: 'LKG' },
  { value: -1, label: 'UKG' },
  ...Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `Grade ${i + 1}` })),
];

const ClassesPage = () => {
  const { user } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [uploadModal, setUploadModal] = useState<{ open: boolean; chapterId?: string }>({ open: false });
  const [pdfModal, setPdfModal] = useState<{ open: boolean; material?: Material }>({ open: false });

  const [addClassModal, setAddClassModal] = useState(false);
  const [addSubjectModal, setAddSubjectModal] = useState<{ open: boolean; classId?: string }>({ open: false });
  const [addChapterModal, setAddChapterModal] = useState<{ open: boolean; subjectId?: string }>({ open: false });

  // Edit states
  const [editClassModal, setEditClassModal] = useState<{ open: boolean; cls?: Class }>({ open: false });
  const [editSubjectModal, setEditSubjectModal] = useState<{ open: boolean; sub?: Subject; classId?: string }>({ open: false });
  const [editChapterModal, setEditChapterModal] = useState<{ open: boolean; chp?: Chapter; subjectId?: string }>({ open: false });

  const [className, setClassName] = useState('');
  const [classDesc, setClassDesc] = useState('');
  const [classGrade, setClassGrade] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [subjectColor, setSubjectColor] = useState(SUBJECT_COLORS[0]);
  const [chapterName, setChapterName] = useState('');
  const [chapterDesc, setChapterDesc] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  // Subject copy modal
  const [showCopySubjects, setShowCopySubjects] = useState(false);
  const [copySourceClassId, setCopySourceClassId] = useState('');
  const [copyTargetClassIds, setCopyTargetClassIds] = useState<Set<string>>(new Set());
  const [copyLoading, setCopyLoading] = useState(false);

  // Approval toggle
  const [approvalRequired, setApprovalRequired] = useState(true);

  // Operation guard to prevent double-clicks
  const [operationInProgress, setOperationInProgress] = useState(false);

  const canEdit = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'teacher' || user?.role === 'developer';
  const canDelete = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'developer';
  const isStudent = user?.role === 'student';
  const isSuperAdminOrDev = user?.role === 'super_admin' || user?.role === 'developer';

  // Dynamic approval check: if approval is disabled by super admin, no one needs approval
  const needsApproval = approvalRequired && (user?.role === 'teacher' || user?.role === 'admin');

  // Load approval setting
  useEffect(() => {
    if (!user?.school_id) return;
    const loadSetting = async () => {
      const { data } = await (supabase as any)
        .from('school_settings')
        .select('value')
        .eq('school_id', user.school_id)
        .eq('key', 'require_content_approval')
        .single();
      if (data) {
        setApprovalRequired(data.value === true || data.value === 'true');
      }
    };
    loadSetting();
  }, [user?.school_id]);

  const fetchAll = useCallback(async () => {
    try {
      // Fetch all data without the default 1000 limit using pagination
      const fetchAllRows = async (table: string, orderCol?: string) => {
        const allRows: any[] = [];
        const batchSize = 1000;
        let from = 0;
        let hasMore = true;
        while (hasMore) {
          let query = (supabase as any).from(table).select('*').range(from, from + batchSize - 1);
          if (orderCol) query = query.order(orderCol);
          const { data, error } = await query;
          if (error) throw error;
          if (data && data.length > 0) {
            allRows.push(...data);
            from += batchSize;
            hasMore = data.length === batchSize;
          } else {
            hasMore = false;
          }
        }
        return allRows;
      };

      const [cls, subs, chps, mats] = await Promise.all([
        fetchAllRows('classes', 'grade_level'),
        fetchAllRows('subjects'),
        fetchAllRows('chapters', 'order_index'),
        fetchAllRows('materials'),
      ]);
      setClasses(cls || []);
      setSubjects(subs || []);
      setChapters(chps || []);
      setMaterials(mats || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggle = (set: Set<string>, id: string) => {
    const n = new Set(set);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  };

  const submitForApproval = async (contentType: string, contentId: string, contentTitle: string) => {
    if (!user?.school_id || !needsApproval) return;
    await supabase.from('content_approvals').insert({
      content_type: contentType, content_id: contentId, content_title: contentTitle,
      submitted_by: user.user_id, school_id: user.school_id,
    } as any);
  };

  // Count unique subject names across all classes
  const uniqueSubjectNames = new Set(subjects.map(s => s.name.trim().toLowerCase()));

  const handleCreateClass = async () => {
    if (!className.trim()) { setFormError('Class name required'); return; }
    if (!user?.school_id) { setFormError('Your account is not assigned to a school.'); return; }
    setFormLoading(true); setFormError('');
    
    const { data, error } = await supabase.from('classes').insert({
      name: className.trim(),
      description: classDesc.trim() || null,
      grade_level: classGrade ? parseInt(classGrade) : null,
      created_by: user?.user_id,
      school_id: user.school_id,
      is_active: !needsApproval,
    } as any).select().single();
    
    if (error) { setFormError(error.message); } else {
      if (needsApproval && data) {
        await submitForApproval('class', data.id, className.trim());
        toast({ title: 'Sent for Approval', description: `Class "${className.trim()}" has been submitted for approval.` });
      } else {
        toast({ title: 'Class Created', description: `Class "${className.trim()}" has been published.` });
      }
      setAddClassModal(false); setClassName(''); setClassDesc(''); setClassGrade('');
      fetchAll();
    }
    setFormLoading(false);
  };

  const handleCreateSubject = async () => {
    if (!subjectName.trim() || !addSubjectModal.classId) { setFormError('Subject name required'); return; }
    if (!user?.school_id) { setFormError('Your account is not assigned to a school.'); return; }
    setFormLoading(true); setFormError('');
    
    const { data, error } = await supabase.from('subjects').insert({
      class_id: addSubjectModal.classId,
      name: subjectName.trim(),
      color: subjectColor,
      teacher_id: user?.user_id,
      school_id: user.school_id,
    } as any).select().single();
    
    if (error) { setFormError(error.message); } else {
      if (needsApproval && data) {
        await submitForApproval('subject', data.id, subjectName.trim());
        toast({ title: 'Sent for Approval', description: `Subject "${subjectName.trim()}" has been submitted for approval.` });
      } else {
        toast({ title: 'Subject Created', description: `Subject "${subjectName.trim()}" has been added.` });
      }
      setAddSubjectModal({ open: false }); setSubjectName(''); setSubjectColor(SUBJECT_COLORS[0]);
      fetchAll();
    }
    setFormLoading(false);
  };

  const handleCreateChapter = async () => {
    if (!chapterName.trim() || !addChapterModal.subjectId) { setFormError('Chapter name required'); return; }
    if (!user?.school_id) { setFormError('Your account is not assigned to a school.'); return; }
    if (operationInProgress) return;
    setOperationInProgress(true);
    setFormLoading(true); setFormError('');
    
    try {
      // Query DB directly for max order_index to avoid stale state
      const { data: existingChapters } = await supabase
        .from('chapters')
        .select('order_index')
        .eq('subject_id', addChapterModal.subjectId)
        .order('order_index', { ascending: false })
        .limit(1);

      const maxOrder = existingChapters && existingChapters.length > 0 ? existingChapters[0].order_index : 0;
      
      const { data, error } = await supabase.from('chapters').insert({
        subject_id: addChapterModal.subjectId,
        name: chapterName.trim(),
        description: chapterDesc.trim() || null,
        order_index: maxOrder + 1,
        school_id: user.school_id,
        is_active: !needsApproval,
      } as any).select().single();
      
      if (error) { setFormError(error.message); } else {
        if (needsApproval && data) {
          await submitForApproval('chapter', data.id, chapterName.trim());
          toast({ title: 'Sent for Approval', description: `Chapter "${chapterName.trim()}" has been submitted for approval.` });
        } else {
          toast({ title: 'Chapter Created', description: `Chapter "${chapterName.trim()}" has been added.` });
        }
        setAddChapterModal({ open: false }); setChapterName(''); setChapterDesc('');
        await fetchAll();
      }
    } finally {
      setFormLoading(false);
      setOperationInProgress(false);
    }
  };

  // Edit handlers
  const handleEditClass = async () => {
    if (!className.trim() || !editClassModal.cls) return;
    setFormLoading(true); setFormError('');
    const { error } = await supabase.from('classes').update({
      name: className.trim(), description: classDesc.trim() || null,
      grade_level: classGrade ? parseInt(classGrade) : null,
    }).eq('id', editClassModal.cls.id);
    if (error) { setFormError(error.message); } else {
      toast({ title: 'Class Updated' }); setEditClassModal({ open: false }); fetchAll();
    }
    setFormLoading(false);
  };

  const handleEditSubject = async () => {
    if (!subjectName.trim() || !editSubjectModal.sub) return;
    setFormLoading(true); setFormError('');
    const { error } = await supabase.from('subjects').update({
      name: subjectName.trim(), color: subjectColor,
    }).eq('id', editSubjectModal.sub.id);
    if (error) { setFormError(error.message); } else {
      toast({ title: 'Subject Updated' }); setEditSubjectModal({ open: false }); fetchAll();
    }
    setFormLoading(false);
  };

  const handleEditChapter = async () => {
    if (!chapterName.trim() || !editChapterModal.chp) return;
    setFormLoading(true); setFormError('');
    const { error } = await supabase.from('chapters').update({
      name: chapterName.trim(), description: chapterDesc.trim() || null,
    }).eq('id', editChapterModal.chp.id);
    if (error) { setFormError(error.message); } else {
      toast({ title: 'Chapter Updated' }); setEditChapterModal({ open: false }); fetchAll();
    }
    setFormLoading(false);
  };

  // Delete handlers with operation guard
  const handleDeleteClass = async (id: string, name: string) => {
    if (operationInProgress) return;
    if (!confirm(`Delete class "${name}" and all its subjects, chapters, and materials?`)) return;
    setOperationInProgress(true);
    try {
      const { error } = await supabase.from('classes').delete().eq('id', id);
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); } else {
        toast({ title: 'Class Deleted' }); await fetchAll();
      }
    } finally { setOperationInProgress(false); }
  };

  const handleDeleteSubject = async (id: string, name: string) => {
    if (operationInProgress) return;
    if (!confirm(`Delete subject "${name}" and all its chapters and materials?`)) return;
    setOperationInProgress(true);
    try {
      const subChapters = chapters.filter(c => c.subject_id === id);
      for (const ch of subChapters) {
        await supabase.from('materials').delete().eq('chapter_id', ch.id);
      }
      await supabase.from('chapters').delete().eq('subject_id', id);
      const { error } = await supabase.from('subjects').delete().eq('id', id);
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); } else {
        toast({ title: 'Subject Deleted' }); await fetchAll();
      }
    } finally { setOperationInProgress(false); }
  };

  const handleDeleteChapter = async (id: string, name: string) => {
    if (operationInProgress) return;
    if (!confirm(`Delete chapter "${name}" and all its materials?`)) return;
    setOperationInProgress(true);
    try {
      await supabase.from('materials').delete().eq('chapter_id', id);
      const { error } = await supabase.from('chapters').delete().eq('id', id);
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); } else {
        toast({ title: 'Chapter Deleted' }); await fetchAll();
      }
    } finally { setOperationInProgress(false); }
  };

  const handleDeleteMaterial = async (id: string, title: string) => {
    if (operationInProgress) return;
    if (!confirm(`Delete material "${title}"?`)) return;
    setOperationInProgress(true);
    try {
      const { error } = await supabase.from('materials').delete().eq('id', id);
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); } else {
        toast({ title: 'Material Deleted' }); await fetchAll();
      }
    } finally { setOperationInProgress(false); }
  };

  // Copy subjects from one class to selected target classes
  const handleCopySubjects = async () => {
    if (!copySourceClassId || copyTargetClassIds.size === 0 || !user?.school_id) return;
    setCopyLoading(true);
    try {
      const sourceSubjects = subjects.filter(s => s.class_id === copySourceClassId);
      if (sourceSubjects.length === 0) {
        toast({ title: 'No subjects to copy', description: 'Source class has no subjects.', variant: 'destructive' });
        setCopyLoading(false);
        return;
      }

      let created = 0;
      let skipped = 0;
      for (const targetClassId of copyTargetClassIds) {
        const existingInTarget = subjects.filter(s => s.class_id === targetClassId).map(s => s.name.trim().toLowerCase());
        for (const sub of sourceSubjects) {
          if (existingInTarget.includes(sub.name.trim().toLowerCase())) {
            skipped++;
            continue;
          }
          await supabase.from('subjects').insert({
            class_id: targetClassId,
            name: sub.name.trim(),
            description: sub.description || null,
            color: sub.color,
            school_id: user.school_id,
          } as any);
          created++;
        }
      }
      toast({ title: 'Subjects Copied', description: `${created} subjects created, ${skipped} duplicates skipped.` });
      setShowCopySubjects(false);
      setCopySourceClassId('');
      setCopyTargetClassIds(new Set());
      await fetchAll();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setCopyLoading(false);
    }
  };

  // Filter what students see
  const visibleClasses = isStudent ? classes.filter(c => c.is_active !== false) : classes;
  const visibleChapters = isStudent ? chapters.filter(c => c.is_active !== false) : chapters;
  const visibleMaterials = isStudent ? materials.filter(m => m.is_active !== false) : materials;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">{isStudent ? 'My Classes' : 'Classes & Content'}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {visibleClasses.length} classes · {uniqueSubjectNames.size} unique subjects · {visibleChapters.length} chapters
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isSuperAdminOrDev && (
            <button onClick={() => { setShowCopySubjects(true); setCopySourceClassId(''); setCopyTargetClassIds(new Set()); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-background font-medium text-sm hover:bg-muted transition-all">
              <Copy className="w-4 h-4" /> Copy Subjects
            </button>
          )}
          {canEdit && (
            <button onClick={() => { setAddClassModal(true); setFormError(''); setClassName(''); setClassDesc(''); setClassGrade(''); }}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:opacity-90 transition-all">
              <Plus className="w-4 h-4" /> Add Class
            </button>
          )}
        </div>
      </div>

      {needsApproval && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <Clock className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Content Approval Required</p>
            <p className="text-xs mt-0.5">
              {user?.role === 'teacher'
                ? 'All content you create will be sent to your school admin for approval before it becomes visible to students.'
                : 'All content you create will be sent to the super admin for approval before it becomes visible.'}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {visibleClasses.map(cls => {
          const classSubjects = subjects.filter(s => s.class_id === cls.id);
          const isClassOpen = expandedClasses.has(cls.id);
          const isPending = cls.is_active === false;

          return (
            <div key={cls.id} className={cn("bg-card rounded-2xl border shadow-sm overflow-hidden", isPending ? "border-amber-300 opacity-80" : "border-border")}>
              <div className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors">
                <button onClick={() => setExpandedClasses(toggle(expandedClasses, cls.id))} className="flex items-center gap-4 flex-1 text-left min-w-0">
                  <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0", isPending ? "bg-amber-100" : "bg-primary/10")}>
                    <GraduationCap className={cn("w-6 h-6", isPending ? "text-amber-600" : "text-primary")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold">{cls.name}</h3>
                      {isPending && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Pending Approval
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{cls.description || 'No description'} · {classSubjects.length} subjects</p>
                  </div>
                  {isClassOpen ? <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />}
                </button>
                {canEdit && !isPending && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => {
                      setEditClassModal({ open: true, cls });
                      setClassName(cls.name); setClassDesc(cls.description || ''); setClassGrade(cls.grade_level?.toString() || ''); setFormError('');
                    }} className="px-2 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
                      <Pencil className="w-3 h-3 inline mr-1" />Edit
                    </button>
                    {canDelete && (
                      <button onClick={() => handleDeleteClass(cls.id, cls.name)} disabled={operationInProgress}
                        className="px-2 py-1 rounded-lg text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50">
                        <Trash2 className="w-3 h-3 inline mr-1" />Delete
                      </button>
                    )}
                    <button onClick={() => { setAddSubjectModal({ open: true, classId: cls.id }); setFormError(''); setSubjectName(''); setSubjectColor(SUBJECT_COLORS[0]); }}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-emerald-600 hover:bg-emerald-50 transition-colors">
                      <Plus className="w-3 h-3" /> Subject
                    </button>
                  </div>
                )}
              </div>

              {isClassOpen && (
                <div className="border-t border-border">
                  {classSubjects.length === 0 ? (
                    <div className="p-4 pl-8 text-muted-foreground text-sm">No subjects yet.</div>
                  ) : classSubjects.map(sub => {
                    const subChapters = visibleChapters.filter(c => c.subject_id === sub.id).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
                    const isSubOpen = expandedSubjects.has(sub.id);

                    return (
                      <div key={sub.id} className="border-b border-border last:border-0">
                        <div className="flex items-center gap-3 p-3 pl-8 hover:bg-muted/20 transition-colors">
                          <button onClick={() => setExpandedSubjects(toggle(expandedSubjects, sub.id))} className="flex items-center gap-3 flex-1 text-left min-w-0">
                            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: sub.color }} />
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm">{sub.name}</p>
                              <p className="text-xs text-muted-foreground">{subChapters.length} chapters</p>
                            </div>
                            {isSubOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                          </button>
                          {canEdit && (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button onClick={() => {
                                setEditSubjectModal({ open: true, sub, classId: sub.class_id });
                                setSubjectName(sub.name); setSubjectColor(sub.color || SUBJECT_COLORS[0]); setFormError('');
                              }} className="px-2 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
                                <Pencil className="w-3 h-3 inline mr-1" />Edit
                              </button>
                              {canDelete && (
                                <button onClick={() => handleDeleteSubject(sub.id, sub.name)} disabled={operationInProgress}
                                  className="px-2 py-1 rounded-lg text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50">
                                  <Trash2 className="w-3 h-3 inline mr-1" />Delete
                                </button>
                              )}
                              <button onClick={() => { setAddChapterModal({ open: true, subjectId: sub.id }); setFormError(''); setChapterName(''); setChapterDesc(''); }}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors">
                                <Plus className="w-3 h-3" /> Chapter
                              </button>
                            </div>
                          )}
                        </div>

                        {isSubOpen && (
                          <div>
                            {subChapters.length === 0 ? (
                              <div className="pl-14 p-3 text-xs text-muted-foreground">No chapters yet.</div>
                            ) : subChapters.map((chp, idx) => {
                              const chpMaterials = visibleMaterials.filter(m => m.chapter_id === chp.id);
                              const isChpOpen = expandedChapters.has(chp.id);
                              const chpPending = chp.is_active === false;

                              return (
                                <div key={chp.id}>
                                  <div className="flex items-center gap-2 p-2.5 pl-14 hover:bg-muted/10 transition-colors">
                                    <button onClick={() => setExpandedChapters(toggle(expandedChapters, chp.id))} className="flex items-center gap-2 flex-1 text-left min-w-0">
                                      <span className="text-xs text-muted-foreground font-mono w-5 text-right flex-shrink-0">{idx + 1}.</span>
                                      <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                      <span className="text-sm font-medium">{chp.name}</span>
                                      <span className="text-xs text-muted-foreground">({chpMaterials.length})</span>
                                      {chpPending && (
                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-700">Pending</span>
                                      )}
                                    </button>
                                    {canEdit && !chpPending && (
                                      <div className="flex items-center gap-1 flex-shrink-0">
                                        <button onClick={() => {
                                          setEditChapterModal({ open: true, chp, subjectId: chp.subject_id });
                                          setChapterName(chp.name); setChapterDesc(chp.description || ''); setFormError('');
                                        }} className="px-1.5 py-0.5 rounded text-xs text-muted-foreground hover:bg-muted">
                                          <Pencil className="w-3 h-3" />
                                        </button>
                                        {canDelete && (
                                          <button onClick={() => handleDeleteChapter(chp.id, chp.name)} disabled={operationInProgress}
                                            className="px-1.5 py-0.5 rounded text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50">
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        )}
                                        <button onClick={() => setUploadModal({ open: true, chapterId: chp.id })}
                                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-colors">
                                          <Upload className="w-3 h-3" /> Upload
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  {isChpOpen && chpMaterials.length > 0 && (
                                    <div className="pl-20 pb-2 space-y-1">
                                      {chpMaterials.map(mat => {
                                        const cfg = TYPE_CONFIG[mat.type] || TYPE_CONFIG.theory;
                                        const matPending = mat.is_active === false;
                                        return (
                                          <div key={mat.id} className={cn("flex items-center gap-2 p-2 rounded-lg hover:bg-muted/20 transition-colors group", matPending && "opacity-60")}>
                                            <cfg.icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                            <button onClick={() => mat.file_url && setPdfModal({ open: true, material: mat })}
                                              className="text-xs font-medium text-left truncate flex-1 hover:text-primary transition-colors">{mat.title}</button>
                                            {matPending && (
                                              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-700">Pending</span>
                                            )}
                                            <span className="text-[10px] text-muted-foreground capitalize">{mat.type?.replace('_', ' ')}</span>
                                            {canDelete && (
                                              <button onClick={() => handleDeleteMaterial(mat.id, mat.title)} disabled={operationInProgress}
                                                className="opacity-0 group-hover:opacity-100 px-1 py-0.5 rounded text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50">
                                                <Trash2 className="w-3 h-3" />
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {visibleClasses.length === 0 && (
          <div className="bg-card rounded-2xl border border-border shadow-sm p-12 text-center">
            <GraduationCap className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-muted-foreground">No classes created yet</p>
          </div>
        )}
      </div>

      {/* Create Class Modal */}
      {addClassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-lg font-bold">Create New Class</h2>
              <button onClick={() => setAddClassModal(false)} className="p-2 rounded-xl hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {needsApproval && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs">
                  <Clock className="w-4 h-4 flex-shrink-0" />
                  <span>This class will require approval before it becomes active.</span>
                </div>
              )}
              {formError && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{formError}</div>}
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Class Name *</label>
                <input value={className} onChange={e => setClassName(e.target.value)} placeholder="e.g. Class 10"
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Description</label>
                <textarea value={classDesc} onChange={e => setClassDesc(e.target.value)} placeholder="Brief description..." rows={2}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm resize-none" />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Grade Level</label>
                <select value={classGrade} onChange={e => setClassGrade(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm">
                  <option value="">Select grade...</option>
                  {GRADE_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-border">
              <button onClick={() => setAddClassModal(false)} className="flex-1 py-2.5 rounded-xl border border-border font-medium text-sm hover:bg-muted">Cancel</button>
              <button onClick={handleCreateClass} disabled={formLoading}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                {formLoading ? 'Creating...' : needsApproval ? <><Clock className="w-4 h-4" /> Submit for Approval</> : 'Create Class'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Class Modal */}
      {editClassModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-lg font-bold">Edit Class</h2>
              <button onClick={() => setEditClassModal({ open: false })} className="p-2 rounded-xl hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {formError && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{formError}</div>}
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Class Name *</label>
                <input value={className} onChange={e => setClassName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Description</label>
                <textarea value={classDesc} onChange={e => setClassDesc(e.target.value)} rows={2}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm resize-none" />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Grade Level</label>
                <select value={classGrade} onChange={e => setClassGrade(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm">
                  <option value="">Select grade...</option>
                  {GRADE_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-border">
              <button onClick={() => setEditClassModal({ open: false })} className="flex-1 py-2.5 rounded-xl border border-border font-medium text-sm hover:bg-muted">Cancel</button>
              <button onClick={handleEditClass} disabled={formLoading}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 disabled:opacity-50">
                {formLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Subject Modal */}
      {addSubjectModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="font-bold">Add Subject</h3>
              <button onClick={() => setAddSubjectModal({ open: false })} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              {needsApproval && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs">
                  <Clock className="w-4 h-4 flex-shrink-0" /><span>Subject will require approval.</span>
                </div>
              )}
              {formError && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{formError}</div>}
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Subject Name *</label>
                <input value={subjectName} onChange={e => setSubjectName(e.target.value)} placeholder="e.g. Mathematics"
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {SUBJECT_COLORS.map(c => (
                    <button key={c} onClick={() => setSubjectColor(c)}
                      className={cn('w-7 h-7 rounded-full border-2 transition-transform hover:scale-110', subjectColor === c ? 'border-foreground' : 'border-transparent')}
                      style={{ background: c }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-border">
              <button onClick={() => setAddSubjectModal({ open: false })} className="flex-1 py-2.5 rounded-xl border border-border font-medium text-sm hover:bg-muted">Cancel</button>
              <button onClick={handleCreateSubject} disabled={formLoading}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 disabled:opacity-50">
                {formLoading ? 'Adding...' : needsApproval ? 'Submit for Approval' : 'Add Subject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Subject Modal */}
      {editSubjectModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="font-bold">Edit Subject</h3>
              <button onClick={() => setEditSubjectModal({ open: false })} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              {formError && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{formError}</div>}
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Subject Name *</label>
                <input value={subjectName} onChange={e => setSubjectName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {SUBJECT_COLORS.map(c => (
                    <button key={c} onClick={() => setSubjectColor(c)}
                      className={cn('w-7 h-7 rounded-full border-2 transition-transform hover:scale-110', subjectColor === c ? 'border-foreground' : 'border-transparent')}
                      style={{ background: c }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-border">
              <button onClick={() => setEditSubjectModal({ open: false })} className="flex-1 py-2.5 rounded-xl border border-border font-medium text-sm hover:bg-muted">Cancel</button>
              <button onClick={handleEditSubject} disabled={formLoading}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 disabled:opacity-50">
                {formLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Chapter Modal */}
      {addChapterModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="font-bold">Add Chapter</h3>
              <button onClick={() => setAddChapterModal({ open: false })} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              {needsApproval && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs">
                  <Clock className="w-4 h-4 flex-shrink-0" /><span>Chapter will require approval.</span>
                </div>
              )}
              {formError && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{formError}</div>}
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Chapter Name *</label>
                <input value={chapterName} onChange={e => setChapterName(e.target.value)} placeholder="e.g. Chapter 1: Real Numbers"
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Description</label>
                <textarea value={chapterDesc} onChange={e => setChapterDesc(e.target.value)} placeholder="Brief description..." rows={2}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm resize-none" />
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-border">
              <button onClick={() => setAddChapterModal({ open: false })} className="flex-1 py-2.5 rounded-xl border border-border font-medium text-sm hover:bg-muted">Cancel</button>
              <button onClick={handleCreateChapter} disabled={formLoading || operationInProgress}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 disabled:opacity-50">
                {formLoading ? 'Adding...' : needsApproval ? 'Submit for Approval' : 'Add Chapter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Chapter Modal */}
      {editChapterModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="font-bold">Edit Chapter</h3>
              <button onClick={() => setEditChapterModal({ open: false })} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              {formError && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{formError}</div>}
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Chapter Name *</label>
                <input value={chapterName} onChange={e => setChapterName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Description</label>
                <textarea value={chapterDesc} onChange={e => setChapterDesc(e.target.value)} rows={2}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm resize-none" />
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-border">
              <button onClick={() => setEditChapterModal({ open: false })} className="flex-1 py-2.5 rounded-xl border border-border font-medium text-sm hover:bg-muted">Cancel</button>
              <button onClick={handleEditChapter} disabled={formLoading}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 disabled:opacity-50">
                {formLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy Subjects Modal */}
      {showCopySubjects && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Copy className="w-5 h-5 text-primary" /></div>
                <div>
                  <h2 className="text-lg font-bold">Copy Subjects Across Classes</h2>
                  <p className="text-xs text-muted-foreground">Copy all subjects from one class to other classes (duplicates skipped)</p>
                </div>
              </div>
              <button onClick={() => setShowCopySubjects(false)} className="p-2 rounded-xl hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Source Class (copy from) *</label>
                <select value={copySourceClassId} onChange={e => setCopySourceClassId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm">
                  <option value="">Select source class...</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({subjects.filter(s => s.class_id === c.id).length} subjects)</option>
                  ))}
                </select>
              </div>
              {copySourceClassId && (
                <div className="p-3 rounded-xl bg-muted/50 border border-border">
                  <p className="text-xs font-semibold mb-2">Subjects to copy:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {subjects.filter(s => s.class_id === copySourceClassId).map(s => (
                      <span key={s.id} className="px-2 py-1 rounded-lg text-xs font-medium bg-primary/10 text-primary">{s.name}</span>
                    ))}
                    {subjects.filter(s => s.class_id === copySourceClassId).length === 0 && (
                      <span className="text-xs text-muted-foreground">No subjects in this class</span>
                    )}
                  </div>
                </div>
              )}
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Target Classes (copy to) *</label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {classes.filter(c => c.id !== copySourceClassId).map(c => (
                    <label key={c.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-border hover:bg-muted/30 cursor-pointer">
                      <input type="checkbox" checked={copyTargetClassIds.has(c.id)}
                        onChange={() => {
                          const n = new Set(copyTargetClassIds);
                          n.has(c.id) ? n.delete(c.id) : n.add(c.id);
                          setCopyTargetClassIds(n);
                        }}
                        className="w-4 h-4 rounded border-border accent-primary" />
                      <span className="text-sm font-medium flex-1">{c.name}</span>
                      <span className="text-xs text-muted-foreground">{subjects.filter(s => s.class_id === c.id).length} subjects</span>
                    </label>
                  ))}
                </div>
                {classes.filter(c => c.id !== copySourceClassId).length > 1 && (
                  <button onClick={() => {
                    const allIds = classes.filter(c => c.id !== copySourceClassId).map(c => c.id);
                    setCopyTargetClassIds(copyTargetClassIds.size === allIds.length ? new Set() : new Set(allIds));
                  }} className="text-xs text-primary font-medium mt-2 hover:underline">
                    {copyTargetClassIds.size === classes.filter(c => c.id !== copySourceClassId).length ? 'Deselect All' : 'Select All'}
                  </button>
                )}
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-border">
              <button onClick={() => setShowCopySubjects(false)} className="flex-1 py-2.5 rounded-xl border border-border font-medium text-sm hover:bg-muted">Cancel</button>
              <button onClick={handleCopySubjects} disabled={copyLoading || !copySourceClassId || copyTargetClassIds.size === 0}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                {copyLoading ? 'Copying...' : <><CheckCheck className="w-4 h-4" /> Copy Subjects</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {uploadModal.open && uploadModal.chapterId && (
        <ContentUploadModal chapterId={uploadModal.chapterId} onClose={() => setUploadModal({ open: false })} onSuccess={() => { setUploadModal({ open: false }); fetchAll(); }} />
      )}

      {pdfModal.open && pdfModal.material && (
        <PDFViewerModal material={pdfModal.material as any} onClose={() => setPdfModal({ open: false })} canTeach={canEdit} />
      )}
    </div>
  );
};

export default ClassesPage;