import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Printer, BookOpen, FileText, ChevronRight } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import LexicalNotepad from '@/components/notepad/LexicalNotepad';

interface Class { id: string; name: string; }
interface Subject { id: string; name: string; class_id: string; }
interface Chapter { id: string; name: string; subject_id: string; }
interface DayPlan {
  id: string; chapter_id: string | null; subject_id: string; class_id: string;
  day_number: number | null; title: string; description: string | null;
  notepad_content: any; file_url: string | null; file_name: string | null;
  approval_status: string;
}

const StudyMaterialPrintPage: React.FC = () => {
  const { user } = useAuth();
  const [school, setSchool] = useState<any>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [plans, setPlans] = useState<DayPlan[]>([]);
  const [attachmentsByPlan, setAttachmentsByPlan] = useState<Record<string, any[]>>({});

  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [dayPlanId, setDayPlanId] = useState('');
  const [mode, setMode] = useState<'single' | 'booklet'>('single');

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({ contentRef: printRef as any });

  useEffect(() => {
    (async () => {
      if (!user?.school_id) return;
      const [s, c, sub, ch, lp] = await Promise.all([
        supabase.from('schools').select('*').eq('id', user.school_id).maybeSingle(),
        supabase.from('classes').select('id, name').eq('school_id', user.school_id),
        supabase.from('subjects').select('id, name, class_id').eq('school_id', user.school_id),
        supabase.from('chapters').select('id, name, subject_id').eq('school_id', user.school_id),
        supabase.from('lesson_plans').select('*').eq('school_id', user.school_id).limit(1000),
      ]);
      setSchool(s.data);
      setClasses((c.data || []) as any);
      setSubjects((sub.data || []) as any);
      setChapters((ch.data || []) as any);
      setPlans((lp.data || []) as any);
      const ids = (lp.data || []).map((p: any) => p.id);
      if (ids.length) {
        const { data: atts } = await supabase.from('lesson_plan_attachments').select('*').in('lesson_plan_id', ids);
        const m: Record<string, any[]> = {};
        (atts || []).forEach((a: any) => { (m[a.lesson_plan_id] ||= []).push(a); });
        setAttachmentsByPlan(m);
      }
    })();
  }, [user?.school_id]);

  const filteredSubjects = subjects.filter(s => !classId || s.class_id === classId);
  const filteredChapters = chapters.filter(c => !subjectId || c.subject_id === subjectId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  const filteredPlans = useMemo(() => plans
    .filter(p => (!classId || p.class_id === classId)
      && (!subjectId || p.subject_id === subjectId)
      && (!chapterId || p.chapter_id === chapterId)
      && p.approval_status === 'approved')
    .sort((a, b) => (a.day_number || 0) - (b.day_number || 0)),
    [plans, classId, subjectId, chapterId]);

  const printPlans = useMemo(() => {
    if (mode === 'single' && dayPlanId) return filteredPlans.filter(p => p.id === dayPlanId);
    return filteredPlans;
  }, [mode, dayPlanId, filteredPlans]);

  const className = classes.find(c => c.id === classId)?.name || 'All Classes';
  const subjectName = subjects.find(s => s.id === subjectId)?.name || 'All Subjects';
  const chapterName = chapters.find(c => c.id === chapterId)?.name || 'All Chapters';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Printer className="w-8 h-8 text-primary" /> Study Material — Print
        </h1>
        <p className="text-muted-foreground mt-1">Generate and print lesson plan booklets. Admin and Super Admin only.</p>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Class">
            <select value={classId} onChange={e => { setClassId(e.target.value); setSubjectId(''); setChapterId(''); setDayPlanId(''); }} className="input">
              <option value="">— Any —</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Subject">
            <select value={subjectId} onChange={e => { setSubjectId(e.target.value); setChapterId(''); setDayPlanId(''); }} className="input" disabled={!classId}>
              <option value="">— Any —</option>
              {filteredSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Chapter">
            <select value={chapterId} onChange={e => { setChapterId(e.target.value); setDayPlanId(''); }} className="input" disabled={!subjectId}>
              <option value="">— Any —</option>
              {filteredChapters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Mode">
            <select value={mode} onChange={e => setMode(e.target.value as any)} className="input">
              <option value="single">Single Day Plan</option>
              <option value="booklet">Bulk Booklet</option>
            </select>
          </Field>
        </div>
        {mode === 'single' && (
          <Field label="Day Plan">
            <select value={dayPlanId} onChange={e => setDayPlanId(e.target.value)} className="input">
              <option value="">— Select day plan —</option>
              {filteredPlans.map(p => <option key={p.id} value={p.id}>Day {p.day_number} — {p.title}</option>)}
            </select>
          </Field>
        )}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
          <div className="text-sm text-muted-foreground">
            {printPlans.length} plan{printPlans.length !== 1 ? 's' : ''} ready to print
          </div>
          <button onClick={handlePrint} disabled={printPlans.length === 0}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 font-semibold shadow">
            <Printer className="w-4 h-4" /> Print / PDF
          </button>
        </div>
      </div>

      {/* Print Preview */}
      <div className="bg-white rounded-2xl border-2 border-dashed border-border p-2">
        <div ref={printRef} className="bg-white text-black">
          <style>{`
            @media print {
              @page { size: A4; margin: 15mm; }
              .page-break { page-break-after: always; }
              .no-print { display: none; }
            }
            .print-content h1, .print-content h2, .print-content h3 { color: #111; }
          `}</style>
          {/* Cover */}
          <div className="p-8 text-center page-break print-content">
            <h1 className="text-4xl font-bold mb-2">{school?.name || 'School Name'}</h1>
            <p className="text-lg text-gray-600 mb-8">Lesson Plan Booklet</p>
            <div className="space-y-2 text-left max-w-md mx-auto bg-gray-50 p-6 rounded-lg">
              <p><strong>Class:</strong> {className}</p>
              <p><strong>Subject:</strong> {subjectName}</p>
              <p><strong>Chapter:</strong> {chapterName}</p>
              <p><strong>Total Day Plans:</strong> {printPlans.length}</p>
              <p><strong>Generated:</strong> {new Date().toLocaleDateString()}</p>
            </div>
          </div>

          {/* TOC for booklet */}
          {mode === 'booklet' && printPlans.length > 1 && (
            <div className="p-8 page-break print-content">
              <h2 className="text-2xl font-bold mb-4 border-b pb-2">Table of Contents</h2>
              <ol className="space-y-2">
                {printPlans.map(p => {
                  const ch = chapters.find(c => c.id === p.chapter_id)?.name;
                  return (
                    <li key={p.id} className="flex justify-between border-b border-dashed py-1 text-sm">
                      <span>{ch && `${ch} — `}Day {p.day_number}: {p.title}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {/* Plans */}
          {printPlans.map((p, idx) => {
            const ch = chapters.find(c => c.id === p.chapter_id)?.name;
            const subj = subjects.find(s => s.id === p.subject_id)?.name;
            const atts = attachmentsByPlan[p.id] || [];
            return (
              <div key={p.id} className={`p-8 print-content ${idx < printPlans.length - 1 ? 'page-break' : ''}`}>
                <div className="border-b-2 border-gray-800 pb-2 mb-4">
                  <p className="text-xs text-gray-500">{school?.name} · {className} · {subj} · {ch}</p>
                  <h2 className="text-2xl font-bold">Day {p.day_number}: {p.title}</h2>
                </div>
                {p.description && <p className="italic text-gray-700 mb-4">{p.description}</p>}
                {p.notepad_content ? (
                  <div className="prose max-w-none">
                    <LexicalNotepad initialContent={p.notepad_content} readOnly className="border-0" />
                  </div>
                ) : (
                  <p className="text-gray-500">No detailed notepad content for this day.</p>
                )}
                {atts.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-300">
                    <p className="font-semibold mb-2">Attachments ({atts.length}):</p>
                    <div className="grid grid-cols-2 gap-3">
                      {atts.map(a => (
                        a.file_type?.startsWith('image/') ? (
                          <img key={a.id} src={a.file_url} alt={a.file_name} className="max-h-48 object-contain border" />
                        ) : (
                          <div key={a.id} className="text-xs text-gray-600 flex items-center gap-1"><FileText className="w-3 h-3" /> {a.file_name}</div>
                        )
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {printPlans.length === 0 && (
            <div className="p-12 text-center text-gray-400">
              Select filters above to preview content.
            </div>
          )}
        </div>
      </div>
      <style>{`.input{width:100%;padding:0.5rem 0.75rem;border-radius:0.5rem;border:1px solid hsl(var(--border));background:hsl(var(--background));font-size:0.875rem;outline:none}.input:disabled{opacity:0.5}`}</style>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div><label className="block text-xs font-semibold text-muted-foreground mb-1">{label}</label>{children}</div>
);

export default StudyMaterialPrintPage;
