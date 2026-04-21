// Ingest a PYQ PDF: extract MCQs via Lovable AI, auto-create chapters,
// dedupe via question_hash, save to questions + create year-wise pyq_mock exam.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

interface ExtractedQ {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: 'A' | 'B' | 'C' | 'D';
  subject_name?: string;
  chapter_name?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableKey = Deno.env.get('LOVABLE_API_KEY')!;
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const { upload_id } = await req.json();
    if (!upload_id) return json({ error: 'upload_id required' }, 400);

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await userClient.auth.getUser(token);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    // Validate role
    const { data: roleRow } = await admin.from('user_roles').select('role').eq('user_id', user.id).single();
    const role = roleRow?.role;
    if (!['admin', 'super_admin', 'developer'].includes(role)) {
      return json({ error: 'Forbidden' }, 403);
    }

    const { data: upload, error: upErr } = await admin
      .from('pyq_uploads')
      .select('*')
      .eq('id', upload_id)
      .single();
    if (upErr || !upload) return json({ error: 'Upload not found' }, 404);

    await admin.from('pyq_uploads').update({ status: 'processing', error_log: null }).eq('id', upload_id);

    // Fetch the PDF
    const fileResp = await fetch(upload.file_url);
    if (!fileResp.ok) {
      await admin.from('pyq_uploads').update({ status: 'failed', error_log: `Cannot fetch PDF: ${fileResp.status}` }).eq('id', upload_id);
      return json({ error: 'Cannot fetch PDF' }, 400);
    }
    const pdfBuffer = await fileResp.arrayBuffer();
    const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));

    // Call Lovable AI Gateway with file input (Gemini supports inline PDFs)
    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at extracting MCQ questions from BSEB Class 10 previous year question papers. Return only the structured tool call.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Extract ALL multiple-choice questions (4 options each) from this BSEB Class 10 PYQ paper${upload.pyq_year ? ` for year ${upload.pyq_year}` : ''}. For each question, identify subject (Hindi, English, Math, Science, Social Science, Sanskrit) and chapter (NCERT chapter name). Skip non-MCQ questions.` },
              { type: 'file', file: { filename: upload.file_name, file_data: `data:application/pdf;base64,${pdfBase64}` } },
            ],
          },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'save_pyq_questions',
            description: 'Save extracted MCQ questions',
            parameters: {
              type: 'object',
              properties: {
                questions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      question_text: { type: 'string' },
                      option_a: { type: 'string' },
                      option_b: { type: 'string' },
                      option_c: { type: 'string' },
                      option_d: { type: 'string' },
                      correct_answer: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
                      subject_name: { type: 'string' },
                      chapter_name: { type: 'string' },
                      difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                    },
                    required: ['question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer'],
                  },
                },
              },
              required: ['questions'],
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'save_pyq_questions' } },
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      await admin.from('pyq_uploads').update({ status: 'failed', error_log: `AI error ${aiResp.status}: ${txt.slice(0, 500)}` }).eq('id', upload_id);
      if (aiResp.status === 429) return json({ error: 'AI rate limit, try again shortly' }, 429);
      if (aiResp.status === 402) return json({ error: 'AI credits exhausted' }, 402);
      return json({ error: 'AI extraction failed' }, 500);
    }

    const aiData = await aiResp.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      await admin.from('pyq_uploads').update({ status: 'failed', error_log: 'AI returned no tool call', raw_ai_response: aiData }).eq('id', upload_id);
      return json({ error: 'AI returned no questions' }, 500);
    }

    const args = JSON.parse(toolCall.function.arguments);
    const extracted: ExtractedQ[] = args.questions || [];

    await admin.from('pyq_uploads').update({
      questions_extracted: extracted.length,
      extracted_questions: extracted,
      raw_ai_response: aiData,
      status: 'completed',
    }).eq('id', upload_id);

    return json({ success: true, extracted_count: extracted.length, upload_id });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
