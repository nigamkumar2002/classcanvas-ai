import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Upload, Loader2, FileText, CheckCircle, AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface UploadRow {
  id: string;
  file_name: string;
  pyq_year: number | null;
  status: string;
  questions_extracted: number;
  questions_inserted: number;
  questions_skipped: number;
  error_log: string | null;
  extracted_questions: any[];
  created_at: string;
}

const BoardPrepUploadPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [year, setYear] = useState<number>(new Date().getFullYear() - 1);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [classId, setClassId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [reviewing, setReviewing] = useState<UploadRow | null>(null);

  const canManage = user && ['developer', 'super_admin', 'admin'].includes(user.role);

  useEffect(() => {
    if (!canManage) return;
    refresh();
    (async () => {
      const { data } = await supabase.from('classes').select('id, name, grade_level').eq('grade_level', 10) as any;
      setClasses(data || []);
      if (data?.[0]) setClassId(data[0].id);
    })();
  }, [user]);

  const refresh = async () => {
    const { data } = await (supabase as any).from('pyq_uploads').select('*').order('created_at', { ascending: false }).limit(50);
    setUploads(data || []);
  };

  if (!canManage) {
    return <div className="p-8 text-center text-muted-foreground">Only admins can manage PYQ uploads.</div>;
  }

  const handleUpload = async () => {
    if (!file || !user?.school_id) { toast.error('Choose a PDF file'); return; }
    setUploading(true);
    try {
      const path = `pyq/${user.school_id}/${Date.now()}_${file.name}`;
      const { error: upErr } = await supabase.storage.from('lms-materials').upload(path, file);
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('lms-materials').getPublicUrl(path);

      const { data: row, error: insErr } = await (supabase as any).from('pyq_uploads').insert({
        school_id: user.school_id,
        uploaded_by: user.user_id,
        file_url: urlData.publicUrl,
        file_name: file.name,
        pyq_year: year,
        status: 'pending',
      }).select('*').single();
      if (insErr) throw insErr;

      toast.success('Uploaded. Extracting questions with AI…');
      setFile(null);
      await refresh();

      // Trigger AI extraction
      const { data: extData, error: extErr } = await supabase.functions.invoke('ingest-pyq-pdf', { body: { upload_id: row.id } });
      if (extErr) throw extErr;
      toast.success(`Extracted ${extData?.extracted_count || 0} questions. Review and approve below.`);
      await refresh();
    } catch (e: any) {
      toast.error(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleApprove = async (upload: UploadRow) => {
    if (!classId) { toast.error('Pick a Class 10 to attach questions to'); return; }
    const { data, error } = await supabase.functions.invoke('approve-pyq-upload', {
      body: { upload_id: upload.id, class_id: classId },
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`Saved: ${data.inserted} new, ${data.skipped} skipped (duplicates).`);
    setReviewing(null);
    refresh();
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Upload className="w-6 h-6" /> PYQ Upload Manager</h1>
        <button onClick={() => navigate('/board-prep')} className="text-sm text-primary hover:underline">← Back to Board Prep</button>
      </div>

      {/* Upload form */}
      <div className="bg-card border rounded-2xl p-6 space-y-4">
        <h2 className="font-bold">Upload New PYQ PDF</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} className="text-sm border rounded-lg p-2" />
          <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} placeholder="Year" className="border rounded-lg p-2 text-sm" />
          <select value={classId} onChange={e => setClassId(e.target.value)} className="border rounded-lg p-2 text-sm">
            <option value="">-- Pick Class 10 --</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button onClick={handleUpload} disabled={uploading || !file || !classId}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium disabled:opacity-50 flex items-center gap-2">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? 'Processing…' : 'Upload & Extract with AI'}
        </button>
      </div>

      {/* Uploads list */}
      <div className="bg-card border rounded-2xl p-4">
        <h2 className="font-bold mb-3">Recent Uploads</h2>
        {uploads.length === 0 ? <p className="text-sm text-muted-foreground">No uploads yet.</p> : (
          <div className="space-y-2">
            {uploads.map(u => (
              <div key={u.id} className="p-3 border rounded-lg flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{u.file_name}</p>
                    <p className="text-xs text-muted-foreground">Year {u.pyq_year} · {u.questions_extracted} extracted · {u.questions_inserted} saved · {u.questions_skipped} dupes</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    u.status === 'approved' ? 'bg-green-100 text-green-800' :
                    u.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                    u.status === 'failed' ? 'bg-red-100 text-red-800' :
                    'bg-amber-100 text-amber-800'
                  }`}>{u.status}</span>
                  {u.status === 'completed' && (
                    <button onClick={() => setReviewing(u)} className="text-sm px-3 py-1 bg-primary text-primary-foreground rounded-lg">Review & Approve</button>
                  )}
                  {u.error_log && <span title={u.error_log}><AlertTriangle className="w-4 h-4 text-destructive" /></span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Review modal */}
      {reviewing && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl max-w-4xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">Review: {reviewing.file_name}</h3>
              <button onClick={() => setReviewing(null)} className="text-muted-foreground">✕</button>
            </div>
            <p className="text-sm text-muted-foreground">{reviewing.extracted_questions?.length || 0} questions extracted. Saving will dedupe and create a {reviewing.pyq_year} mock exam.</p>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {(reviewing.extracted_questions || []).slice(0, 20).map((q: any, i: number) => (
                <div key={i} className="p-3 border rounded-lg text-sm">
                  <p className="font-medium">{i + 1}. {q.question_text}</p>
                  <p className="text-xs text-muted-foreground mt-1">A) {q.option_a} · B) {q.option_b} · C) {q.option_c} · D) {q.option_d}</p>
                  <p className="text-xs mt-1"><span className="font-bold text-green-600">Answer: {q.correct_answer}</span> · {q.subject_name} → {q.chapter_name}</p>
                </div>
              ))}
              {(reviewing.extracted_questions?.length || 0) > 20 && <p className="text-xs text-center text-muted-foreground">… and {reviewing.extracted_questions.length - 20} more</p>}
            </div>
            <div className="flex gap-2 justify-end pt-2 border-t">
              <select value={classId} onChange={e => setClassId(e.target.value)} className="border rounded-lg p-2 text-sm">
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={() => setReviewing(null)} className="px-4 py-2 border rounded-lg">Cancel</button>
              <button onClick={() => handleApprove(reviewing)} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg flex items-center gap-2">
                <CheckCircle className="w-4 h-4" /> Approve & Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BoardPrepUploadPage;
