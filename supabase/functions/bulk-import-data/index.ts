import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type AppRole = 'developer' | 'super_admin' | 'admin' | 'teacher' | 'student';

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const buildSchoolHandle = (code?: string | null, name?: string | null) => {
  const src = String(code || name || 'school').trim().toLowerCase();
  return (src.split(/[^a-z0-9]+/).filter(Boolean)[0] || 'school').replace(/[^a-z0-9]+/g, '');
};

const slugifyEmailLocal = (input: string) =>
  input.trim().toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '') || `user${Date.now()}`;

const formatDobPassword = (dob?: string | null) => {
  if (!dob) return null;
  const [y, m, d] = String(dob).split('-');
  if (!y || !m || !d) return null;
  return `${d.padStart(2, '0')}${m.padStart(2, '0')}${y}`;
};

interface ImportPayload {
  schools?: any[];
  users?: any[];
  classes?: any[];
  subjects?: any[];
  chapters?: any[];
  materials?: any[];
}

interface RowError { sheet: string; row: number; identifier: string; error: string }

const summary = {
  schools: 0,
  users: 0,
  classes: 0,
  subjects: 0,
  chapters: 0,
  materials: 0,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser(token);
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: roleRow } = await supabaseAdmin.from('user_roles').select('role').eq('user_id', user.id).single();
    if ((roleRow?.role as AppRole) !== 'developer') {
      return json({ error: 'Only Developer role can perform bulk data imports' }, 403);
    }

    const payload = (await req.json()) as ImportPayload;
    const errors: RowError[] = [];
    const created = { ...summary };

    // Cache lookups
    const schoolCache = new Map<string, { id: string; name: string; code: string | null }>(); // code/name -> school
    const classCache = new Map<string, string>(); // schoolId|className -> id
    const subjectCache = new Map<string, string>(); // schoolId|classId|subjectName -> id
    const chapterCache = new Map<string, string>(); // schoolId|subjectId|chapterName -> id

    const findSchoolByKey = async (key: string) => {
      const k = key.trim().toLowerCase();
      if (schoolCache.has(k)) return schoolCache.get(k)!;
      const { data } = await supabaseAdmin
        .from('schools')
        .select('id, name, code')
        .or(`code.ilike.${k},name.ilike.${k}`)
        .limit(1)
        .maybeSingle();
      if (data) {
        schoolCache.set(k, data as any);
        if (data.code) schoolCache.set(data.code.toLowerCase(), data as any);
        schoolCache.set(data.name.toLowerCase(), data as any);
      }
      return data as any;
    };

    // 1. SCHOOLS
    if (payload.schools?.length) {
      for (let i = 0; i < payload.schools.length; i++) {
        const r = payload.schools[i];
        const ident = r.code || r.name || `row ${i + 2}`;
        try {
          if (!r.name) { errors.push({ sheet: 'schools', row: i + 2, identifier: ident, error: 'name required' }); continue; }
          const code = r.code?.toString().trim() || buildSchoolHandle(null, r.name);
          const { data: existing } = await supabaseAdmin.from('schools').select('id, name, code').eq('code', code).maybeSingle();
          let schoolId: string;
          if (existing) {
            schoolId = existing.id;
          } else {
            const { data: ins, error: e } = await supabaseAdmin.from('schools').insert({
              name: r.name, code, description: r.description || null, address: r.address || null,
              city: r.city || null, state: r.state || null, country: r.country || null,
              email: r.email || null, phone: r.phone || null, created_by: user.id, is_active: true,
            }).select('id, name, code').single();
            if (e) { errors.push({ sheet: 'schools', row: i + 2, identifier: ident, error: e.message }); continue; }
            schoolId = ins!.id;
            created.schools++;
          }
          const cached = { id: schoolId, name: r.name, code };
          schoolCache.set(code.toLowerCase(), cached);
          schoolCache.set(r.name.toLowerCase(), cached);
        } catch (err: any) {
          errors.push({ sheet: 'schools', row: i + 2, identifier: ident, error: err.message });
        }
      }
    }

    // 2. USERS (super_admin / admin / teacher / student)
    if (payload.users?.length) {
      for (let i = 0; i < payload.users.length; i++) {
        const r = payload.users[i];
        const ident = r.email || r.full_name || `row ${i + 2}`;
        try {
          if (!r.full_name || !r.role) {
            errors.push({ sheet: 'users', row: i + 2, identifier: ident, error: 'full_name and role required' }); continue;
          }
          const role = String(r.role).toLowerCase().trim() as AppRole;
          if (!['super_admin', 'admin', 'teacher', 'student'].includes(role)) {
            errors.push({ sheet: 'users', row: i + 2, identifier: ident, error: `invalid role: ${role}` }); continue;
          }

          const schoolKey = (r.school_code || r.school_name || '').toString();
          if (!schoolKey) { errors.push({ sheet: 'users', row: i + 2, identifier: ident, error: 'school_code or school_name required' }); continue; }
          const school = await findSchoolByKey(schoolKey);
          if (!school) { errors.push({ sheet: 'users', row: i + 2, identifier: ident, error: `school not found: ${schoolKey}` }); continue; }

          const handle = buildSchoolHandle(school.code, school.name);
          const email = (r.email && String(r.email).trim()) ||
            (role === 'student' && r.admission_no
              ? `${String(r.admission_no).toLowerCase().replace(/\s+/g, '')}@${handle}.com`
              : `${slugifyEmailLocal(r.full_name)}@${handle}.com`);

          const password = (r.password && String(r.password)) ||
            (role === 'student' && r.date_of_birth ? formatDobPassword(r.date_of_birth) : null) ||
            `${handle.charAt(0).toUpperCase()}${handle.slice(1)}@${new Date().getFullYear()}`;

          // class lookup for students
          let classId: string | null = null;
          if (role === 'student' && r.class_name) {
            const ckey = `${school.id}|${String(r.class_name).trim().toLowerCase()}`;
            if (classCache.has(ckey)) classId = classCache.get(ckey)!;
            else {
              const { data: cl } = await supabaseAdmin.from('classes').select('id').eq('school_id', school.id).ilike('name', String(r.class_name).trim()).maybeSingle();
              if (cl) { classId = cl.id; classCache.set(ckey, cl.id); }
            }
            if (!classId) { errors.push({ sheet: 'users', row: i + 2, identifier: ident, error: `class not found: ${r.class_name}` }); continue; }
          }

          // Skip if email already used (idempotent re-import)
          const { data: existingProfile } = await supabaseAdmin.from('profiles').select('user_id').eq('email', email).maybeSingle();
          if (existingProfile) { continue; }

          const { data: createdUser, error: cuErr } = await supabaseAdmin.auth.admin.createUser({
            email, password, email_confirm: true,
            user_metadata: { full_name: r.full_name, role },
          });
          if (cuErr || !createdUser.user) {
            // Tolerate "already registered" → skip silently
            if (String(cuErr?.message || '').toLowerCase().includes('already')) continue;
            errors.push({ sheet: 'users', row: i + 2, identifier: ident, error: cuErr?.message || 'auth create failed' }); continue;
          }

          const profile: Record<string, unknown> = {
            user_id: createdUser.user.id, email, full_name: r.full_name, role,
            school_id: school.id, is_demo: false,
          };
          if (role === 'student') {
            profile.class_id = classId;
            profile.admission_no = r.admission_no?.toString().trim() || null;
            profile.roll_no = r.roll_no?.toString().trim() || null;
            profile.section = r.section?.toString().trim().toUpperCase() || null;
            profile.date_of_birth = r.date_of_birth || null;
          }

          const { error: pErr } = await supabaseAdmin.from('profiles').insert(profile as never);
          if (pErr) {
            await supabaseAdmin.auth.admin.deleteUser(createdUser.user.id);
            errors.push({ sheet: 'users', row: i + 2, identifier: ident, error: pErr.message }); continue;
          }
          const { error: rErr } = await supabaseAdmin.from('user_roles').insert({ user_id: createdUser.user.id, role });
          if (rErr) {
            await supabaseAdmin.from('profiles').delete().eq('user_id', createdUser.user.id);
            await supabaseAdmin.auth.admin.deleteUser(createdUser.user.id);
            errors.push({ sheet: 'users', row: i + 2, identifier: ident, error: rErr.message }); continue;
          }
          created.users++;
        } catch (err: any) {
          errors.push({ sheet: 'users', row: i + 2, identifier: ident, error: err.message });
        }
      }
    }

    // 3. CLASSES
    if (payload.classes?.length) {
      for (let i = 0; i < payload.classes.length; i++) {
        const r = payload.classes[i];
        const ident = r.name || `row ${i + 2}`;
        try {
          const schoolKey = (r.school_code || r.school_name || '').toString();
          const school = await findSchoolByKey(schoolKey);
          if (!school) { errors.push({ sheet: 'classes', row: i + 2, identifier: ident, error: `school not found: ${schoolKey}` }); continue; }
          if (!r.name) { errors.push({ sheet: 'classes', row: i + 2, identifier: ident, error: 'name required' }); continue; }
          const ckey = `${school.id}|${String(r.name).trim().toLowerCase()}`;
          const { data: existing } = await supabaseAdmin.from('classes').select('id').eq('school_id', school.id).ilike('name', String(r.name).trim()).maybeSingle();
          if (existing) { classCache.set(ckey, existing.id); continue; }
          const grade = r.grade_level ? Number(r.grade_level) : null;
          const { data: ins, error: e } = await supabaseAdmin.from('classes').insert({
            school_id: school.id, name: String(r.name).trim(),
            grade_level: Number.isFinite(grade as number) ? grade : null,
            description: r.description || null, created_by: user.id, is_active: true,
          }).select('id').single();
          if (e) { errors.push({ sheet: 'classes', row: i + 2, identifier: ident, error: e.message }); continue; }
          classCache.set(ckey, ins!.id);
          created.classes++;
        } catch (err: any) {
          errors.push({ sheet: 'classes', row: i + 2, identifier: ident, error: err.message });
        }
      }
    }

    // 4. SUBJECTS
    if (payload.subjects?.length) {
      for (let i = 0; i < payload.subjects.length; i++) {
        const r = payload.subjects[i];
        const ident = r.name || `row ${i + 2}`;
        try {
          const schoolKey = (r.school_code || r.school_name || '').toString();
          const school = await findSchoolByKey(schoolKey);
          if (!school) { errors.push({ sheet: 'subjects', row: i + 2, identifier: ident, error: `school not found` }); continue; }
          if (!r.class_name || !r.name) { errors.push({ sheet: 'subjects', row: i + 2, identifier: ident, error: 'class_name and name required' }); continue; }

          const ckey = `${school.id}|${String(r.class_name).trim().toLowerCase()}`;
          let classId = classCache.get(ckey);
          if (!classId) {
            const { data: cl } = await supabaseAdmin.from('classes').select('id').eq('school_id', school.id).ilike('name', String(r.class_name).trim()).maybeSingle();
            if (cl) { classId = cl.id; classCache.set(ckey, cl.id); }
          }
          if (!classId) { errors.push({ sheet: 'subjects', row: i + 2, identifier: ident, error: `class not found: ${r.class_name}` }); continue; }

          const sKey = `${school.id}|${classId}|${String(r.name).trim().toLowerCase()}`;
          const { data: existing } = await supabaseAdmin.from('subjects').select('id').eq('school_id', school.id).eq('class_id', classId).ilike('name', String(r.name).trim()).maybeSingle();
          if (existing) { subjectCache.set(sKey, existing.id); continue; }
          const { data: ins, error: e } = await supabaseAdmin.from('subjects').insert({
            school_id: school.id, class_id: classId, name: String(r.name).trim(),
            description: r.description || null, color: r.color || null, icon: r.icon || null,
          }).select('id').single();
          if (e) { errors.push({ sheet: 'subjects', row: i + 2, identifier: ident, error: e.message }); continue; }
          subjectCache.set(sKey, ins!.id);
          created.subjects++;
        } catch (err: any) {
          errors.push({ sheet: 'subjects', row: i + 2, identifier: ident, error: err.message });
        }
      }
    }

    // 5. CHAPTERS — class_name is REQUIRED so each chapter is unique to its (class, subject) pair
    if (payload.chapters?.length) {
      for (let i = 0; i < payload.chapters.length; i++) {
        const r = payload.chapters[i];
        const ident = r.name || `row ${i + 2}`;
        try {
          const schoolKey = (r.school_code || r.school_name || '').toString();
          const school = await findSchoolByKey(schoolKey);
          if (!school) { errors.push({ sheet: 'chapters', row: i + 2, identifier: ident, error: 'school not found' }); continue; }
          if (!r.class_name || !r.subject_name || !r.name) {
            errors.push({ sheet: 'chapters', row: i + 2, identifier: ident, error: 'class_name, subject_name and name are required' });
            continue;
          }

          const ckey = `${school.id}|${String(r.class_name).trim().toLowerCase()}`;
          let classId = classCache.get(ckey);
          if (!classId) {
            const { data: cl } = await supabaseAdmin.from('classes').select('id').eq('school_id', school.id).ilike('name', String(r.class_name).trim()).maybeSingle();
            if (cl) { classId = cl.id; classCache.set(ckey, cl.id); }
          }
          if (!classId) { errors.push({ sheet: 'chapters', row: i + 2, identifier: ident, error: `class not found: ${r.class_name}` }); continue; }

          const { data: sb } = await supabaseAdmin.from('subjects').select('id').eq('school_id', school.id).eq('class_id', classId).ilike('name', String(r.subject_name).trim()).maybeSingle();
          if (!sb) { errors.push({ sheet: 'chapters', row: i + 2, identifier: ident, error: `subject "${r.subject_name}" not found in ${r.class_name}` }); continue; }

          // Skip duplicate (same school + subject + chapter name)
          const { data: existing } = await supabaseAdmin.from('chapters').select('id').eq('school_id', school.id).eq('subject_id', sb.id).ilike('name', String(r.name).trim()).maybeSingle();
          if (existing) continue;

          const order = r.order_index ? Number(r.order_index) : 0;
          const { error: e } = await supabaseAdmin.from('chapters').insert({
            school_id: school.id, subject_id: sb.id, name: String(r.name).trim(),
            description: r.description || null, order_index: Number.isFinite(order) ? order : 0,
          });
          if (!e) created.chapters++;
          else errors.push({ sheet: 'chapters', row: i + 2, identifier: ident, error: e.message });
        } catch (err: any) {
          errors.push({ sheet: 'chapters', row: i + 2, identifier: ident, error: err.message });
        }
      }
    }

    // 6. MATERIALS (link only — file_url should be a public URL)
    if (payload.materials?.length) {
      for (let i = 0; i < payload.materials.length; i++) {
        const r = payload.materials[i];
        const ident = r.title || `row ${i + 2}`;
        try {
          const schoolKey = (r.school_code || r.school_name || '').toString();
          const school = await findSchoolByKey(schoolKey);
          if (!school) { errors.push({ sheet: 'materials', row: i + 2, identifier: ident, error: 'school not found' }); continue; }
          if (!r.class_name || !r.subject_name || !r.chapter_name || !r.title || !r.type) {
            errors.push({ sheet: 'materials', row: i + 2, identifier: ident, error: 'class_name, subject_name, chapter_name, title, type required' }); continue;
          }
          const { data: cl } = await supabaseAdmin.from('classes').select('id').eq('school_id', school.id).ilike('name', String(r.class_name).trim()).maybeSingle();
          if (!cl) { errors.push({ sheet: 'materials', row: i + 2, identifier: ident, error: 'class not found' }); continue; }
          const { data: sb } = await supabaseAdmin.from('subjects').select('id').eq('school_id', school.id).eq('class_id', cl.id).ilike('name', String(r.subject_name).trim()).maybeSingle();
          if (!sb) { errors.push({ sheet: 'materials', row: i + 2, identifier: ident, error: 'subject not found' }); continue; }
          const { data: ch } = await supabaseAdmin.from('chapters').select('id').eq('school_id', school.id).eq('subject_id', sb.id).ilike('name', String(r.chapter_name).trim()).maybeSingle();
          if (!ch) { errors.push({ sheet: 'materials', row: i + 2, identifier: ident, error: 'chapter not found' }); continue; }

          // Skip duplicate material (same chapter + same title)
          const { data: existingMat } = await supabaseAdmin.from('materials').select('id').eq('chapter_id', ch.id).ilike('title', String(r.title).trim()).maybeSingle();
          if (existingMat) continue;

          const { error: e } = await supabaseAdmin.from('materials').insert({
            school_id: school.id, chapter_id: ch.id, title: String(r.title).trim(),
            type: String(r.type).trim().toLowerCase(), description: r.description || null,
            topic: r.topic || null, file_url: r.file_url || null, file_name: r.file_name || null,
            file_type: r.file_type || null, uploaded_by: user.id, is_active: true,
          });
          if (e) { errors.push({ sheet: 'materials', row: i + 2, identifier: ident, error: e.message }); continue; }
          created.materials++;
        } catch (err: any) {
          errors.push({ sheet: 'materials', row: i + 2, identifier: ident, error: err.message });
        }
      }
    }

    return json({ success: true, created, errors });
  } catch (error: any) {
    return json({ error: error?.message || 'Unknown error' }, 500);
  }
});
