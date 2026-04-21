// Approve & save extracted PYQ questions: dedupe, auto-create chapters,
// insert questions, and create a year-wise pyq_mock exam (100Q, 165min).
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

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleRow } = await admin.from('user_roles').select('role').eq('user_id', user.id).single();
    if (!['admin', 'super_admin', 'developer'].includes(roleRow?.role)) {
      return json({ error: 'Forbidden' }, 403);
    }

    const { data: upload } = await admin.from('pyq_uploads').select('*').eq('id', upload_id).single();
    if (!upload) return json({ error: 'Upload not found' }, 404);

    // Verify class is grade 10
    const { data: cls } = await admin.from('classes').select('id, name, grade_level, school_id').eq('id', class_id).single();
    if (!cls) return json({ error: 'Class not found' }, 404);
    if (cls.grade_level !== 10) return json({ error: 'Board Prep only allowed for Class 10' }, 400);
    if (cls.school_id !== upload.school_id) return json({ error: 'Class/upload school mismatch' }, 400);

    const questions = (edited_questions && Array.isArray(edited_questions) ? edited_questions : upload.extracted_questions) as any[];
    if (!questions?.length) return json({ error: 'No questions to save' }, 400);

    // Load existing subjects + chapters for this class
    const { data: existingSubjects } = await admin.from('subjects').select('id, name, class_id').eq('class_id', class_id);
    const subjectByName = new Map<string, string>();
    (existingSubjects || []).forEach(s => subjectByName.set(normalize(s.name), s.id));

    const { data: existingChapters } = await admin.from('chapters').select('id, name, subject_id').in('subject_id', (existingSubjects || []).map(s => s.id).concat('00000000-0000-0000-0000-000000000000'));
    const chapterKey = (sid: string, name: string) => `${sid}::${normalize(name)}`;
    const chapterByKey = new Map<string, string>();
    (existingChapters || []).forEach(c => chapterByKey.set(chapterKey(c.subject_id, c.name), c.id));

    // Auto-create missing subjects/chapters
    let inserted = 0, skipped = 0;
    const insertedQuestionIds: string[] = [];

    for (const q of questions) {
      const subjName = (q.subject_name || 'General').trim();
      const chapName = (q.chapter_name || 'Unmapped PYQ').trim();

      let subjectId = subjectByName.get(normalize(subjName));
      if (!subjectId) {
        const { data: newSubj, error: sErr } = await admin.from('subjects').insert({
          name: subjName, class_id, school_id: upload.school_id,
        }).select('id').single();
        if (sErr || !newSubj) { skipped++; continue; }
        subjectId = newSubj.id;
        subjectByName.set(normalize(subjName), subjectId);
      }

      let chapterId = chapterByKey.get(chapterKey(subjectId, chapName));
      if (!chapterId) {
        const { data: newChap, error: cErr } = await admin.from('chapters').insert({
          name: chapName, subject_id: subjectId, school_id: upload.school_id,
        }).select('id').single();
        if (cErr || !newChap) { skipped++; continue; }
        chapterId = newChap.id;
        chapterByKey.set(chapterKey(subjectId, chapName), chapterId);
      }

      const hashSrc = normalize(q.question_text) + '|' + [q.option_a, q.option_b, q.option_c, q.option_d].map(normalize).sort().join('|');
      const qHash = await sha256(hashSrc);

      // We need a host exam_id later. For now insert into a holding exam or directly into questions linked to chapter.
      // Strategy: create one mock exam per year first (below) then insert questions linked to it.
      // But questions table requires exam_id. So we create the mock exam first, batched below.
      // Defer: collect all valid items, create exam, insert.
      (q as any).__chapter_id = chapterId;
      (q as any).__subject_id = subjectId;
      (q as any).__hash = qHash;
    }

    // Create or get a year-wise mock exam (100Q, 165min)
    const year = upload.pyq_year || new Date().getFullYear();
    const examTitle = `BSEB Class 10 PYQ ${year} – Full Mock`;
    // Use first subject/chapter as host (exam.chapter_id is required)
    const firstChapterId = (questions.find(q => (q as any).__chapter_id) as any)?.__chapter_id;
    if (!firstChapterId) return json({ error: 'No valid chapter mapping' }, 400);

    const { data: existingExam } = await admin.from('exams').select('id').eq('school_id', upload.school_id).eq('exam_kind', 'pyq_mock').eq('pyq_year', year).maybeSingle();

    let examId = existingExam?.id;
    if (!examId) {
      const { data: newExam, error: eErr } = await admin.from('exams').insert({
        title: examTitle,
        description: `Auto-generated from ${upload.file_name}`,
        chapter_id: firstChapterId,
        school_id: upload.school_id,
        created_by: user.id,
        duration_minutes: 165,
        total_marks: 100,
        pass_marks: 33,
        is_active: true,
        publish_status: 'published',
        exam_kind: 'pyq_mock',
        pyq_year: year,
        is_board_prep: true,
      }).select('id').single();
      if (eErr || !newExam) return json({ error: 'Failed to create mock exam: ' + eErr?.message }, 500);
      examId = newExam.id;
    }

    // Insert questions with dedupe
    let order = 0;
    for (const q of questions) {
      const cid = (q as any).__chapter_id;
      const hash = (q as any).__hash;
      if (!cid || !hash) { skipped++; continue; }

      // Check duplicate
      const { data: dup } = await admin.from('questions').select('id').eq('school_id', upload.school_id).eq('chapter_id', cid).eq('question_hash', hash).maybeSingle();
      if (dup) { skipped++; continue; }

      const { data: newQ, error: qErr } = await admin.from('questions').insert({
        exam_id: examId,
        school_id: upload.school_id,
        chapter_id: cid,
        question_text: q.question_text,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        correct_answer: q.correct_answer,
        marks: 1,
        order_index: order++,
        pyq_year: year,
        difficulty: q.difficulty || 'medium',
        question_hash: hash,
        source: 'pyq',
      }).select('id').single();
      if (qErr) { skipped++; continue; }
      inserted++;
      if (newQ) insertedQuestionIds.push(newQ.id);
    }

    await admin.from('pyq_uploads').update({
      status: 'approved',
      questions_inserted: inserted,
      questions_skipped: skipped,
    }).eq('id', upload_id);

    return json({ success: true, inserted, skipped, exam_id: examId });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
