import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.25.76';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type AppRole = 'developer' | 'super_admin' | 'admin' | 'teacher' | 'student';

const BodySchema = z.object({
  target_user_id: z.string().uuid(),
  full_name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['super_admin', 'admin', 'teacher', 'student']),
  class_id: z.string().uuid().nullable().optional(),
  admission_no: z.string().trim().max(80).nullable().optional(),
  roll_no: z.string().trim().max(80).nullable().optional(),
  section: z.string().trim().max(80).nullable().optional(),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

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

    const { target_user_id, full_name, email, role, class_id, admission_no, roll_no, section, date_of_birth } = parsed.data;

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user: requestingUser },
      error: authError,
    } = await supabaseUser.auth.getUser(token);

    if (authError || !requestingUser) return json({ error: 'Unauthorized' }, 401);
    if (requestingUser.id === target_user_id) {
      return json({ error: 'Use your profile page to update your own account details' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const [{ data: requesterRoleRow }, { data: requesterProfileRow }, { data: targetProfileRow }, { data: targetRoleRow }] = await Promise.all([
      supabaseAdmin.from('user_roles').select('role').eq('user_id', requestingUser.id).single(),
      supabaseAdmin.from('profiles').select('school_id').eq('user_id', requestingUser.id).single(),
      supabaseAdmin.from('profiles').select('user_id, full_name, email, school_id, class_id').eq('user_id', target_user_id).single(),
      supabaseAdmin.from('user_roles').select('role').eq('user_id', target_user_id).single(),
    ]);

    const requesterRole = requesterRoleRow?.role as AppRole | undefined;
    const targetRole = targetRoleRow?.role as AppRole | undefined;

    if (!requesterRole || !targetRole || !targetProfileRow) {
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
      return json({ error: `You cannot update ${targetRole} accounts` }, 403);
    }

    if (!allowedTargets[requesterRole]?.includes(role)) {
      return json({ error: `You cannot assign the ${role} role` }, 403);
    }

    if (requesterRole !== 'developer' && requesterProfileRow?.school_id !== targetProfileRow.school_id) {
      return json({ error: 'You can only update users from your own school' }, 403);
    }

    let nextClassId: string | null = role === 'student'
      ? (class_id ?? targetProfileRow.class_id ?? null)
      : null;

    if (role === 'student' && !nextClassId) {
      return json({ error: 'Students must be assigned to a class' }, 400);
    }

    if (nextClassId) {
      const { data: classRecord, error: classError } = await supabaseAdmin
        .from('classes')
        .select('id, school_id')
        .eq('id', nextClassId)
        .single();

      if (classError || !classRecord) {
        return json({ error: 'Selected class could not be found' }, 400);
      }

      if (targetProfileRow.school_id && classRecord.school_id !== targetProfileRow.school_id) {
        return json({ error: 'Selected class does not belong to the same school' }, 400);
      }
    }

    const authUpdate: Record<string, unknown> = {
      email,
      user_metadata: {
        full_name,
        role,
      },
    };

    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(target_user_id, authUpdate);
    if (authUpdateError) throw new Error(authUpdateError.message);

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        full_name,
        email,
        role,
        class_id: nextClassId,
        admission_no: role === 'student' ? (admission_no || null) : null,
        roll_no: role === 'student' ? (roll_no || null) : null,
        section: role === 'student' ? (section || null) : null,
        date_of_birth: role === 'student' ? (date_of_birth || null) : null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', target_user_id);

    if (profileError) throw new Error(profileError.message);

    if (role !== targetRole) {
      const { error: deleteRoleError } = await supabaseAdmin
        .from('user_roles')
        .delete()
        .eq('user_id', target_user_id);

      if (deleteRoleError) throw new Error(deleteRoleError.message);

      const { error: insertRoleError } = await supabaseAdmin
        .from('user_roles')
        .insert({ user_id: target_user_id, role });

      if (insertRoleError) throw new Error(insertRoleError.message);
    }

    return json({
      success: true,
      updated_user_id: target_user_id,
      role,
      class_id: nextClassId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, 500);
  }
});
