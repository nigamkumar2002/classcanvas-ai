import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    let deleted = 0;
    let skipped = 0;
    const errors: string[] = [];
    let page = 1;
    const perPage = 200;

    // Loop pages until no more
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) {
        errors.push(`listUsers page ${page}: ${error.message}`);
        break;
      }
      const users = data?.users ?? [];
      if (users.length === 0) break;

      for (const u of users) {
        // Skip if profile still exists (i.e. user belongs to another school)
        const { data: prof } = await admin
          .from('profiles')
          .select('user_id')
          .eq('user_id', u.id)
          .maybeSingle();
        if (prof) {
          skipped++;
          continue;
        }
        const { error: delErr } = await admin.auth.admin.deleteUser(u.id);
        if (delErr) {
          errors.push(`${u.email}: ${delErr.message}`);
        } else {
          deleted++;
        }
      }

      if (users.length < perPage) break;
      page++;
      if (page > 50) break; // safety cap (10k users)
    }

    return new Response(JSON.stringify({ deleted, skipped, errors }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
