import React, { useState } from 'react';
import { X, Upload, FileText, Video, BookOpen, ClipboardList, BookMarked, FileQuestion } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  chapterId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const TYPES = [
  { value: 'theory', label: 'Theory', icon: BookOpen },
  { value: 'question_bank', label: 'Question Bank', icon: FileQuestion },
  { value: 'exam_practice', label: 'Exam Practice', icon: ClipboardList },
  { value: 'assignment', label: 'Assignment', icon: FileText },
  { value: 'notes', label: 'Notes', icon: BookMarked },
  { value: 'video', label: 'Video', icon: Video },
];

const ContentUploadModal: React.FC<Props> = ({ chapterId, onClose, onSuccess }) => {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [type, setType] = useState('theory');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);

  const handleUpload = async () => {
    if (!title.trim()) { setError('Please enter a title'); return; }
    setUploading(true);
    setError('');

    try {
      let file_url: string | null = null;
      let file_name: string | null = null;
      let file_type: string | null = null;
      let file_size: number | null = null;

      if (file) {
        const ext = file.name.split('.').pop();
        const path = `${chapterId}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('lms-materials')
          .upload(path, file);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('lms-materials').getPublicUrl(path);
        file_url = urlData.publicUrl;
        file_name = file.name;
        file_type = file.type;
        file_size = file.size;
      }

      if (!user?.school_id) {
        throw new Error('Your account is not assigned to a school. Please contact your administrator.');
      }

      const { error: insertError } = await supabase.from('materials').insert({
        chapter_id: chapterId,
        title: title.trim(),
        type,
        file_url,
        file_name,
        file_type,
        file_size,
        uploaded_by: user?.user_id,
        school_id: user.school_id,
      } as any);

      if (insertError) throw insertError;
      onSuccess();
    } catch (error: any) {
      setError(error.message || 'Failed to upload content');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-bold">Upload Content</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

          <div>
            <label className="text-sm font-semibold text-foreground mb-1.5 block">Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Chapter 1 Theory Notes"
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground mb-1.5 block">Content Type</label>
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map(t => (
                <button key={t.value} onClick={() => setType(t.value)}
                  className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-xs font-medium transition-all ${
                    type === t.value ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                  }`}>
                  <t.icon className="w-4 h-4" />{t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground mb-1.5 block">File (optional)</label>
            <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-all ${drag ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}>
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  <span className="text-sm font-medium text-foreground truncate max-w-[200px]">{file.name}</span>
                  <button onClick={() => setFile(null)} className="text-muted-foreground hover:text-red-500"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Drag & drop or</p>
                  <label className="text-sm text-primary font-medium cursor-pointer hover:underline">
                    browse files
                    <input type="file" className="hidden" accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.mp4,.webm"
                      onChange={e => e.target.files?.[0] && setFile(e.target.files[0])} />
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">PDF, DOC, PPT, Images, Videos</p>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3 p-6 border-t border-border">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border font-medium text-sm hover:bg-muted">Cancel</button>
          <button onClick={handleUpload} disabled={uploading}
            className="flex-1 py-2.5 rounded-xl bg-gradient-blue text-white font-medium text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
            {uploading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Uploading...</> : <><Upload className="w-4 h-4" /> Upload</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ContentUploadModal;
