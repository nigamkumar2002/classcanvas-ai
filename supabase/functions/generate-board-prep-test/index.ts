// Generate an on-demand board prep test (chapter practice, mixed, or revision).
// Creates a student-facing board prep exam with clear subject/chapter metadata.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: Record<string, unknown>, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const { mode, chapter_id, subject_id, pyq_year, num_questions = 20, duration_minutes = 30 } = await req.json();
    if (!['chapter', 'mixed', 'revision'].includes(mode)) return json({ error: 'invalid mode' }, 400);

    const userClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await admin.from('profiles').select('school_id, class_id').eq('user_id', user.id).single();
    if (!profile?.school_id) return json({ error: 'No school' }, 400);

    const resolveSubjectName = async (chapterId?: string | null, subjectId?: string | null) => {
      if (subjectId) {
        const { data } = await admin.from('subjects').select('name').eq('id', subjectId).maybeSingle();
        if (data?.name) return data.name;
      }
      if (chapterId) {
        const { data } = await admin.from('chapters').select('name, subject:subjects(name)').eq('id', chapterId).maybeSingle();
        return { chapterName: data?.name || null, subjectName: (data as any)?.subject?.name || null };
      }
      return { chapterName: null, subjectName: null };
    };

    // Pull source questions
    let sourceQs: any[] = [];
    if (mode === 'revision') {
      const { data: revs } = await admin.from('revision_items').select('question_id').eq('student_id', user.id).order('priority', { ascending: true }).limit(num_questions);
      const qIds = (revs || []).map(r => r.question_id);
      if (!qIds.length) return json({ error: 'No revision items yet' }, 400);
      const { data: qs } = await admin.from('questions').select('*').in('id', qIds);
      sourceQs = qs || [];
    } else {
      let q = admin.from('questions').select('*').eq('school_id', profile.school_id).eq('source', 'pyq');
      if (chapter_id) q = q.eq('chapter_id', chapter_id);
      if (subject_id && !chapter_id) {
        const { data: subjectChapters } = await admin.from('chapters').select('id').eq('subject_id', subject_id);
        const subjectChapterIds = (subjectChapters || []).map((chapter) => chapter.id);
        if (!subjectChapterIds.length) return json({ error: 'No chapters available for that subject' }, 400);
        q = q.in('chapter_id', subjectChapterIds);
      }
      if (pyq_year) q = q.eq('pyq_year', pyq_year);
      const { data: pool } = await q.limit(500);
      const shuffled = (pool || []).sort(() => Math.random() - 0.5).slice(0, num_questions);
      sourceQs = shuffled;
    }

    if (!sourceQs.length) return json({ error: 'No questions available' }, 400);

    const hostChapterId = sourceQs[0].chapter_id;
    const totalMarks = sourceQs.reduce((s, q) => s + (q.marks || 1), 0);

    const meta = await resolveSubjectName(hostChapterId, subject_id);
    const chapterName = typeof meta === 'string' ? null : meta.chapterName;
    const subjectName = typeof meta === 'string' ? meta : meta.subjectName;

    let title = 'Board Prep Test';
    let description = 'Auto-generated board prep practice';

    if (mode === 'chapter') {
      title = `${subjectName || 'Subject'} • ${chapterName || 'Chapter'} Mock Test`;
      description = `Chapter-wise PYQ practice for ${subjectName || 'the selected subject'}${chapterName ? ` - ${chapterName}` : ''}.`;
    } else if (mode === 'mixed') {
      title = `${subjectName || 'All Subjects'} • Revision Mock Test`;
      description = subjectName
        ? `Mixed PYQ practice across ${subjectName}.`
        : 'Mixed PYQ practice across approved board prep questions.';
    } else if (mode === 'revision') {
      title = `${subjectName || 'Personal'} • Smart Revision Test`;
      description = 'Adaptive revision set created from the student revision queue.';
    }

    const { data: newExam, error: eErr } = await admin.from('exams').insert({
      title,
      description,
      chapter_id: hostChapterId,
      school_id: profile.school_id,
      created_by: user.id,
      duration_minutes,
      total_marks: totalMarks,
      pass_marks: Math.ceil(totalMarks * 0.33),
      is_active: true,
      publish_status: 'published',
      exam_kind: mode === 'revision' ? 'revision' : 'pyq_chapter',
      is_board_prep: true,
    }).select('id').single();
    if (eErr || !newExam) return json({ error: 'Cannot create test: ' + eErr?.message }, 500);

    // Clone questions onto this exam (no hash since dedupe is for the global pool)
    const rows = sourceQs.map((q, i) => ({
      exam_id: newExam.id,
      school_id: profile.school_id,
      chapter_id: q.chapter_id,
      question_text: q.question_text,
      option_a: q.option_a, option_b: q.option_b, option_c: q.option_c, option_d: q.option_d,
      correct_answer: q.correct_answer,
      marks: q.marks || 1,
      order_index: i,
      pyq_year: q.pyq_year,
      difficulty: q.difficulty,
      source: q.source,
    }));
    const { error: insErr } = await admin.from('questions').insert(rows);
    if (insErr) return json({ error: 'Cannot insert questions: ' + insErr.message }, 500);

    return json({ success: true, exam_id: newExam.id });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
