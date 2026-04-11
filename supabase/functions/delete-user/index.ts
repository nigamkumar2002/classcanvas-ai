import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.25.76';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BodySchema = z.object({
  target_user_id: z.string().uuid(),
});

type AppRole = 'developer' | 'super_admin' | 'admin' | 'teacher' | 'student';

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const deleteRows = async (client: ReturnType<typeof createClient>, table: string, column: string, value: string) => {
  const { error } = await client.from(table).delete().eq(column, value);
  if (error) throw new Error(`${table}: ${error.message}`);
};

const clearNullableReference = async (client: ReturnType<typeof createClient>, table: string, column: string, value: string) => {
  const { error } = await client.from(table).update({ [column]: null }).eq(column, value);
  if (error) throw new Error(`${table}: ${error.message}`);
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

    const { target_user_id } = parsed.data;

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user: requestingUser },
      error: authError,
    } = await supabaseUser.auth.getUser(token);

    if (authError || !requestingUser) return json({ error: 'Unauthorized' }, 401);
    if (requestingUser.id === target_user_id) return json({ error: 'You cannot delete your own account here' }, 400);

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const [{ data: requesterRoleRow }, { data: requesterProfileRow }, { data: targetProfileRow }, { data: targetRoleRow }] = await Promise.all([
      supabaseAdmin.from('user_roles').select('role').eq('user_id', requestingUser.id).single(),
      supabaseAdmin.from('profiles').select('school_id').eq('user_id', requestingUser.id).single(),
      supabaseAdmin.from('profiles').select('user_id, full_name, school_id').eq('user_id', target_user_id).single(),
      supabaseAdmin.from('user_roles').select('role').eq('user_id', target_user_id).single(),
    ]);

    const requesterRole = requesterRoleRow?.role as AppRole | undefined;
    const targetRole = targetRoleRow?.role as AppRole | undefined;

    if (!requesterRole || !targetProfileRow || !targetRole) {
      return json({ error: 'User information could not be found' }, 404);
    }

    const allowedTargets: Record<AppRole, AppRole[]> = {
      developer: ['super_admin', 'admin', 'teacher', 'student'],
      super_admin: ['admin', 'teacher', 'student'],
      admin: ['teacher', 'student'],
      teacher: [],
      student: [],
    };

    if (!allowedTargets[requesterRole]?.includes(targetRole)) {
      return json({ error: `You cannot delete ${targetRole} accounts` }, 403);
    }

    if (requesterRole !== 'developer' && requesterProfileRow?.school_id !== targetProfileRow.school_id) {
      return json({ error: 'You can only delete users from your own school' }, 403);
    }

    if (targetRole === 'student') {
      await Promise.all([
        deleteRows(supabaseAdmin, 'assignment_submissions', 'student_id', target_user_id),
        deleteRows(supabaseAdmin, 'attendance', 'student_id', target_user_id),
        deleteRows(supabaseAdmin, 'certificates', 'student_id', target_user_id),
        deleteRows(supabaseAdmin, 'exam_results', 'student_id', target_user_id),
        deleteRows(supabaseAdmin, 'fee_records', 'student_id', target_user_id),
        deleteRows(supabaseAdmin, 'feedback', 'student_id', target_user_id),
        deleteRows(supabaseAdmin, 'grades', 'student_id', target_user_id),
        deleteRows(supabaseAdmin, 'study_plans', 'student_id', target_user_id),
      ]);
    } else {
      const { data: ownedLiveSessions, error: liveSessionError } = await supabaseAdmin
        .from('live_sessions')
        .select('id')
        .eq('teacher_id', target_user_id);

      if (liveSessionError) throw new Error(liveSessionError.message);

      const liveSessionIds = (ownedLiveSessions || []).map((session) => session.id);
      if (liveSessionIds.length > 0) {
        const { error: participantsError } = await supabaseAdmin
          .from('live_session_participants')
          .delete()
          .in('session_id', liveSessionIds);

        if (participantsError) throw new Error(participantsError.message);
      }

      await Promise.all([
        deleteRows(supabaseAdmin, 'live_sessions', 'teacher_id', target_user_id),
        deleteRows(supabaseAdmin, 'schedules', 'teacher_id', target_user_id),
        clearNullableReference(supabaseAdmin, 'classes', 'created_by', target_user_id),
        clearNullableReference(supabaseAdmin, 'exams', 'created_by', target_user_id),
        clearNullableReference(supabaseAdmin, 'materials', 'uploaded_by', target_user_id),
        clearNullableReference(supabaseAdmin, 'schools', 'created_by', target_user_id),
        clearNullableReference(supabaseAdmin, 'subjects', 'teacher_id', target_user_id),
      ]);
    }

    await Promise.all([
      deleteRows(supabaseAdmin, 'audit_logs', 'user_id', target_user_id),
      deleteRows(supabaseAdmin, 'content_approvals', 'reviewer_id', target_user_id),
      deleteRows(supabaseAdmin, 'content_approvals', 'submitted_by', target_user_id),
      deleteRows(supabaseAdmin, 'live_session_participants', 'user_id', target_user_id),
      deleteRows(supabaseAdmin, 'messages', 'recipient_id', target_user_id),
      deleteRows(supabaseAdmin, 'messages', 'sender_id', target_user_id),
      deleteRows(supabaseAdmin, 'notifications', 'user_id', target_user_id),
      deleteRows(supabaseAdmin, 'user_roles', 'user_id', target_user_id),
      deleteRows(supabaseAdmin, 'profiles', 'user_id', target_user_id),
    ]);

    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(target_user_id);
    if (deleteAuthError) throw new Error(deleteAuthError.message);

    return json({
      success: true,
      deleted_user_id: target_user_id,
      full_name: targetProfileRow.full_name,
      deleted_role: targetRole,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, 500);
  }
});