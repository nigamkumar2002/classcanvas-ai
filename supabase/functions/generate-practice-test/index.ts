// Student-only AI practice test generator with weekly quota (7 days from first generation)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const { subject_id, chapter_id, topic, num_questions, duration_minutes = 20 } = body;
    const requested = Math.min(Math.max(parseInt(num_questions) || 10, 1), 50);

    // Verify student role
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("school_id, role")
      .eq("user_id", user.id)
      .single();
    if (!profile || profile.role !== "student") return json({ error: "Students only" }, 403);

    // Get max quota from school settings
    const { data: setting } = await supabaseAdmin
      .from("school_settings")
      .select("value")
      .eq("school_id", profile.school_id)
      .eq("key", "practice_test_max_questions")
      .maybeSingle();
    const maxQuota = parseInt(String(setting?.value ?? "50")) || 50;

    // Check / reset quota (7 days from first generation)
    let { data: quota } = await supabaseAdmin
      .from("practice_quotas")
      .select("*")
      .eq("student_id", user.id)
      .maybeSingle();

    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    if (!quota) {
      const { data: newQ } = await supabaseAdmin
        .from("practice_quotas")
        .insert({ student_id: user.id, school_id: profile.school_id, questions_used: 0 })
        .select()
        .single();
      quota = newQ;
    } else if (new Date(quota.quota_start_date).getTime() + sevenDaysMs < now) {
      const { data: resetQ } = await supabaseAdmin
        .from("practice_quotas")
        .update({ quota_start_date: new Date().toISOString(), questions_used: 0, updated_at: new Date().toISOString() })
        .eq("id", quota.id)
        .select()
        .single();
      quota = resetQ;
    }

    const remaining = maxQuota - (quota?.questions_used || 0);
    if (requested > remaining) {
      const resetAt = new Date(new Date(quota!.quota_start_date).getTime() + sevenDaysMs).toISOString();
      return json({
        error: "quota_exceeded",
        message: `You can generate ${remaining} more questions. Quota resets on ${new Date(resetAt).toLocaleDateString()}.`,
        remaining,
        max: maxQuota,
        reset_at: resetAt,
      }, 429);
    }

    // Get chapter/subject context for AI prompt
    let context = topic || "";
    if (chapter_id) {
      const { data: ch } = await supabaseAdmin.from("chapters").select("name, subject_id").eq("id", chapter_id).maybeSingle();
      if (ch) {
        context = ch.name;
        const { data: sub } = await supabaseAdmin.from("subjects").select("name").eq("id", ch.subject_id).maybeSingle();
        if (sub) context = `${sub.name} - ${ch.name}`;
      }
    } else if (subject_id) {
      const { data: sub } = await supabaseAdmin.from("subjects").select("name").eq("id", subject_id).maybeSingle();
      if (sub) context = sub.name;
    }

    // Call Lovable AI
    const aiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!aiKey) return json({ error: "AI not configured" }, 500);

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${aiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Generate practice MCQ questions for school students. Return ONLY via the function call." },
          { role: "user", content: `Generate exactly ${requested} multiple-choice questions about: ${context}. Each question has 4 options (a, b, c, d) with one correct answer.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "create_questions",
            parameters: {
              type: "object",
              properties: {
                questions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      question: { type: "string" },
                      option_a: { type: "string" },
                      option_b: { type: "string" },
                      option_c: { type: "string" },
                      option_d: { type: "string" },
                      correct: { type: "string", enum: ["a", "b", "c", "d"] },
                    },
                    required: ["question", "option_a", "option_b", "option_c", "option_d", "correct"],
                  },
                },
              },
              required: ["questions"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "create_questions" } },
      }),
    });

    if (aiResp.status === 429) return json({ error: "AI rate limited, try again shortly" }, 429);
    if (aiResp.status === 402) return json({ error: "AI credits exhausted. Contact admin." }, 402);
    if (!aiResp.ok) return json({ error: "AI generation failed" }, 500);

    const aiData = await aiResp.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall ? JSON.parse(toolCall.function.arguments) : null;
    const questions = args?.questions || [];
    if (!questions.length) return json({ error: "AI returned no questions" }, 500);

    // Create practice test + questions
    const { data: test, error: testErr } = await supabaseAdmin
      .from("practice_tests")
      .insert({
        student_id: user.id,
        school_id: profile.school_id,
        subject_id: subject_id || null,
        chapter_id: chapter_id || null,
        topic: context || null,
        num_questions: questions.length,
        duration_minutes,
        total_marks: questions.length,
      })
      .select()
      .single();
    if (testErr) throw testErr;

    const rows = questions.map((q: any, i: number) => ({
      practice_test_id: test.id,
      school_id: profile.school_id,
      question_text: q.question,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      correct_answer: q.correct,
      order_index: i,
    }));
    await supabaseAdmin.from("practice_questions").insert(rows);

    // Update quota
    await supabaseAdmin
      .from("practice_quotas")
      .update({ questions_used: (quota?.questions_used || 0) + questions.length, updated_at: new Date().toISOString() })
      .eq("id", quota!.id);

    return json({ test_id: test.id, count: questions.length, remaining: remaining - questions.length });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});

function json(o: any, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
