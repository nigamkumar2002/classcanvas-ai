import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2, Pencil, Camera, Upload, FileText, CheckCircle, Circle, X, Image } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DayPlan {
  id: string;
  chapter_id: string | null;
  day_number: number | null;
  title: string;
  description: string | null;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  is_completed: boolean;
  status: string;
}

interface Props {
  chapterId: string;
  subjectId: string;
  classId: string;
  dayPlans: DayPlan[];
  canEdit: boolean;
  canDelete: boolean;
  onRefresh: () => void;
}

const DayPlanSection: React.FC<Props> = ({ chapterId, subjectId, classId, dayPlans, canEdit, canDelete, onRefresh }) => {
  const { user } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [editingPlan, setEditingPlan] = useState<DayPlan | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const chapterPlans = dayPlans
    .filter(p => p.chapter_id === chapterId)
    .sort((a, b) => (a.day_number || 0) - (b.day_number || 0));

  const nextDayNumber = chapterPlans.length > 0
    ? Math.max(...chapterPlans.map(p => p.day_number || 0)) + 1
    : 1;

  const resetForm = () => {
    setTitle(''); setDescription(''); setFile(null);
    setShowAdd(false); setEditingPlan(null);
  };

  const uploadFile = async (f: File) => {
    const ext = f.name.split('.').pop();
    const path = `day-plans/${chapterId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('lms-materials').upload(path, f);
    if (error) throw error;
    const { data } = supabase.storage.from('lms-materials').getPublicUrl(path);
    return { url: data.publicUrl, name: f.name, type: f.type };
  };

  const handleSave = async () => {
    if (!title.trim()) { toast({ title: 'Title required', variant: 'destructive' }); return; }
    if (!user?.school_id) return;
    setSaving(true);
    try {
      let fileData: { url: string; name: string; type: string } | null = null;
      if (file) fileData = await uploadFile(file);

      if (editingPlan) {
        const updateData: any = { title: title.trim(), description: description.trim() || null };
        if (fileData) {
          updateData.file_url = fileData.url;
          updateData.file_name = fileData.name;
          updateData.file_type = fileData.type;
        }
        const { error } = await supabase.from('lesson_plans').update(updateData).eq('id', editingPlan.id);
        if (error) throw error;
        toast({ title: 'Plan updated' });
      } else {
        const { error } = await (supabase as any).from('lesson_plans').insert({
          chapter_id: chapterId,
          subject_id: subjectId,
          class_id: classId,
          teacher_id: user.user_id,
          school_id: user.school_id,
          day_number: nextDayNumber,
          title: title.trim(),
          description: description.trim() || null,
          file_url: fileData?.url || null,
          file_name: fileData?.name || null,
          file_type: fileData?.type || null,
          planned_date: new Date().toISOString().split('T')[0],
          period_number: 1,
          status: 'planned',
        });
        if (error) throw error;
        toast({ title: `Day ${nextDayNumber} plan added` });
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
      is_completed: !plan.is_completed,
      status: newStatus,
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

  const openCamera = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = (e: any) => {
      const f = e.target.files?.[0];
      if (f) setFile(f);
    };
    input.click();
  };

  const isEditing = showAdd || editingPlan;

  return (
    <div className="pl-20 pb-3">
      {/* Day Plans List */}
      {chapterPlans.length > 0 && (
        <div className="space-y-1 mb-2">
          {chapterPlans.map(plan => (
            <div key={plan.id} className={cn(
              "flex items-center gap-2 p-2 rounded-lg transition-colors group",
              plan.is_completed ? "bg-emerald-50/50" : "hover:bg-muted/20"
            )}>
              {canEdit && (
                <button onClick={() => handleToggleComplete(plan)} className="flex-shrink-0">
                  {plan.is_completed
                    ? <CheckCircle className="w-4 h-4 text-emerald-500" />
                    : <Circle className="w-4 h-4 text-muted-foreground hover:text-primary" />}
                </button>
              )}
              {!canEdit && (
                plan.is_completed
                  ? <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  : <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              )}
              <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded flex-shrink-0">
                Day {plan.day_number}
              </span>
              <span className={cn("text-xs font-medium flex-1 truncate", plan.is_completed && "line-through text-muted-foreground")}>
                {plan.title}
              </span>
              {plan.description && (
                <span className="text-[10px] text-muted-foreground truncate max-w-[100px] hidden sm:inline">{plan.description}</span>
              )}
              {plan.file_url && (
                <a href={plan.file_url} target="_blank" rel="noreferrer" className="flex-shrink-0">
                  {plan.file_type?.startsWith('image/')
                    ? <Image className="w-3.5 h-3.5 text-blue-500" />
                    : <FileText className="w-3.5 h-3.5 text-blue-500" />}
                </a>
              )}
              {canEdit && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 flex-shrink-0">
                  <button onClick={() => {
                    setEditingPlan(plan);
                    setTitle(plan.title);
                    setDescription(plan.description || '');
                    setFile(null);
                  }} className="p-1 rounded hover:bg-muted"><Pencil className="w-3 h-3 text-muted-foreground" /></button>
                  {canDelete && (
                    <button onClick={() => handleDelete(plan)} className="p-1 rounded hover:bg-destructive/10">
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Form */}
      {isEditing && (
        <div className="p-3 rounded-xl border border-border bg-muted/30 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-primary">
              {editingPlan ? `Edit Day ${editingPlan.day_number}` : `Day ${nextDayNumber} Plan`}
            </span>
            <button onClick={resetForm} className="p-1 rounded hover:bg-muted"><X className="w-3.5 h-3.5" /></button>
          </div>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="What to teach? (e.g. Introduction to Algebra)"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief notes (optional)"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
          <div className="flex items-center gap-2">
            {file ? (
              <div className="flex items-center gap-2 flex-1 p-2 rounded-lg bg-background border border-border">
                <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-xs truncate flex-1">{file.name}</span>
                <button onClick={() => setFile(null)}><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
              </div>
            ) : (
              <>
                <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs font-medium cursor-pointer hover:bg-muted transition-colors">
                  <Upload className="w-3.5 h-3.5" /> File
                  <input type="file" className="hidden" accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.mp4,.webm"
                    onChange={e => e.target.files?.[0] && setFile(e.target.files[0])} />
                </label>
                <button onClick={openCamera}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs font-medium hover:bg-muted transition-colors">
                  <Camera className="w-3.5 h-3.5" /> Camera
                </button>
              </>
            )}
            <div className="flex-1" />
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50">
              {saving ? 'Saving...' : editingPlan ? 'Update' : 'Add'}
            </button>
          </div>
        </div>
      )}

      {/* Add Plan Button */}
      {canEdit && !isEditing && (
        <button onClick={() => { setShowAdd(true); setTitle(''); setDescription(''); setFile(null); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add Day {nextDayNumber} Plan
        </button>
      )}
    </div>
  );
};

export default DayPlanSection;
