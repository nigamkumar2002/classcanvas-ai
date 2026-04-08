import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Plus, ChevronDown, ChevronRight, BookOpen, FileText,
  Upload, Video, ClipboardList, FileQuestion, BookMarked, GraduationCap, X, Clock, ShieldCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ContentUploadModal from '@/components/ContentUploadModal';
import PDFViewerModal from '@/components/PDFViewerModal';
import { toast } from '@/hooks/use-toast';

interface Class { id: string; name: string; description: string; grade_level: number; is_active: boolean; }
interface Subject { id: string; class_id: string; name: string; description: string; color: string; is_active?: boolean; }
interface Chapter { id: string; subject_id: string; name: string; description: string; order_index: number; is_active?: boolean; }
interface Material { id: string; chapter_id: string; title: string; type: string; file_url?: string; file_type?: string; is_active: boolean; }

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType }> = {
  theory: { label: 'Theory', icon: BookOpen },
  question_bank: { label: 'Question Bank', icon: FileQuestion },
  exam_practice: { label: 'Exam Practice', icon: ClipboardList },
  assignment: { label: 'Assignment', icon: FileText },
  notes: { label: 'Notes', icon: BookMarked },
  video: { label: 'Video', icon: Video },
};

const SUBJECT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

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

  const [className, setClassName] = useState('');
  const [classDesc, setClassDesc] = useState('');
  const [classGrade, setClassGrade] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [subjectColor, setSubjectColor] = useState(SUBJECT_COLORS[0]);
  const [chapterName, setChapterName] = useState('');
  const [chapterDesc, setChapterDesc] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const canEdit = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'teacher' || user?.role === 'developer';
  const isStudent = user?.role === 'student';
  
  // Teachers/admins need approval; super_admin/developer content is auto-published
  const needsApproval = user?.role === 'teacher' || user?.role === 'admin';

  const fetchAll = async () => {
    try {
      const [{ data: cls }, { data: subs }, { data: chps }, { data: mats }] = await Promise.all([
        supabase.from('classes').select('*').order('grade_level'),
        supabase.from('subjects').select('*'),
        supabase.from('chapters').select('*').order('order_index'),
        supabase.from('materials').select('*'),
      ]);
      setClasses((cls as Class[]) || []);
      setSubjects((subs as Subject[]) || []);
      setChapters((chps as Chapter[]) || []);
      // For students, only show active/approved materials
      // For editors, show all materials (they can see pending ones)
      setMaterials((mats as Material[]) || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

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
    setFormLoading(true); setFormError('');
    
    const { data, error } = await supabase.from('chapters').insert({
      subject_id: addChapterModal.subjectId,
      name: chapterName.trim(),
      description: chapterDesc.trim() || null,
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
      fetchAll();
    }
    setFormLoading(false);
  };

  // Filter what students see - only active content
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{isStudent ? 'My Classes' : 'Classes & Content'}</h1>
          <p className="text-muted-foreground text-sm mt-1">{visibleClasses.length} classes · {subjects.length} subjects · {visibleChapters.length} chapters</p>
        </div>
        {canEdit && (
          <button onClick={() => { setAddClassModal(true); setFormError(''); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:opacity-90 transition-all">
            <Plus className="w-4 h-4" /> Add Class
          </button>
        )}
      </div>

      {/* Approval notice for teachers/admins */}
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
                  <button onClick={() => { setAddSubjectModal({ open: true, classId: cls.id }); setFormError(''); }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-emerald-600 hover:bg-emerald-50 transition-colors">
                    <Plus className="w-3 h-3" /> Subject
                  </button>
                )}
              </div>

              {isClassOpen && (
                <div className="border-t border-border">
                  {classSubjects.length === 0 ? (
                    <div className="p-4 pl-8 text-muted-foreground text-sm">No subjects yet.</div>
                  ) : classSubjects.map(sub => {
                    const subChapters = visibleChapters.filter(c => c.subject_id === sub.id);
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
                            <button onClick={() => { setAddChapterModal({ open: true, subjectId: sub.id }); setFormError(''); }}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors">
                              <Plus className="w-3 h-3" /> Chapter
                            </button>
                          )}
                        </div>

                        {isSubOpen && (
                          <div>
                            {subChapters.length === 0 ? (
                              <div className="pl-14 p-3 text-xs text-muted-foreground">No chapters yet.</div>
                            ) : subChapters.map(chp => {
                              const chpMaterials = visibleMaterials.filter(m => m.chapter_id === chp.id);
                              const isChpOpen = expandedChapters.has(chp.id);
                              const chpPending = chp.is_active === false;

                              return (
                                <div key={chp.id}>
                                  <div className="flex items-center gap-2 p-2.5 pl-14 hover:bg-muted/10 transition-colors">
                                    <button onClick={() => setExpandedChapters(toggle(expandedChapters, chp.id))} className="flex items-center gap-2 flex-1 text-left min-w-0">
                                      <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                      <span className="text-sm font-medium">{chp.name}</span>
                                      <span className="text-xs text-muted-foreground">({chpMaterials.length})</span>
                                      {chpPending && (
                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-700">Pending</span>
                                      )}
                                    </button>
                                    {canEdit && !chpPending && (
                                      <button onClick={() => setUploadModal({ open: true, chapterId: chp.id })}
                                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-colors">
                                        <Upload className="w-3 h-3" /> Upload
                                      </button>
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
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(g => <option key={g} value={g}>Grade {g}</option>)}
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
                  <Clock className="w-4 h-4 flex-shrink-0" />
                  <span>Subject will require approval.</span>
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
                  <Clock className="w-4 h-4 flex-shrink-0" />
                  <span>Chapter will require approval.</span>
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
              <button onClick={handleCreateChapter} disabled={formLoading}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 disabled:opacity-50">
                {formLoading ? 'Adding...' : needsApproval ? 'Submit for Approval' : 'Add Chapter'}
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
