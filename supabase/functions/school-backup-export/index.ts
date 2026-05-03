import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Tables that have a school_id column and should be backed up
const SCHOOL_TABLES = [
  'profiles', 'classes', 'subjects', 'chapters', 'materials',
  'exams', 'questions', 'written_questions', 'exam_results',
  'attendance', 'grades', 'certificates', 'fee_records',
  'announcements', 'notifications', 'messages',
  'lesson_plans', 'lesson_plan_attachments',
  'homework_assignments', 'homework_submissions',
  'assignment_submissions', 'feedback',
  'complaints', 'complaint_activity', 'complaint_responses',
  'content_approvals', 'audit_logs',
  'live_sessions', 'live_session_participants',
  'practice_tests', 'practice_questions', 'practice_quotas',
  'study_plans', 'revision_items', 'schedules',
  'pyq_uploads', 'school_settings', 'board_prep_settings',
];

async function fetchAll(admin: any, table: string, schoolId: string) {
  const out: any[] = [];
  let from = 0;
  const size = 1000;
  while (true) {
    let q: any = admin.from(table).select('*').range(from, from + size - 1);
    // live_session_participants has no school_id; join via live_sessions later
    if (table !== 'live_session_participants') q = q.eq('school_id', schoolId);
    const { data, error } = await q;
    if (error) {
      if (error.message?.includes('does not exist')) return [];
      throw new Error(`${table}: ${error.message}`);
    }
    if (!data?.length) break;
    out.push(...data);
    if (data.length < size) break;
    from += size;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const auth = req.headers.get('authorization');
    if (!auth) return json({ error: 'Unauthorized' }, 401);

    const { school_id } = await req.json();
    if (!school_id) return json({ error: 'school_id required' }, 400);

    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser(auth.replace('Bearer ', ''));
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(url, service);
    const { data: roleRow } = await admin.from('user_roles').select('role').eq('user_id', user.id).single();
    if (roleRow?.role !== 'developer') return json({ error: 'Only developers can export school backups' }, 403);

    const { data: school, error: schoolErr } = await admin.from('schools').select('*').eq('id', school_id).single();
    if (schoolErr || !school) return json({ error: 'School not found' }, 404);

    const data: Record<string, any[]> = {};
    for (const t of SCHOOL_TABLES) {
      try { data[t] = await fetchAll(admin, t, school_id); } catch (e: any) { data[t] = []; console.error(t, e.message); }
    }

    // user_roles for users in this school
    const userIds = (data.profiles || []).map((p: any) => p.user_id);
    if (userIds.length) {
      const { data: roles } = await admin.from('user_roles').select('*').in('user_id', userIds);
      data.user_roles = roles || [];
    }

    // live_session_participants joined via live_sessions
    const sessionIds = (data.live_sessions || []).map((s: any) => s.id);
    if (sessionIds.length) {
      const { data: lsp } = await admin.from('live_session_participants').select('*').in('session_id', sessionIds);
      data.live_session_participants = lsp || [];
    }

    const totalRows = Object.values(data).reduce((s, a) => s + a.length, 0);

    return json({
      version: '1.0',
      exported_at: new Date().toISOString(),
      exported_by: user.email,
      school,
      tables: data,
      stats: { total_rows: totalRows, ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])) },
      notice: 'Auth passwords are NOT exported (hashed and managed by Supabase). On import, users will get a default temporary password and must reset it.',
    });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});
