import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: requestingUser }, error: authError } = await supabaseUser.auth.getUser(token);
    if (authError || !requestingUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get requesting user role
    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .single();

    const requestingRole = roleData?.role;

    // Get requesting user's school_id
    const { data: reqProfile } = await supabaseAdmin
      .from('profiles')
      .select('school_id')
      .eq('user_id', requestingUser.id)
      .single();

    const body = await req.json();
    const { email, password, full_name, role, school_id, class_id } = body;

    if (!email || !password || !full_name || !role) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: corsHeaders });
    }

    // Role permission check - developer can create admins/super_admins
    const allowedToCreate: Record<string, string[]> = {
      developer: ['super_admin', 'admin', 'teacher', 'student'],
      super_admin: ['admin', 'teacher', 'student'],
      admin: ['teacher', 'student'],
      teacher: ['student'],
    };

    if (!requestingRole || !allowedToCreate[requestingRole]?.includes(role)) {
      return new Response(JSON.stringify({ error: `You don't have permission to create ${role} accounts` }), { status: 403, headers: corsHeaders });
    }

    // Determine school_id: developer passes it explicitly, others inherit their own
    const assignedSchoolId = requestingRole === 'developer' ? (school_id || null) : (reqProfile?.school_id || null);

    if (role !== 'developer' && !assignedSchoolId) {
      return new Response(JSON.stringify({ error: 'Target school is required for this user role' }), { status: 400, headers: corsHeaders });
    }

    // Validate class assignment for students
    if (role === 'student' && !class_id) {
      return new Response(JSON.stringify({ error: 'Student must be assigned to a class' }), { status: 400, headers: corsHeaders });
    }

    if (role === 'student' && class_id) {
      const { data: classRecord, error: classError } = await supabaseAdmin
        .from('classes')
        .select('id, school_id')
        .eq('id', class_id)
        .single();

      if (classError || !classRecord) {
        return new Response(JSON.stringify({ error: 'Invalid class selected' }), { status: 400, headers: corsHeaders });
      }

      if (assignedSchoolId && classRecord.school_id !== assignedSchoolId) {
        return new Response(JSON.stringify({ error: 'Selected class does not belong to the assigned school' }), { status: 400, headers: corsHeaders });
      }
    }

    // Create the auth user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role },
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), { status: 400, headers: corsHeaders });
    }

    // Insert profile with school_id and optional class_id for students
    const profileData: any = {
      user_id: newUser.user!.id,
      email,
      full_name,
      role,
      is_demo: false,
      school_id: assignedSchoolId,
      class_id: role === 'student' ? class_id : null,
    };
    await supabaseAdmin.from('profiles').insert(profileData);

    // Insert user role
    await supabaseAdmin.from('user_roles').insert({
      user_id: newUser.user!.id,
      role,
    });

    return new Response(JSON.stringify({ success: true, user_id: newUser.user!.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
});
