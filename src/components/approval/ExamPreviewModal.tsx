import React, { useEffect, useState } from 'react';
import { X, Save, Trash2, Plus, Loader2, CheckCircle, XCircle, RotateCcw, Printer } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface Question {
  id: string;
  exam_id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  marks: number;
  order_index: number;
}

interface ExamInfo {
  id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  total_marks: number;
  pass_marks: number;
  topic?: string | null;
  chapter_id: string;
  chapter_name?: string;
  subject_name?: string;
  class_name?: string;
  school_name?: string;
}

interface Props {
  examId: string;
  approvalId?: string;
  mode: 'preview' | 'review';
  onClose: () => void;
  onApproved?: () => void;
}

const ExamPreviewModal: React.FC<Props> = ({ examId, approvalId, mode, onClose, onApproved }) => {
  const { user } = useAuth();
  const [exam, setExam] = useState<ExamInfo | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewComment, setReviewComment] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [showPrint, setShowPrint] = useState(false);

  useEffect(() => {
    const fetchExam = async () => {
      const { data: examData } = await supabase.from('exams').select('*').eq('id', examId).single();
      if (!examData) { setLoading(false); return; }

      // Get chapter → subject → class → school names
      let chapter_name = '', subject_name = '', class_name = '', school_name = '';
      const { data: ch } = await supabase.from('chapters').select('name, subject_id').eq('id', examData.chapter_id).single();
      if (ch) {
        chapter_name = ch.name;
        const { data: sub } = await supabase.from('subjects').select('name, class_id').eq('id', ch.subject_id).single();
        if (sub) {
          subject_name = sub.name;
          const { data: cls } = await supabase.from('classes').select('name, school_id').eq('id', sub.class_id).single();
          if (cls) {
            class_name = cls.name;
            if (cls.school_id) {
              const { data: sch } = await supabase.from('schools').select('name').eq('id', cls.school_id).single();
              if (sch) school_name = sch.name;
            }
          }
        }
      }

      setExam({ ...examData, chapter_name, subject_name, class_name, school_name } as ExamInfo);

      const { data: qs } = await supabase.from('questions').select('*').eq('exam_id', examId).order('order_index');
      setQuestions((qs as Question[]) || []);
      setLoading(false);
    };
    fetchExam();
  }, [examId]);

  const updateExamField = (field: string, value: any) => {
    if (!exam) return;
    setExam({ ...exam, [field]: value });
  };

  const updateQuestion = (idx: number, field: string, value: any) => {
    setQuestions(prev => prev.map((q, i) => i === idx ? { ...q, [field]: value } : q));
  };

  const addQuestion = () => {
    setQuestions(prev => [...prev, {
      id: `new_${Date.now()}`,
      exam_id: examId,
      question_text: '',
      option_a: '', option_b: '', option_c: '', option_d: '',
      correct_answer: 'A',
      marks: 1,
      order_index: prev.length + 1,
    }]);
  };

  const removeQuestion = (idx: number) => {
    setQuestions(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSaveChanges = async () => {
    if (!exam) return;
    setSaving(true);
    try {
      const totalMarks = questions.reduce((a, q) => a + q.marks, 0);
      await supabase.from('exams').update({
        title: exam.title,
        description: exam.description,
        duration_minutes: exam.duration_minutes,
        total_marks: totalMarks,
        pass_marks: exam.pass_marks,
        topic: (exam as any).topic || null,
      } as any).eq('id', examId);

      // Delete removed questions and upsert existing
      const existingIds = questions.filter(q => !q.id.startsWith('new_')).map(q => q.id);
      // Delete questions not in our list
      await supabase.from('questions').delete().eq('exam_id', examId).not('id', 'in', `(${existingIds.join(',')})`);

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (q.id.startsWith('new_')) {
          await supabase.from('questions').insert({
            exam_id: examId,
            question_text: q.question_text,
            option_a: q.option_a, option_b: q.option_b,
            option_c: q.option_c, option_d: q.option_d,
            correct_answer: q.correct_answer,
            marks: q.marks,
            order_index: i + 1,
            school_id: user?.school_id || null,
          });
        } else {
          await supabase.from('questions').update({
            question_text: q.question_text,
            option_a: q.option_a, option_b: q.option_b,
            option_c: q.option_c, option_d: q.option_d,
            correct_answer: q.correct_answer,
            marks: q.marks,
            order_index: i + 1,
          }).eq('id', q.id);
        }
      }

      toast.success('Exam updated successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleReview = async (status: string) => {
    if (!approvalId) return;
    setActionLoading(true);
    try {
      // Save any edits first
      await handleSaveChanges();

      await supabase.from('content_approvals').update({
        status,
        reviewer_id: user?.user_id,
        comments: reviewComment || null,
        updated_at: new Date().toISOString(),
      } as any).eq('id', approvalId);

      if (status === 'approved') {
        await supabase.from('exams').update({ is_active: true } as any).eq('id', examId);
      } else if (status === 'rejected') {
        await supabase.from('exams').update({ is_active: false } as any).eq('id', examId);
      }

      toast.success(status === 'approved' ? 'Exam approved!' : status === 'rejected' ? 'Exam rejected' : 'Revision requested');
      onApproved?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to review');
    } finally {
      setActionLoading(false);
    }
  };

  const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'developer';

  const printExam = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow || !exam) return;

    const totalMarks = questions.reduce((a, q) => a + q.marks, 0);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head><title>${exam.title} - Question Paper</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Times New Roman', serif; padding: 20mm; color: #000; font-size: 12pt; line-height: 1.6; }
        .header { text-align: center; border-bottom: 3px double #000; padding-bottom: 15px; margin-bottom: 20px; }
        .school-name { font-size: 20pt; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; }
        .exam-title { font-size: 16pt; font-weight: bold; margin-top: 8px; }
        .meta-row { display: flex; justify-content: space-between; font-size: 10pt; margin-top: 5px; }
        .meta-row span { display: inline-block; }
        .instructions { border: 1px solid #000; padding: 10px; margin: 15px 0; font-size: 10pt; }
        .instructions strong { display: block; margin-bottom: 5px; }
        .question { margin: 15px 0; page-break-inside: avoid; }
        .question-text { font-weight: bold; margin-bottom: 8px; }
        .options { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 20px; margin-left: 20px; }
        .option { padding: 3px 0; }
        .footer { margin-top: 30px; border-top: 1px solid #000; padding-top: 10px; text-align: center; font-size: 9pt; color: #666; }
        @media print { body { padding: 15mm; } }
      </style></head><body>
      <div class="header">
        <div class="school-name">${exam.school_name || 'School Name'}</div>
        <div class="exam-title">${exam.title}</div>
        <div class="meta-row">
          <span>Class: ${exam.class_name || '-'}</span>
          <span>Subject: ${exam.subject_name || '-'}</span>
          <span>Chapter: ${exam.chapter_name || '-'}</span>
        </div>
        <div class="meta-row">
          <span>Duration: ${exam.duration_minutes} minutes</span>
          <span>Total Marks: ${totalMarks}</span>
          <span>Pass Marks: ${exam.pass_marks}</span>
          ${(exam as any).topic ? `<span>Topic: ${(exam as any).topic}</span>` : ''}
        </div>
        <div class="meta-row">
          <span>Date: _______________</span>
          <span>Student Name: ___________________________</span>
          <span>Roll No: __________</span>
        </div>
      </div>
      <div class="instructions">
        <strong>General Instructions:</strong>
        <ol style="margin-left:20px; font-size: 10pt;">
          <li>All questions are compulsory.</li>
          <li>Each question carries the marks indicated.</li>
          <li>Select the correct option (A/B/C/D) for each question.</li>
          <li>No negative marking.</li>
          <li>Time allowed: ${exam.duration_minutes} minutes.</li>
        </ol>
      </div>
      ${questions.map((q, i) => `
        <div class="question">
          <div class="question-text">Q${i + 1}. ${q.question_text} <span style="font-weight:normal; font-size:10pt; color:#666;">[${q.marks} mark${q.marks > 1 ? 's' : ''}]</span></div>
          <div class="options">
            <div class="option">(A) ${q.option_a}</div>
            <div class="option">(B) ${q.option_b}</div>
            <div class="option">(C) ${q.option_c}</div>
            <div class="option">(D) ${q.option_d}</div>
          </div>
        </div>
      `).join('')}
      <div class="footer">--- End of Question Paper --- | Generated by EduCloud LMS</div>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  };

  if (loading) return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-card rounded-2xl p-8"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
    </div>
  );

  if (!exam) return null;

  const totalMarks = questions.reduce((a, q) => a + q.marks, 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-card rounded-2xl border border-border shadow-xl w-full max-w-5xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-card rounded-t-2xl z-10">
          <div>
            <h2 className="text-xl font-bold">{mode === 'review' ? 'Review Exam' : 'Exam Preview'}</h2>
            <p className="text-sm text-muted-foreground">
              {exam.class_name} → {exam.subject_name} → {exam.chapter_name}
              {(exam as any).topic ? ` → ${(exam as any).topic}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={printExam} className="flex items-center gap-1 px-3 py-2 rounded-xl border border-border text-sm hover:bg-muted transition-colors">
              <Printer className="w-4 h-4" /> Print
            </button>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-xl"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Exam details - editable */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Title</label>
              <input value={exam.title} onChange={e => updateExamField('title', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Duration (min)</label>
              <input type="number" value={exam.duration_minutes} onChange={e => updateExamField('duration_minutes', Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Pass Marks</label>
              <input type="number" value={exam.pass_marks} onChange={e => updateExamField('pass_marks', Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Topic (optional)</label>
              <input value={(exam as any).topic || ''} onChange={e => updateExamField('topic', e.target.value)}
                placeholder="e.g. Photosynthesis"
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
            <textarea value={exam.description || ''} onChange={e => updateExamField('description', e.target.value)} rows={2}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm resize-none" />
          </div>

          {/* Exam info bar */}
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-muted/30 text-sm">
            <span className="font-medium">{questions.length} questions</span>
            <span>·</span>
            <span>Total: {totalMarks} marks</span>
            <span>·</span>
            <span>School: {exam.school_name || '-'}</span>
          </div>

          {/* Questions */}
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg">Questions</h3>
            <button onClick={addQuestion} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90">
              <Plus className="w-3.5 h-3.5" /> Add Question
            </button>
          </div>

          <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
            {questions.map((q, i) => (
              <div key={q.id} className="bg-muted/20 border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-primary">Q{i + 1}</span>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">Marks:</label>
                    <input type="number" value={q.marks} onChange={e => updateQuestion(i, 'marks', Number(e.target.value))} min={1}
                      className="w-14 px-2 py-1 rounded-lg border border-border bg-background text-xs text-center" />
                    <button onClick={() => removeQuestion(i)} className="p-1 text-destructive hover:bg-destructive/10 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <textarea value={q.question_text} onChange={e => updateQuestion(i, 'question_text', e.target.value)} rows={2}
                  placeholder="Question text..." className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm mb-3 resize-none outline-none focus:ring-1 focus:ring-primary/30" />
                <div className="grid sm:grid-cols-2 gap-2 mb-2">
                  {(['A', 'B', 'C', 'D'] as const).map(opt => {
                    const field = `option_${opt.toLowerCase()}` as keyof Question;
                    return (
                      <div key={opt} className="flex items-center gap-2">
                        <button onClick={() => updateQuestion(i, 'correct_answer', opt)}
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${
                            q.correct_answer === opt ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground border border-border'
                          }`}>{opt}</button>
                        <input value={q[field] as string} onChange={e => updateQuestion(i, field, e.target.value)}
                          placeholder={`Option ${opt}`} className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-background text-xs outline-none focus:ring-1 focus:ring-primary/30" />
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground">Correct: <span className="font-bold text-green-600">{q.correct_answer}</span></p>
              </div>
            ))}
          </div>

          {/* Super admin final submission warning */}
          {isSuperAdmin && mode === 'review' && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              <strong>⚠️ Final Submission Notice:</strong> As a senior reviewer, your approval is the final step. Once approved, this exam will be published to students and cannot be reversed.
            </div>
          )}

          {/* Review section */}
          {mode === 'review' && approvalId && (
            <div className="border-t border-border pt-4 space-y-3">
              <textarea value={reviewComment} onChange={e => setReviewComment(e.target.value)}
                placeholder="Add review comment (optional)..."
                className="w-full p-3 text-sm rounded-xl border border-border bg-background resize-none focus:ring-2 focus:ring-primary/20" rows={2} />
              <div className="flex flex-wrap gap-2">
                <button onClick={() => handleReview('approved')} disabled={actionLoading}
                  className="flex items-center gap-1 px-4 py-2 text-sm bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50">
                  <CheckCircle className="w-4 h-4" /> Approve & Publish
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
          )}

          {/* Save button for non-review mode */}
          {mode === 'preview' && (
            <div className="flex justify-end gap-3 border-t border-border pt-4">
              <button onClick={handleSaveChanges} disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExamPreviewModal;
