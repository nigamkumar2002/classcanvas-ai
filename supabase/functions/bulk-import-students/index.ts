import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.25.76';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RowSchema = z.object({
  admission_no: z.string().trim().min(1).max(50),
  full_name: z.string().trim().min(1).max(255),
  class_id: z.string().uuid(),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  roll_no: z.string().trim().max(50).nullable().optional(),
  section: z.string().trim().max(50).nullable().optional(),
});

const BodySchema = z.object({
  school_id: z.string().uuid().optional(),
  rows: z.array(RowSchema).min(1).max(500),
});

type AppRole = 'developer' | 'super_admin' | 'admin' | 'teacher' | 'student';

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const normalizeAdmissionNo = (value: string) => value.trim().replace(/\s+/g, '').replace(/\.0$/, '').toUpperCase();

const buildSchoolHandle = (schoolCode?: string | null, schoolName?: string | null) => {
  const source = String(schoolCode || schoolName || 'school').trim().toLowerCase();
  const firstToken = source.split(/[^a-z0-9]+/).filter(Boolean)[0] || 'school';
  return firstToken.replace(/[^a-z0-9]+/g, '');
};

const generateStudentEmail = (admissionNo: string, schoolCode?: string | null, schoolName?: string | null) =>
  `${normalizeAdmissionNo(admissionNo).toLowerCase()}@${buildSchoolHandle(schoolCode, schoolName)}.com`;

const formatPassword = (dateOfBirth: string) => {
  const [year, month, day] = dateOfBirth.split('-');
  return `${day}${month}${year}`;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('authorization');

    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user: requestingUser },
      error: authError,
    } = await supabaseUser.auth.getUser(token);

    if (authError || !requestingUser) return json({ error: 'Unauthorized' }, 401);

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const [{ data: requesterRoleRow }, { data: requesterProfileRow }] = await Promise.all([
      supabaseAdmin.from('user_roles').select('role').eq('user_id', requestingUser.id).single(),
      supabaseAdmin.from('profiles').select('school_id').eq('user_id', requestingUser.id).single(),
    ]);

    const requesterRole = requesterRoleRow?.role as AppRole | undefined;
    if (!requesterRole || !['developer', 'super_admin', 'admin'].includes(requesterRole)) {
      return json({ error: 'You do not have permission to bulk import students' }, 403);
    }

    const targetSchoolId = requesterRole === 'developer' ? parsed.data.school_id : requesterProfileRow?.school_id;
    if (!targetSchoolId) return json({ error: 'A target school is required' }, 400);

    const rows = parsed.data.rows.map((row) => ({
      ...row,
      admission_no: normalizeAdmissionNo(row.admission_no),
      roll_no: row.roll_no?.trim() || null,
      section: row.section?.trim().toUpperCase() || null,
    }));

    const [{ data: school }, { data: classes }, { data: existingAdmissions }] = await Promise.all([
      supabaseAdmin.from('schools').select('id, name, code').eq('id', targetSchoolId).single(),
      supabaseAdmin.from('classes').select('id').eq('school_id', targetSchoolId),
      (supabaseAdmin.from('profiles').select('admission_no').eq('school_id', targetSchoolId).eq('role', 'student') as any).in('admission_no', rows.map((row) => row.admission_no)),
    ]);

    if (!school) return json({ error: 'School not found' }, 404);

    const classIds = new Set((classes || []).map((item) => item.id));
    const takenAdmissions = new Set(
      (((existingAdmissions as Array<{ admission_no?: string }> | null) || [])
        .map((item) => normalizeAdmissionNo(item.admission_no || ''))
        .filter(Boolean)),
    );
    const batchAdmissions = new Set<string>();

    const created: Array<{ admission_no: string; email: string; user_id: string }> = [];
    const errors: Array<{ admission_no: string; error: string }> = [];

    for (const row of rows) {
      if (!classIds.has(row.class_id)) {
        errors.push({ admission_no: row.admission_no, error: 'Selected class does not belong to this school' });
        continue;
      }

      if (takenAdmissions.has(row.admission_no) || batchAdmissions.has(row.admission_no)) {
        errors.push({ admission_no: row.admission_no, error: 'Admission number already exists' });
        continue;
      }

      const email = generateStudentEmail(row.admission_no, school.code, school.name);
      const password = formatPassword(row.date_of_birth);

      const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: row.full_name, role: 'student' },
      });

      if (createUserError || !createdUser.user) {
        errors.push({ admission_no: row.admission_no, error: createUserError?.message || 'Unable to create user account' });
        continue;
      }

      const profilePayload = {
        user_id: createdUser.user.id,
        email,
        full_name: row.full_name,
        role: 'student',
        is_demo: false,
        school_id: targetSchoolId,
        class_id: row.class_id,
        admission_no: row.admission_no,
        roll_no: row.roll_no,
        section: row.section,
        date_of_birth: row.date_of_birth,
      };

      const { error: profileError } = await supabaseAdmin.from('profiles').insert(profilePayload as never);
      if (profileError) {
        await supabaseAdmin.auth.admin.deleteUser(createdUser.user.id);
        errors.push({ admission_no: row.admission_no, error: profileError.message });
        continue;
      }

      const { error: roleError } = await supabaseAdmin.from('user_roles').insert({
        user_id: createdUser.user.id,
        role: 'student',
      });

      if (roleError) {
        await supabaseAdmin.from('profiles').delete().eq('user_id', createdUser.user.id);
        await supabaseAdmin.auth.admin.deleteUser(createdUser.user.id);
        errors.push({ admission_no: row.admission_no, error: roleError.message });
        continue;
      }

      batchAdmissions.add(row.admission_no);
      created.push({ admission_no: row.admission_no, email, user_id: createdUser.user.id });
    }

    return json({
      success: true,
      created_count: created.length,
      skipped_count: errors.length,
      created,
      errors,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, 500);
  }
});