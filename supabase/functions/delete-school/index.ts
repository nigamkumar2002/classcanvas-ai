import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.25.76';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BodySchema = z.object({
  school_id: z.string().uuid(),
});

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const deleteBySchool = async (client: ReturnType<typeof createClient>, table: string, schoolId: string) => {
  const { error } = await client.from(table).delete().eq('school_id', schoolId);
  if (error) throw new Error(`${table}: ${error.message}`);
};

const extractStoragePath = (fileUrl?: string | null) => {
  if (!fileUrl) return null;
  const marker = '/storage/v1/object/public/lms-materials/';
  const index = fileUrl.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(fileUrl.slice(index + marker.length));
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
    const { data: requesterRoleRow } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .single();

    if (requesterRoleRow?.role !== 'developer') {
      return json({ error: 'Only developers can delete schools' }, 403);
    }

    const { school_id } = parsed.data;

    const [{ data: school }, { data: profiles }, { data: materials }, { data: liveSessions }] = await Promise.all([
      supabaseAdmin.from('schools').select('id, name').eq('id', school_id).single(),
      supabaseAdmin.from('profiles').select('user_id').eq('school_id', school_id),
      supabaseAdmin.from('materials').select('file_url').eq('school_id', school_id),
      supabaseAdmin.from('live_sessions').select('id').eq('school_id', school_id),
    ]);

    if (!school) return json({ error: 'School not found' }, 404);

    const schoolUserIds = (profiles || []).map((profile) => profile.user_id);
    const liveSessionIds = (liveSessions || []).map((session) => session.id);
    const materialPaths = (materials || [])
      .map((material) => extractStoragePath(material.file_url))
      .filter((path): path is string => Boolean(path));

    if (materialPaths.length > 0) {
      for (let index = 0; index < materialPaths.length; index += 100) {
        const batch = materialPaths.slice(index, index + 100);
        const { error } = await supabaseAdmin.storage.from('lms-materials').remove(batch);
        if (error) throw new Error(error.message);
      }
    }

    if (liveSessionIds.length > 0) {
      const { error: participantError } = await supabaseAdmin
        .from('live_session_participants')
        .delete()
        .in('session_id', liveSessionIds);

      if (participantError) throw new Error(participantError.message);
    }

    const schoolTables = [
      'exam_results',
      'questions',
      'exams',
      'materials',
      'chapters',
      'subjects',
      'classes',
      'content_approvals',
      'attendance',
      'grades',
      'certificates',
      'fee_records',
      'feedback',
      'study_plans',
      'announcements',
      'schedules',
      'audit_logs',
      'live_sessions',
      'assignment_submissions',
      'messages',
      'notifications',
    ];

    for (const table of schoolTables) {
      await deleteBySchool(supabaseAdmin, table, school_id);
    }

    if (schoolUserIds.length > 0) {
      const { error: rolesError } = await supabaseAdmin.from('user_roles').delete().in('user_id', schoolUserIds);
      if (rolesError) throw new Error(rolesError.message);
    }

    const { error: profilesError } = await supabaseAdmin.from('profiles').delete().eq('school_id', school_id);
    if (profilesError) throw new Error(profilesError.message);

    for (const userId of schoolUserIds) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (error) throw new Error(error.message);
    }

    const { error: schoolDeleteError } = await supabaseAdmin.from('schools').delete().eq('id', school_id);
    if (schoolDeleteError) throw new Error(schoolDeleteError.message);

    return json({
      success: true,
      deleted_school_id: school_id,
      deleted_school_name: school.name,
      deleted_users: schoolUserIds.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, 500);
  }
});