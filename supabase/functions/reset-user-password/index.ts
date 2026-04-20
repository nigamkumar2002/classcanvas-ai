import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.25.76';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type AppRole = 'developer' | 'super_admin' | 'admin' | 'teacher' | 'student';

const BodySchema = z.object({
  target_user_id: z.string().uuid(),
  new_password: z.string().min(6).max(128),
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

    const { target_user_id, new_password } = parsed.data;

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: requestingUser }, error: authError } = await supabaseUser.auth.getUser(token);
    if (authError || !requestingUser) return json({ error: 'Unauthorized' }, 401);

    if (requestingUser.id === target_user_id) {
      return json({ error: 'Use your profile page to change your own password' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const [{ data: requesterRoleRow }, { data: requesterProfileRow }, { data: targetProfileRow }, { data: targetRoleRow }] = await Promise.all([
      supabaseAdmin.from('user_roles').select('role').eq('user_id', requestingUser.id).single(),
      supabaseAdmin.from('profiles').select('school_id').eq('user_id', requestingUser.id).single(),
      supabaseAdmin.from('profiles').select('user_id, school_id, is_demo, full_name').eq('user_id', target_user_id).single(),
      supabaseAdmin.from('user_roles').select('role').eq('user_id', target_user_id).single(),
    ]);

    const requesterRole = requesterRoleRow?.role as AppRole | undefined;
    const targetRole = targetRoleRow?.role as AppRole | undefined;

    if (!requesterRole || !targetRole || !targetProfileRow) {
      return json({ error: 'User information could not be found' }, 404);
    }

    if (targetProfileRow.is_demo) {
      return json({ error: 'Demo account passwords cannot be changed' }, 403);
    }

    const allowedTargets: Record<AppRole, AppRole[]> = {
      developer: ['super_admin', 'admin', 'teacher', 'student'],
      super_admin: ['admin', 'teacher', 'student'],
      admin: ['teacher', 'student'],
      teacher: [],
      student: [],
    };

    if (!allowedTargets[requesterRole]?.includes(targetRole)) {
      return json({ error: `You cannot change ${targetRole} passwords` }, 403);
    }

    if (requesterRole !== 'developer' && requesterProfileRow?.school_id !== targetProfileRow.school_id) {
      return json({ error: 'You can only change passwords for users in your own school' }, 403);
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(target_user_id, {
      password: new_password,
    });
    if (updateError) throw new Error(updateError.message);

    return json({ success: true, target_user_id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, 500);
  }
});
