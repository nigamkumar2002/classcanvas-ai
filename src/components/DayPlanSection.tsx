import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2, Pencil, Camera, Upload, FileText, CheckCircle, Circle, X, Image as ImageIcon, NotebookPen, Lock, Clock, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import LexicalNotepad from '@/components/notepad/LexicalNotepad';

interface DayPlan {
  id: string; chapter_id: string | null; day_number: number | null;
  title: string; description: string | null; file_url: string | null;
  file_name: string | null; file_type: string | null; is_completed: boolean; status: string;
  notepad_content?: any; approval_status?: string; teacher_id?: string;
}

interface Attachment { id: string; file_url: string; file_name: string; file_type: string | null; }

interface Props {
  chapterId: string; subjectId: string; classId: string;
  dayPlans: DayPlan[]; canEdit: boolean; canDelete: boolean; onRefresh: () => void;
}

const DayPlanSection: React.FC<Props> = ({ chapterId, subjectId, classId, dayPlans, canEdit, canDelete, onRefresh }) => {
  const { user } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [editingPlan, setEditingPlan] = useState<DayPlan | null>(null);
  const [openNotepadFor, setOpenNotepadFor] = useState<DayPlan | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [editLocked, setEditLocked] = useState(false);
  const [autoApprove, setAutoApprove] = useState(true);
  const [attachmentsByPlan, setAttachmentsByPlan] = useState<Record<string, Attachment[]>>({});

  const isAdminRole = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'developer';

  // Load school settings
  useEffect(() => {
    (async () => {
      if (!user?.school_id) return;
      const { data } = await supabase.from('school_settings').select('key, value')
        .eq('school_id', user.school_id).in('key', ['lesson_plan_editable', 'auto_approve_lesson_plans', 'lesson_plan_admin_editable']);
      const map = new Map((data || []).map((s: any) => [s.key, s.value]));
      const editable = user?.role === 'teacher' ? map.get('lesson_plan_editable') : map.get('lesson_plan_admin_editable');
      setEditLocked(editable === false);
      setAutoApprove(map.get('auto_approve_lesson_plans') !== false);
    })();
  }, [user?.school_id, user?.role]);

  const chapterPlans = dayPlans
    .filter(p => p.chapter_id === chapterId)
    .sort((a, b) => (a.day_number || 0) - (b.day_number || 0));

  // Load attachments for these plans
  useEffect(() => {
    if (chapterPlans.length === 0) return;
    (async () => {
      const ids = chapterPlans.map(p => p.id);
      const { data } = await supabase.from('lesson_plan_attachments').select('*').in('lesson_plan_id', ids).order('order_index');
      const m: Record<string, Attachment[]> = {};
      (data || []).forEach((a: any) => { (m[a.lesson_plan_id] ||= []).push(a); });
      setAttachmentsByPlan(m);
    })();
  }, [chapterPlans.length, chapterId]);

  const nextDayNumber = chapterPlans.length > 0
    ? Math.max(...chapterPlans.map(p => p.day_number || 0)) + 1
    : 1;

  const resetForm = () => {
    setTitle(''); setDescription(''); setFiles([]);
    setShowAdd(false); setEditingPlan(null);
  };

  const uploadFiles = async (fs: File[]) => {
    const uploaded = [];
    for (const f of fs) {
      const ext = f.name.split('.').pop();
      const path = `day-plans/${chapterId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('lms-materials').upload(path, f);
      if (error) throw error;
      const { data } = supabase.storage.from('lms-materials').getPublicUrl(path);
      uploaded.push({ url: data.publicUrl, name: f.name, type: f.type });
    }
    return uploaded;
  };

  const handleSave = async (opts?: { openNotepadAfter?: boolean }) => {
    if (!user?.school_id) return;
    setSaving(true);
    try {
      let planId = editingPlan?.id;
      const approvalStatus = autoApprove ? 'approved' : 'pending';
      const finalTitle = (title.trim() || `Day ${editingPlan?.day_number || nextDayNumber} Plan`);

      if (editingPlan) {
        const { error } = await supabase.from('lesson_plans').update({
          title: finalTitle, description: description.trim() || null,
          approval_status: autoApprove ? editingPlan.approval_status || 'approved' : 'pending',
        }).eq('id', editingPlan.id);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any).from('lesson_plans').insert({
          chapter_id: chapterId, subject_id: subjectId, class_id: classId,
          teacher_id: user.user_id, school_id: user.school_id,
          day_number: nextDayNumber, title: finalTitle,
          description: description.trim() || null,
          planned_date: new Date().toISOString().split('T')[0],
          period_number: 1, status: 'planned',
          approval_status: approvalStatus,
        }).select().single();
        if (error) throw error;
        planId = data.id;
      }

      // Upload attachments
      if (files.length && planId) {
        const uploaded = await uploadFiles(files);
        const rows = uploaded.map((u, i) => ({
          lesson_plan_id: planId, school_id: user.school_id,
          file_url: u.url, file_name: u.name, file_type: u.type,
          order_index: (attachmentsByPlan[planId]?.length || 0) + i,
          uploaded_by: user.user_id,
        }));
        await (supabase as any).from('lesson_plan_attachments').insert(rows);
      }

      toast({ title: editingPlan ? 'Plan updated' : `Day ${nextDayNumber} plan added`, description: !autoApprove ? 'Pending admin approval' : undefined });

      // If user clicked "Open Notepad", fetch the saved plan and open notepad
      if (opts?.openNotepadAfter && planId) {
        const { data: full } = await supabase.from('lesson_plans').select('*').eq('id', planId).maybeSingle();
        if (full) setOpenNotepadFor(full as any);
      }
      resetForm();
      onRefresh();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleToggleComplete = async (plan: DayPlan) => {
    const newStatus = plan.is_completed ? 'planned' : 'completed';
    await supabase.from('lesson_plans').update({
      is_completed: !plan.is_completed, status: newStatus,
      completed_at: !plan.is_completed ? new Date().toISOString() : null,
    }).eq('id', plan.id);
    onRefresh();
  };

  const handleDelete = async (plan: DayPlan) => {
    if (!confirm(`Delete Day ${plan.day_number} plan "${plan.title}"?`)) return;
    await supabase.from('lesson_plans').delete().eq('id', plan.id);
    toast({ title: 'Plan deleted' });
    onRefresh();
  };

  const removeAttachment = async (att: Attachment, planId: string) => {
    await supabase.from('lesson_plan_attachments').delete().eq('id', att.id);
    setAttachmentsByPlan(m => ({ ...m, [planId]: (m[planId] || []).filter(a => a.id !== att.id) }));
  };

  const openCamera = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment'; input.multiple = true;
    input.onchange = (e: any) => { const fs = Array.from(e.target.files || []) as File[]; if (fs.length) setFiles(prev => [...prev, ...fs]); };
    input.click();
  };

  const isEditing = showAdd || editingPlan;
  const canActuallyEdit = canEdit && (!editLocked || isAdminRole);

  return (
    <div className="pl-20 pb-3">
      {chapterPlans.length > 0 && (
        <div className="space-y-1 mb-2">
          {chapterPlans.map(plan => {
            const atts = attachmentsByPlan[plan.id] || [];
            const pending = plan.approval_status === 'pending';
            const rejected = plan.approval_status === 'rejected';
            return (
              <div key={plan.id} className={cn(
                "flex items-center gap-2 p-2 rounded-lg transition-colors group",
                plan.is_completed ? "bg-emerald-50/50" : "hover:bg-muted/20",
                pending && "bg-amber-50/40", rejected && "bg-red-50/40"
              )}>
                {canActuallyEdit ? (
                  <button onClick={() => handleToggleComplete(plan)} className="flex-shrink-0">
                    {plan.is_completed ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <Circle className="w-4 h-4 text-muted-foreground hover:text-primary" />}
                  </button>
                ) : (
                  plan.is_completed ? <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" /> : <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded flex-shrink-0">Day {plan.day_number}</span>
                <span className={cn("text-xs font-medium flex-1 truncate", plan.is_completed && "line-through text-muted-foreground")}>{plan.title}</span>
                {pending && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />Pending</span>}
                {rejected && <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">Rejected</span>}
                {plan.notepad_content && <button onClick={() => setOpenNotepadFor(plan)} className="flex-shrink-0" title="View notepad"><NotebookPen className="w-3.5 h-3.5 text-violet-500" /></button>}
                {atts.length > 0 && <span className="text-[10px] text-muted-foreground flex-shrink-0">{atts.length}📎</span>}
                {canActuallyEdit && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 flex-shrink-0">
                    <button onClick={() => setOpenNotepadFor(plan)} className="p-1 rounded hover:bg-muted" title="Open notepad"><NotebookPen className="w-3 h-3 text-violet-500" /></button>
                    <button onClick={() => { setEditingPlan(plan); setTitle(plan.title); setDescription(plan.description || ''); setFiles([]); }} className="p-1 rounded hover:bg-muted"><Pencil className="w-3 h-3 text-muted-foreground" /></button>
                    {canDelete && <button onClick={() => handleDelete(plan)} className="p-1 rounded hover:bg-destructive/10"><Trash2 className="w-3 h-3 text-destructive" /></button>}
                  </div>
                )}
                {isAdminRole && pending && (
                  <button onClick={async () => {
                    await supabase.from('lesson_plans').update({ approval_status: 'approved', approved_by: user?.user_id, approved_at: new Date().toISOString() }).eq('id', plan.id);
                    toast({ title: 'Approved' }); onRefresh();
                  }} className="p-1 rounded bg-emerald-500/10 text-emerald-600 flex-shrink-0" title="Approve"><Check className="w-3 h-3" /></button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editLocked && !isAdminRole && canEdit && (
        <div className="mb-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700 flex items-center gap-2">
          <Lock className="w-3.5 h-3.5" /> Editing disabled. Contact your {user?.role === 'teacher' ? 'admin' : 'super admin'}.
        </div>
      )}

      {isEditing && (
        <div className="p-4 rounded-xl border border-border bg-muted/30 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-primary">
              {editingPlan ? `Edit Day ${editingPlan.day_number}` : `Day ${nextDayNumber} Plan`}
            </span>
            <button onClick={resetForm} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
          </div>

          <p className="text-xs text-muted-foreground">
            Pick how to add your day plan — open a rich notepad, snap a photo, or upload files.
          </p>

          {files.length > 0 && (
            <div className="space-y-1">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-background border border-border">
                  {f.type.startsWith('image/') ? <ImageIcon className="w-4 h-4 text-primary flex-shrink-0" /> : <FileText className="w-4 h-4 text-primary flex-shrink-0" />}
                  <span className="text-xs truncate flex-1">{f.name}</span>
                  <button onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))}><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleSave({ openNotepadAfter: true })}
              disabled={saving}
              className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border-2 border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-700 transition-colors disabled:opacity-50"
              title="Open rich notepad"
            >
              <NotebookPen className="w-5 h-5" />
              <span className="text-[11px] font-semibold">Open Notepad</span>
            </button>
            <button
              onClick={openCamera}
              disabled={saving}
              className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors disabled:opacity-50"
              title="Take a photo"
            >
              <Camera className="w-5 h-5" />
              <span className="text-[11px] font-semibold">Camera</span>
            </button>
            <label className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors cursor-pointer">
              <Upload className="w-5 h-5" />
              <span className="text-[11px] font-semibold">Upload Files</span>
              <input type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.mp4,.webm"
                onChange={e => { const fs = Array.from(e.target.files || []); if (fs.length) setFiles(prev => [...prev, ...fs]); }} />
            </label>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
            {!autoApprove && <span className="text-[10px] text-amber-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Needs approval</span>}
            <div className="flex-1" />
            {(files.length > 0 || editingPlan) && (
              <button onClick={() => handleSave()} disabled={saving}
                className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50">
                {saving ? 'Saving...' : editingPlan ? 'Update Plan' : `Save Day ${nextDayNumber}`}
              </button>
            )}
          </div>
        </div>
      )}

      {canActuallyEdit && !isEditing && (
        <button onClick={() => { setShowAdd(true); setTitle(''); setDescription(''); setFiles([]); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add Day {nextDayNumber} Plan
        </button>
      )}

      {openNotepadFor && (
        <NotepadModal plan={openNotepadFor} canEdit={canActuallyEdit} attachments={attachmentsByPlan[openNotepadFor.id] || []}
          onRemoveAttachment={(a) => removeAttachment(a, openNotepadFor.id)}
          onClose={() => setOpenNotepadFor(null)} onSaved={onRefresh} />
      )}
    </div>
  );
};

const NotepadModal: React.FC<{ plan: DayPlan; canEdit: boolean; attachments: Attachment[]; onRemoveAttachment: (a: Attachment) => void; onClose: () => void; onSaved: () => void }> = ({ plan, canEdit, attachments, onRemoveAttachment, onClose, onSaved }) => {
  const { user } = useAuth();
  const [content, setContent] = useState<any>(plan.notepad_content);
  const [saving, setSaving] = useState(false);
  const isStudent = user?.role === 'student';

  const save = async () => {
    setSaving(true);
    try {
      await supabase.from('lesson_plans').update({ notepad_content: content }).eq('id', plan.id);
      toast({ title: 'Notepad saved' });
      onSaved();
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl max-w-4xl w-full max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <p className="text-xs text-muted-foreground">Day {plan.day_number}</p>
            <h2 className="font-bold text-lg">{plan.title}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <LexicalNotepad initialContent={content} onChange={canEdit && !isStudent ? (json) => setContent(json) : undefined} readOnly={!canEdit || isStudent} preventCopy={isStudent} />
          {attachments.length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-2">Attachments ({attachments.length})</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {attachments.map(a => (
                  <div key={a.id} className="relative group border border-border rounded-lg overflow-hidden">
                    {a.file_type?.startsWith('image/') ? (
                      <img src={a.file_url} alt={a.file_name} className="w-full h-32 object-cover" />
                    ) : (
                      <div className="p-3 flex items-center gap-2 text-xs">
                        <FileText className="w-4 h-4" />
                        <a href={a.file_url} target="_blank" rel="noreferrer" className="truncate hover:underline flex-1">{a.file_name}</a>
                      </div>
                    )}
                    {canEdit && !isStudent && (
                      <button onClick={() => onRemoveAttachment(a)}
                        className="absolute top-1 right-1 p-1 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {canEdit && !isStudent && (
          <div className="flex justify-end gap-2 p-4 border-t border-border">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border">Cancel</button>
            <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-50">{saving ? 'Saving...' : 'Save Notepad'}</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DayPlanSection;
