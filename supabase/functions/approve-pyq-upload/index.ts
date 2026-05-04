// Approve & save extracted PYQ questions:
// - Dedupe + auto-create subjects/chapters
// - Insert MCQs into a yearly mock exam (duration scales to extracted MCQ count)
// - Insert written/subjective questions into the new written_questions library (chapter-scoped)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
const normalize = (s: string) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

const parseBilingual = (text: string) => {
  const value = (text || '').trim();
  const hindi = /हिंदी:\s*([\s\S]*?)(?:\nEnglish:|$)/i.exec(value)?.[1]?.trim() || '';
  const english = /English:\s*([\s\S]*)$/i.exec(value)?.[1]?.trim() || '';
  return { hindi, english };
};

const inferSubject = (items: any[]) => {
  const f = new Map<string, number>();
  for (const it of items) {
    const s = normalize(it.subject_name || '');
    if (!s) continue;
    f.set(s, (f.get(s) || 0) + 1);
  }
  return [...f.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'general';
};

const uniqueByHash = <T extends { hash: string; q?: any; w?: any }>(items: T[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const year = item.q?.pyq_year || item.w?.pyq_year || '';
    const key = `${item.hash}:${year}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const { upload_id, class_id, edited_questions } = await req.json();
    if (!upload_id || !class_id) return json({ error: 'upload_id and class_id required' }, 400);

    const userClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleRow } = await admin.from('user_roles').select('role').eq('user_id', user.id).single();
    if (!['admin', 'super_admin', 'developer'].includes(roleRow?.role)) return json({ error: 'Forbidden' }, 403);

    const { data: upload } = await admin.from('pyq_uploads').select('*').eq('id', upload_id).single();
    if (!upload) return json({ error: 'Upload not found' }, 404);

    const { data: cls } = await admin.from('classes').select('id, name, grade_level, school_id').eq('id', class_id).single();
    if (!cls) return json({ error: 'Class not found' }, 404);
    if (cls.grade_level !== 10) return json({ error: 'Board Prep only allowed for Class 10' }, 400);
    if (cls.school_id !== upload.school_id) return json({ error: 'Class/upload school mismatch' }, 400);

    const mcqs = (edited_questions && Array.isArray(edited_questions) ? edited_questions : upload.extracted_questions) as any[];
    const written = (upload.extraction_meta?.written_questions || []) as any[];

    if ((!mcqs || mcqs.length === 0) && (!written || written.length === 0)) {
      return json({ error: 'No questions to save' }, 400);
    }

    const uploadSubjectName = inferSubject([...(mcqs || []), ...(written || [])]);
    const year = upload.pyq_year || new Date().getFullYear();

    // Preload subjects + chapters
    const { data: existingSubjects } = await admin.from('subjects').select('id, name, class_id').eq('class_id', class_id);
    const subjectByName = new Map<string, string>();
    (existingSubjects || []).forEach((s: any) => subjectByName.set(normalize(s.name), s.id));

    const subjectIds = (existingSubjects || []).map((s: any) => s.id);
    const { data: existingChapters } = subjectIds.length > 0
      ? await admin.from('chapters').select('id, name, subject_id').in('subject_id', subjectIds)
      : { data: [] as any[] };
    const chapterKey = (sid: string, name: string) => `${sid}::${normalize(name)}`;
    const chapterByKey = new Map<string, string>();
    (existingChapters || []).forEach((c: any) => chapterByKey.set(chapterKey(c.subject_id, c.name), c.id));

    // Helper to resolve subject + chapter (creating if needed)
    const resolveChapter = async (rawSubject: string | undefined, rawChapter: string | undefined) => {
      const subjName = (rawSubject || uploadSubjectName || 'General').trim();
      const chapName = (rawChapter || 'Unmapped PYQ').trim();

      let subjectId = subjectByName.get(normalize(subjName));
      if (!subjectId) {
        const { data: newSubj } = await admin.from('subjects').insert({
          name: subjName, class_id, school_id: upload.school_id,
        }).select('id').single();
        if (!newSubj) return null;
        subjectId = newSubj.id;
        subjectByName.set(normalize(subjName), subjectId);
      }

      let chapterId = chapterByKey.get(chapterKey(subjectId, chapName));
      if (!chapterId) {
        const { data: newChap } = await admin.from('chapters').insert({
          name: chapName, subject_id: subjectId, school_id: upload.school_id,
        }).select('id').single();
        if (!newChap) return null;
        chapterId = newChap.id;
        chapterByKey.set(chapterKey(subjectId, chapName), chapterId);
      }
      return { subjectId, chapterId, subjName, chapName };
    };

    // ---------------- MCQs ----------------
    let mcqInserted = 0;
    let mcqSkipped = 0;
    let examId: string | null = null;

    if (mcqs && mcqs.length > 0) {
      // Resolve all chapters first
      const preparedRaw: Array<any> = [];
      for (const q of mcqs) {
        const r = await resolveChapter(q.subject_name, q.chapter_name);
        if (!r) { mcqSkipped++; continue; }
        const hashSrc = normalize(q.question_text) + '|' + [q.option_a, q.option_b, q.option_c, q.option_d].map(normalize).sort().join('|');
        const hash = await sha256(hashSrc);
        preparedRaw.push({ q, ...r, hash });
      }
      const prepared = uniqueByHash(preparedRaw);
      mcqSkipped += preparedRaw.length - prepared.length;

      const firstChapterId = prepared[0]?.chapterId;
      if (!firstChapterId) return json({ error: 'No valid chapter mapping for MCQs' }, 400);

      const prettySubject = mcqs[0]?.subject_name || uploadSubjectName || 'General';
      const examTitle = `BSEB Class 10 ${prettySubject} PYQ ${year} – Full Mock`;
      const totalMarks = prepared.length;
      // Duration: ~1.5 min per MCQ, min 30 min, max 180 min
      const durationMinutes = Math.max(30, Math.min(180, Math.round(totalMarks * 1.5)));

      const { data: existingExam } = await admin.from('exams')
        .select('id').eq('school_id', upload.school_id).eq('exam_kind', 'pyq_mock')
        .eq('pyq_year', year).eq('title', examTitle).maybeSingle();

      if (existingExam) {
        examId = existingExam.id;
        // Update marks/duration to match latest extraction
        await admin.from('exams').update({
          total_marks: totalMarks, duration_minutes: durationMinutes,
        }).eq('id', examId);
      } else {
        const { data: newExam, error: eErr } = await admin.from('exams').insert({
          title: examTitle,
          description: `Auto-generated from ${upload.file_name}`,
          chapter_id: firstChapterId,
          school_id: upload.school_id,
          created_by: user.id,
          duration_minutes: durationMinutes,
          total_marks: totalMarks,
          pass_marks: Math.max(1, Math.round(totalMarks * 0.33)),
          is_active: true,
          publish_status: 'published',
          exam_kind: 'pyq_mock',
          pyq_year: year,
          is_board_prep: true,
        }).select('id').single();
        if (eErr || !newExam) return json({ error: 'Failed to create mock exam: ' + eErr?.message }, 500);
        examId = newExam.id;
      }

      let order = 0;
      for (const p of prepared) {
        const { data: dup } = await admin.from('questions')
          .select('id').eq('school_id', upload.school_id)
          .eq('chapter_id', p.chapterId).eq('pyq_year', year).eq('question_hash', p.hash).maybeSingle();
        if (dup) { mcqSkipped++; continue; }

        const bQ = parseBilingual(p.q.question_text || '');
        const bA = parseBilingual(p.q.option_a || '');
        const bB = parseBilingual(p.q.option_b || '');
        const bC = parseBilingual(p.q.option_c || '');
        const bD = parseBilingual(p.q.option_d || '');

        const { error: qErr } = await admin.from('questions').insert({
          exam_id: examId,
          school_id: upload.school_id,
          chapter_id: p.chapterId,
          question_text: p.q.question_text,
          option_a: p.q.option_a, option_b: p.q.option_b, option_c: p.q.option_c, option_d: p.q.option_d,
          correct_answer: p.q.correct_answer,
          marks: 1,
          order_index: order++,
          pyq_year: year,
          difficulty: p.q.difficulty || 'medium',
          question_hash: p.hash,
          source: 'pyq',
          tags: [
            `subject:${normalize(p.subjName)}`,
            `chapter:${normalize(p.chapName)}`,
            'lang:hi-en',
            ...(bQ.hindi ? ['question:hi'] : []),
            ...(bQ.english ? ['question:en'] : []),
            ...(bA.hindi && bB.hindi && bC.hindi && bD.hindi ? ['options:hi'] : []),
            ...(bA.english && bB.english && bC.english && bD.english ? ['options:en'] : []),
          ],
        });
        if (qErr) { mcqSkipped++; continue; }
        mcqInserted++;
      }
    }

    // ---------------- Written / Subjective ----------------
    let writtenInserted = 0;
    let writtenSkipped = 0;

    if (written && written.length > 0) {
      let order = 0;
      const preparedRaw: Array<any> = [];
      for (const w of written) {
        const r = await resolveChapter(w.subject_name, w.chapter_name);
        if (!r) { writtenSkipped++; continue; }
        const hashSrc = normalize(w.question_text);
        const hash = await sha256(hashSrc);
        preparedRaw.push({ w, ...r, hash });
      }
      const prepared = uniqueByHash(preparedRaw);
      writtenSkipped += preparedRaw.length - prepared.length;

      for (const p of prepared) {
        // dedupe via unique index (school, chapter, hash)
        const { data: dup } = await admin.from('written_questions')
          .select('id').eq('school_id', upload.school_id)
          .eq('chapter_id', p.chapterId).eq('pyq_year', year).eq('question_hash', p.hash).maybeSingle();
        if (dup) { writtenSkipped++; continue; }

        const { error: wErr } = await admin.from('written_questions').insert({
          school_id: upload.school_id,
          chapter_id: p.chapterId,
          subject_id: p.subjectId,
          upload_id: upload.id,
          question_text: p.w.question_text,
          marks: p.w.marks || 2,
          pyq_year: year,
          question_type: p.w.question_type || 'short_answer',
          difficulty: p.w.difficulty || 'medium',
          source: 'pyq',
          question_hash: p.hash,
          tags: [`subject:${normalize(p.subjName)}`, `chapter:${normalize(p.chapName)}`, 'lang:hi-en'],
          order_index: order++,
          created_by: user.id,
        });
        if (wErr) { writtenSkipped++; continue; }
        writtenInserted++;
      }
    }

    await admin.from('pyq_uploads').update({
      status: 'approved',
      questions_inserted: mcqInserted,
      questions_skipped: mcqSkipped,
      written_inserted: writtenInserted,
      subject_id: subjectByName.get(normalize(uploadSubjectName)) || null,
    }).eq('id', upload_id);

    return json({
      success: true,
      inserted: mcqInserted,
      skipped: mcqSkipped,
      written_inserted: writtenInserted,
      written_skipped: writtenSkipped,
      exam_id: examId,
    });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
