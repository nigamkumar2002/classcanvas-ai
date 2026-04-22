// Ingest a PYQ PDF: extract MCQs via Lovable AI in the BACKGROUND.
// Returns 202 immediately; client polls pyq_uploads.status.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';

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

const EXPECTED_QUESTION_COUNT = 100;

async function processInBackground(uploadId: string, supabaseUrl: string, serviceKey: string, lovableKey: string) {
  const admin = createClient(supabaseUrl, serviceKey);
  try {
    await admin.from('pyq_uploads').update({ status: 'processing', error_log: null }).eq('id', uploadId);

    const { data: upload, error: upErr } = await admin
      .from('pyq_uploads').select('*').eq('id', uploadId).single();
    if (upErr || !upload) throw new Error('Upload not found');

    // Fetch the PDF
    const fileResp = await fetch(upload.file_url);
    if (!fileResp.ok) throw new Error(`Cannot fetch PDF: ${fileResp.status}`);
    const pdfBuffer = await fileResp.arrayBuffer();
    const bytes = new Uint8Array(pdfBuffer);
    const pdfBase64 = encodeBase64(bytes);

    // Use Gemini 2.5 Pro: BSEB papers have 100 MCQs — Pro reliably extracts all; Flash often truncates around 80.
    const NCERT_CHAPTERS = `
BSEB Class 10 NCERT chapters by subject (use the EXACT chapter name from this list):
- Mathematics: Real Numbers, Polynomials, Pair of Linear Equations in Two Variables, Quadratic Equations, Arithmetic Progressions, Triangles, Coordinate Geometry, Introduction to Trigonometry, Some Applications of Trigonometry, Circles, Areas Related to Circles, Surface Areas and Volumes, Statistics, Probability
- Science: Chemical Reactions and Equations, Acids Bases and Salts, Metals and Non-metals, Carbon and its Compounds, Life Processes, Control and Coordination, How do Organisms Reproduce, Heredity and Evolution, Light Reflection and Refraction, The Human Eye and the Colourful World, Electricity, Magnetic Effects of Electric Current, Our Environment
- Social Science: Resources and Development, Forest and Wildlife Resources, Water Resources, Agriculture, Minerals and Energy Resources, Manufacturing Industries, Lifelines of National Economy, The Rise of Nationalism in Europe, Nationalism in India, The Making of a Global World, The Age of Industrialisation, Print Culture and the Modern World, Power Sharing, Federalism, Democracy and Diversity, Gender Religion and Caste, Popular Struggles and Movements, Political Parties, Outcomes of Democracy, Challenges to Democracy, Development, Sectors of the Indian Economy, Money and Credit, Globalisation and the Indian Economy, Consumer Rights
- Hindi: Hindi Gadya, Hindi Padya, Vyakaran, Lekhan
- English: Literature Reader, Grammar and Writing, Reading Comprehension
- Sanskrit: Gadya Bhag, Padya Bhag, Vyakaran
`;
    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${lovableKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: 'You are an expert BSEB Class 10 PYQ extractor. BSEB papers contain EXACTLY 100 objective MCQs (each with 4 options A/B/C/D). You MUST extract every single MCQ, verify the final count, and only then return the structured tool call. Do not stop early, do not summarize.' },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Extract ALL 100 multiple-choice questions from this BSEB Class 10 PYQ paper${upload.pyq_year ? ` (year ${upload.pyq_year})` : ''}. Requirements:
1. Extract EVERY MCQ — the paper has 100. Do not stop at 80 or 50. If a question lacks 4 options, still try to reconstruct.
2. For each question, set subject_name to one of: Mathematics, Science, Social Science, Hindi, English, Sanskrit.
3. For chapter_name, choose the BEST MATCH from the list below — use the exact name. Do NOT invent new chapter names if a match exists.
4. Set difficulty as easy/medium/hard based on complexity.

${NCERT_CHAPTERS}` },
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
      await admin.from('pyq_uploads').update({ status: 'failed', error_log: `AI error ${aiResp.status}: ${txt.slice(0, 500)}` }).eq('id', uploadId);
      return;
    }

    const aiData = await aiResp.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      await admin.from('pyq_uploads').update({ status: 'failed', error_log: 'AI returned no tool call' }).eq('id', uploadId);
      return;
    }

    const args = JSON.parse(toolCall.function.arguments);
    const extracted: ExtractedQ[] = args.questions || [];

    if (!Array.isArray(extracted) || extracted.length === 0) {
      throw new Error('No questions extracted from PDF');
    }

    await admin.from('pyq_uploads').update({
      questions_extracted: extracted.length,
      extracted_questions: extracted,
      error_log: extracted.length < EXPECTED_QUESTION_COUNT
        ? `Partial extraction: found ${extracted.length} of ${EXPECTED_QUESTION_COUNT} questions`
        : null,
      status: 'completed',
    }).eq('id', uploadId);
  } catch (e) {
    console.error('Background processing failed:', e);
    await admin.from('pyq_uploads').update({
      status: 'failed',
      error_log: e instanceof Error ? e.message : 'Unknown error',
    }).eq('id', uploadId);
  }
}

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

    const { data: roleRow } = await admin.from('user_roles').select('role').eq('user_id', user.id).single();
    const role = roleRow?.role;
    if (!['admin', 'super_admin', 'developer', 'teacher'].includes(role)) {
      return json({ error: 'Forbidden' }, 403);
    }

    // Mark as processing immediately
    await admin.from('pyq_uploads').update({ status: 'processing', error_log: null }).eq('id', upload_id);

    // Fire-and-forget background processing
    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    EdgeRuntime.waitUntil(processInBackground(upload_id, supabaseUrl, serviceKey, lovableKey));

    return json({ success: true, upload_id, status: 'processing', message: 'Extraction started in background. Poll status.' }, 202);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
