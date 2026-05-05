import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Upload, Loader2, FileText, CheckCircle, AlertTriangle, Trash2, Eye, Download } from 'lucide-react';
import { toast } from 'sonner';

interface UploadRow {
  id: string;
  file_name: string;
  file_url: string;
  pyq_year: number | null;
  status: string;
  questions_extracted: number;
  questions_inserted: number;
  questions_skipped: number;
  written_extracted?: number;
  written_inserted?: number;
  error_log: string | null;
  extracted_questions: any[];
  extraction_meta?: any;
  created_at: string;
}

const getUploadSubject = (upload: UploadRow) =>
  upload.extraction_meta?.detected_subject || upload.extracted_questions?.[0]?.subject_name || 'Subject pending';

const isStuckProcessing = (upload: UploadRow) =>
  upload.status === 'processing' && Date.now() - new Date(upload.created_at).getTime() > 120000;

const canRestartUpload = (upload: UploadRow) => upload.status === 'failed' || isStuckProcessing(upload);

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

  const canUpload = user && ['developer', 'super_admin', 'admin', 'teacher'].includes(user.role);
  const canApprove = user && ['developer', 'super_admin', 'admin'].includes(user.role);

  useEffect(() => {
    if (!canUpload) return;
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

  // Poll every 4s while any upload is still pending/processing
  useEffect(() => {
    if (!canUpload) return;
    const hasActive = uploads.some(u => u.status === 'pending' || u.status === 'processing');
    if (!hasActive) return;
    const interval = setInterval(refresh, 4000);
    return () => clearInterval(interval);
  }, [uploads, canUpload]);

  if (!canUpload) {
    return <div className="p-8 text-center text-muted-foreground">You don't have permission to access PYQ uploads.</div>;
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

      toast.success('Uploaded. Extraction started…');
      setFile(null);
      await refresh();

      const { error: invokeError } = await supabase.functions.invoke('ingest-pyq-pdf', {
        body: { upload_id: row.id, class_id: classId },
      });

      if (invokeError) {
        const failureMessage = invokeError.message || 'Failed to start extraction';
        await (supabase as any)
          .from('pyq_uploads')
          .update({ status: 'failed', error_log: failureMessage })
          .eq('id', row.id);

        await refresh();
        throw new Error(failureMessage);
      }
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
      toast.success(`Saved: ${data.inserted} MCQ + ${data.written_inserted || 0} written. Skipped ${data.skipped + (data.written_skipped || 0)} duplicates.`);
    setReviewing(null);
    refresh();
  };

  const restartExtraction = async (upload: UploadRow) => {
    if (!classId) { toast.error('Pick a Class 10 to attach questions to'); return; }
    const { error } = await supabase.functions.invoke('ingest-pyq-pdf', { body: { upload_id: upload.id, class_id: classId } });
    if (error) { toast.error(error.message); return; }
    toast.success('Extraction restarted');
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
          {uploading ? 'Starting extraction…' : 'Upload & Extract with AI'}
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
                    <p className="text-xs text-muted-foreground">
                      {getUploadSubject(u)} · Year {u.pyq_year}
                      {' · '}MCQ: {u.questions_extracted} extracted / {u.questions_inserted} saved
                      {' · '}Written: {u.written_extracted ?? 0} extracted / {u.written_inserted ?? 0} saved
                      {' · '}{u.questions_skipped} dupes
                      {u.extraction_meta?.progress_message && <> · {u.extraction_meta.progress_message}</>}
                      {canRestartUpload(u) && <> · restart available</>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 ${
                    u.status === 'approved' ? 'bg-green-100 text-green-800' :
                    u.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                    u.status === 'failed' ? 'bg-red-100 text-red-800' :
                    'bg-amber-100 text-amber-800'
                  }`}>
                    {(u.status === 'pending' || u.status === 'processing') && <Loader2 className="w-3 h-3 animate-spin" />}
                    {u.status}
                  </span>
                  {u.file_url && (
                    <>
                      <a href={u.file_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs px-2 py-1 border rounded-lg flex items-center gap-1 hover:bg-muted" title="View PDF">
                        <Eye className="w-3 h-3" /> View
                      </a>
                      <a href={u.file_url} download={u.file_name}
                        className="text-xs px-2 py-1 border rounded-lg flex items-center gap-1 hover:bg-muted" title="Download PDF">
                        <Download className="w-3 h-3" /> Download
                      </a>
                    </>
                  )}
                  {u.status === 'completed' && canApprove && (
                    <button onClick={() => setReviewing(u)} className="text-sm px-3 py-1 bg-primary text-primary-foreground rounded-lg">Review & Approve</button>
                  )}
                  {canRestartUpload(u) && (
                    <button onClick={() => restartExtraction(u)} className="text-sm px-3 py-1 border border-border rounded-lg hover:bg-muted">Restart fast extraction</button>
                  )}
                  {u.status === 'approved' && <CheckCircle className="w-4 h-4 text-green-600" />}
                  {u.status === 'completed' && !canApprove && (
                    <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-800 font-medium">Awaiting admin approval</span>
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
            <p className="text-sm text-muted-foreground">
              MCQs: {reviewing.extracted_questions?.length || 0} extracted
              {(reviewing.written_extracted ?? 0) > 0 && (
                <> · Written: {reviewing.written_extracted} extracted</>
              )}
              {' '}· Saving will dedupe, create the {reviewing.pyq_year} mock exam, and add written questions to chapters.
            </p>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              <p className="text-xs font-bold uppercase text-muted-foreground sticky top-0 bg-card pb-1">MCQs</p>
              {(reviewing.extracted_questions || []).slice(0, 20).map((q: any, i: number) => (
                <div key={i} className="p-3 border rounded-lg text-sm">
                  <p className="font-medium">{i + 1}. {q.question_text}</p>
                  <p className="text-xs text-muted-foreground mt-1">A) {q.option_a} · B) {q.option_b} · C) {q.option_c} · D) {q.option_d}</p>
                  <p className="text-xs mt-1"><span className="font-bold text-green-600">Answer: {q.correct_answer}</span> · {q.subject_name} → {q.chapter_name}</p>
                </div>
              ))}
              {(reviewing.extracted_questions?.length || 0) > 20 && <p className="text-xs text-center text-muted-foreground">… and {reviewing.extracted_questions.length - 20} more MCQs</p>}

              {(reviewing.extraction_meta?.written_questions?.length || 0) > 0 && (
                <>
                  <p className="text-xs font-bold uppercase text-muted-foreground sticky top-0 bg-card pb-1 pt-3">Written / Subjective</p>
                  {(reviewing.extraction_meta.written_questions || []).slice(0, 15).map((w: any, i: number) => (
                    <div key={`w-${i}`} className="p-3 border rounded-lg text-sm bg-amber-50/40">
                      <p className="font-medium">{i + 1}. {w.question_text}</p>
                      <p className="text-xs mt-1">
                        <span className="font-bold text-amber-700">{w.marks} mark{w.marks !== 1 ? 's' : ''}</span>
                        {' '}· {w.question_type?.replace('_', ' ')} · {w.subject_name} → {w.chapter_name}
                      </p>
                    </div>
                  ))}
                  {(reviewing.extraction_meta.written_questions.length || 0) > 15 && (
                    <p className="text-xs text-center text-muted-foreground">… and {reviewing.extraction_meta.written_questions.length - 15} more written questions</p>
                  )}
                </>
              )}
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
