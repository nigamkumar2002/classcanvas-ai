import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Order matters: parents before children
const TABLE_ORDER = [
  'classes', 'subjects', 'chapters', 'materials',
  'exams', 'questions', 'written_questions',
  'lesson_plans', 'lesson_plan_attachments',
  'homework_assignments', 'homework_submissions', 'assignment_submissions',
  'attendance', 'grades', 'certificates', 'fee_records',
  'announcements', 'notifications', 'messages',
  'feedback', 'complaints', 'complaint_activity', 'complaint_responses',
  'content_approvals', 'audit_logs',
  'live_sessions', 'live_session_participants',
  'practice_tests', 'practice_questions', 'practice_quotas',
  'study_plans', 'revision_items', 'schedules',
  'pyq_uploads', 'school_settings', 'board_prep_settings',
  'exam_results',
];

// FK mapping: which columns inside each table reference which entity-type
const FK_MAP: Record<string, Record<string, string>> = {
  // entityType => { table.column references }
};

// Generic remap helper using the idMap
function remapRow(row: any, idMap: Map<string, string>, schoolId: string) {
  const out: any = { ...row };
  out.school_id = schoolId;
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (typeof v === 'string' && idMap.has(v)) out[k] = idMap.get(v);
  }
  return out;
}

function genHandle(name: string) {
  return (name || 'school').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'school';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const auth = req.headers.get('authorization');
    if (!auth) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const backup = body.backup;
    const newSchoolName: string | undefined = body.new_school_name;
    const tempPassword: string = body.temp_password || 'Welcome@2026';
    if (!backup?.school || !backup?.tables) return json({ error: 'Invalid backup file' }, 400);

    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser(auth.replace('Bearer ', ''));
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(url, service);
    const { data: roleRow } = await admin.from('user_roles').select('role').eq('user_id', user.id).single();
    if (roleRow?.role !== 'developer') return json({ error: 'Only developers can import school backups' }, 403);

    const idMap = new Map<string, string>();
    const errors: any[] = [];

    // 1. Create new school
    const oldSchool = backup.school;
    const targetName = newSchoolName || `${oldSchool.name} (Restored)`;
    const targetCode = `${(oldSchool.code || 'IMP').slice(0, 8)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const { data: newSchool, error: schoolErr } = await admin.from('schools').insert({
      name: targetName, code: targetCode, description: oldSchool.description,
      address: oldSchool.address, city: oldSchool.city, state: oldSchool.state,
      country: oldSchool.country, phone: oldSchool.phone, email: oldSchool.email,
      created_by: user.id,
    }).select().single();
    if (schoolErr || !newSchool) return json({ error: `Failed to create school: ${schoolErr?.message}` }, 500);
    idMap.set(oldSchool.id, newSchool.id);

    // 2. Recreate auth users + profiles
    const profiles = backup.tables.profiles || [];
    const userRolesByOld = new Map<string, string>(
      (backup.tables.user_roles || []).map((r: any) => [r.user_id, r.role])
    );
    const handle = genHandle(targetName);
    for (const p of profiles) {
      try {
        const role = userRolesByOld.get(p.user_id) || p.role || 'student';
        const newEmail = `${handle}.${p.user_id.slice(0, 6)}@${handle}.local`;
        const { data: created, error: ce } = await admin.auth.admin.createUser({
          email: newEmail,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name: p.full_name, role, original_email: p.email },
        });
        if (ce || !created.user) { errors.push({ user: p.email, error: ce?.message }); continue; }
        idMap.set(p.user_id, created.user.id);
        await admin.from('profiles').update({
          full_name: p.full_name, email: newEmail, role,
          school_id: newSchool.id, admission_no: p.admission_no, roll_no: p.roll_no,
          section: p.section, date_of_birth: p.date_of_birth, is_demo: false,
        }).eq('user_id', created.user.id);
        await admin.from('user_roles').upsert({ user_id: created.user.id, role });
      } catch (e: any) { errors.push({ user: p.email, error: e.message }); }
    }

    // class_id remap on profiles happens in step 4

    // 3. Pre-generate IDs for every other table (so cross-references resolve)
    for (const t of TABLE_ORDER) {
      const rows = backup.tables[t] || [];
      for (const r of rows) {
        if (r.id && !idMap.has(r.id)) idMap.set(r.id, crypto.randomUUID());
      }
    }

    // 4. Update profiles with remapped class_id
    for (const p of profiles) {
      const newUserId = idMap.get(p.user_id);
      if (!newUserId) continue;
      const newClassId = p.class_id ? idMap.get(p.class_id) : null;
      if (p.class_id && newClassId) {
        await admin.from('profiles').update({ class_id: newClassId }).eq('user_id', newUserId);
      }
    }

    // 5. Insert each table in order, remapping all UUID values
    const inserted: Record<string, number> = {};
    for (const t of TABLE_ORDER) {
      const rows = backup.tables[t] || [];
      if (!rows.length) { inserted[t] = 0; continue; }
      const remapped = rows.map((r: any) => {
        const out = remapRow(r, idMap, newSchool.id);
        // ensure id is the pre-allocated mapped one
        if (r.id) out.id = idMap.get(r.id);
        return out;
      });
      // chunk inserts
      let ok = 0;
      for (let i = 0; i < remapped.length; i += 500) {
        const chunk = remapped.slice(i, i + 500);
        const { error } = await admin.from(t).insert(chunk);
        if (error) {
          errors.push({ table: t, error: error.message, sample_count: chunk.length });
        } else ok += chunk.length;
      }
      inserted[t] = ok;
    }

    return json({
      success: true,
      new_school: newSchool,
      inserted,
      profiles_created: profiles.length - errors.filter(e => e.user).length,
      errors,
      temp_password: tempPassword,
      notice: `All users have been re-created with the temporary password "${tempPassword}". Please reset them via the Users page.`,
    });
  } catch (e: any) {
    return json({ error: e.message, stack: e.stack }, 500);
  }
});
