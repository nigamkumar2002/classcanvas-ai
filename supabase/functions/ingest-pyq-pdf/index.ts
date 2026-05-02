// Ingest a PYQ PDF: extract bilingual MCQs + Written/Subjective questions via Lovable AI in the background.
// Returns 202 immediately; client polls pyq_uploads.status.
//
// Behaviour (Phase 1 rewrite):
// - The AI auto-detects how many MCQs the paper has (40/50/60/80/100 etc.).
// - The AI also returns subjective/written questions (short, long, very-short).
// - We never throw "Partial extraction": whatever is extracted is saved; status -> 'completed'.
// - Up to 2 attempts: 1st attempt extracts everything; 2nd attempt fills any missing MCQ numbers.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

type Difficulty = 'easy' | 'medium' | 'hard';
type WrittenType = 'very_short' | 'short_answer' | 'long_answer';

interface ExtractedMCQ {
  question_number: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: 'A' | 'B' | 'C' | 'D';
  subject_name: string;
  chapter_name: string;
  difficulty: Difficulty;
}

interface ExtractedWritten {
  question_number: number;
  question_text: string;
  marks: number;
  question_type: WrittenType;
  subject_name: string;
  chapter_name: string;
  difficulty: Difficulty;
}

const SUBJECT_NAMES = ['Mathematics', 'Science', 'Social Science', 'Hindi', 'English', 'Sanskrit'] as const;

const NCERT_CHAPTERS = `
BSEB Class 10 NCERT chapters by subject (use the EXACT chapter name from this list and do not invent alternatives):
- Mathematics: Real Numbers, Polynomials, Pair of Linear Equations in Two Variables, Quadratic Equations, Arithmetic Progressions, Triangles, Coordinate Geometry, Introduction to Trigonometry, Some Applications of Trigonometry, Circles, Areas Related to Circles, Surface Areas and Volumes, Statistics, Probability
- Science: Chemical Reactions and Equations, Acids Bases and Salts, Metals and Non-metals, Carbon and its Compounds, Life Processes, Control and Coordination, How do Organisms Reproduce, Heredity and Evolution, Light Reflection and Refraction, The Human Eye and the Colourful World, Electricity, Magnetic Effects of Electric Current, Our Environment, Periodic Classification of Elements, Sources of Energy, Management of Natural Resources
- Social Science: Resources and Development, Forest and Wildlife Resources, Water Resources, Agriculture, Minerals and Energy Resources, Manufacturing Industries, Lifelines of National Economy, The Rise of Nationalism in Europe, Nationalism in India, The Making of a Global World, The Age of Industrialisation, Print Culture and the Modern World, Power Sharing, Federalism, Democracy and Diversity, Gender Religion and Caste, Popular Struggles and Movements, Political Parties, Outcomes of Democracy, Challenges to Democracy, Development, Sectors of the Indian Economy, Money and Credit, Globalisation and the Indian Economy, Consumer Rights
- Hindi: Hindi Gadya, Hindi Padya, Vyakaran, Lekhan
- English: Literature Reader, Grammar and Writing, Reading Comprehension
- Sanskrit: Gadya Bhag, Padya Bhag, Vyakaran
`;

const sanitize = (v: unknown) =>
  typeof v === 'string' ? v.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() : '';

const normalizeSubject = (v: unknown): string => {
  const r = sanitize(v).toLowerCase();
  if (!r) return 'General';
  if (r.includes('math')) return 'Mathematics';
  if (r.includes('science') && r.includes('social')) return 'Social Science';
  if (r.includes('social')) return 'Social Science';
  if (r.includes('science')) return 'Science';
  if (r.includes('hindi')) return 'Hindi';
  if (r.includes('english')) return 'English';
  if (r.includes('sanskrit')) return 'Sanskrit';
  return SUBJECT_NAMES.find((s) => r === s.toLowerCase()) || sanitize(v) || 'General';
};

const normalizeAnswer = (v: unknown): ExtractedMCQ['correct_answer'] | null => {
  const n = sanitize(v).toUpperCase().replace(/[^A-D]/g, '');
  return (n === 'A' || n === 'B' || n === 'C' || n === 'D') ? n : null;
};

const normalizeDifficulty = (v: unknown): Difficulty => {
  const n = sanitize(v).toLowerCase();
  return (n === 'easy' || n === 'hard') ? n : 'medium';
};

const normalizeWrittenType = (v: unknown): WrittenType => {
  const n = sanitize(v).toLowerCase().replace(/\s+/g, '_');
  if (n.includes('very') || n === 'vsa') return 'very_short';
  if (n.includes('long') || n === 'la') return 'long_answer';
  return 'short_answer';
};

const combineBilingual = (hi?: string, en?: string, fallback?: string) => {
  const H = sanitize(hi);
  const E = sanitize(en);
  const F = sanitize(fallback);
  if (H && E) return `हिंदी: ${H}\nEnglish: ${E}`;
  if (F && /(?:हिंदी|english)\s*:/i.test(F)) return F;
  if (H) return `हिंदी: ${H}`;
  if (E) return `English: ${E}`;
  return F;
};

interface RawMCQ {
  question_number?: number | string;
  question_text_hindi?: string; question_text_english?: string;
  option_a_hindi?: string; option_a_english?: string;
  option_b_hindi?: string; option_b_english?: string;
  option_c_hindi?: string; option_c_english?: string;
  option_d_hindi?: string; option_d_english?: string;
  correct_answer?: string;
  subject_name?: string;
  chapter_name?: string;
  difficulty?: string;
}

interface RawWritten {
  question_number?: number | string;
  question_text_hindi?: string; question_text_english?: string;
  marks?: number | string;
  question_type?: string;
  subject_name?: string;
  chapter_name?: string;
  difficulty?: string;
}

const normalizeMCQ = (raw: RawMCQ, fallbackSubject: string): ExtractedMCQ | null => {
  const num = Number(raw.question_number);
  const ans = normalizeAnswer(raw.correct_answer);
  const qt = combineBilingual(raw.question_text_hindi, raw.question_text_english);
  const a = combineBilingual(raw.option_a_hindi, raw.option_a_english);
  const b = combineBilingual(raw.option_b_hindi, raw.option_b_english);
  const c = combineBilingual(raw.option_c_hindi, raw.option_c_english);
  const d = combineBilingual(raw.option_d_hindi, raw.option_d_english);

  if (!Number.isFinite(num) || num < 1 || !ans) return null;
  if (!qt || !a || !b || !c || !d) return null;

  return {
    question_number: num,
    question_text: qt,
    option_a: a, option_b: b, option_c: c, option_d: d,
    correct_answer: ans,
    subject_name: normalizeSubject(raw.subject_name || fallbackSubject),
    chapter_name: sanitize(raw.chapter_name) || 'Unmapped PYQ',
    difficulty: normalizeDifficulty(raw.difficulty),
  };
};

const normalizeWritten = (raw: RawWritten, fallbackSubject: string): ExtractedWritten | null => {
  const num = Number(raw.question_number);
  const qt = combineBilingual(raw.question_text_hindi, raw.question_text_english);
  if (!Number.isFinite(num) || num < 1 || !qt) return null;
  const marksN = Math.max(1, Math.min(15, Math.floor(Number(raw.marks) || 2)));
  return {
    question_number: num,
    question_text: qt,
    marks: marksN,
    question_type: normalizeWrittenType(raw.question_type),
    subject_name: normalizeSubject(raw.subject_name || fallbackSubject),
    chapter_name: sanitize(raw.chapter_name) || 'Unmapped PYQ',
    difficulty: normalizeDifficulty(raw.difficulty),
  };
};

const parseToolCall = async (response: Response) => {
  if (!response.ok) {
    const text = await response.text();
    if (response.status === 429) throw new Error('AI rate limit reached. Please retry in a moment.');
    if (response.status === 402) throw new Error('AI credits unavailable. Please add workspace usage credits.');
    throw new Error(`AI error ${response.status}: ${text.slice(0, 500)}`);
  }
  const data = await response.json();
  const message = data?.choices?.[0]?.message;
  const tc = message?.tool_calls?.[0];
  if (tc?.function?.arguments) return JSON.parse(tc.function.arguments);
  const content = typeof message?.content === 'string' ? message.content : '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) return JSON.parse(jsonMatch[0]);
  throw new Error('AI returned no structured extraction');
};

const MCQ_BATCH_SCHEMA = {
  type: 'function' as const,
  function: {
    name: 'save_pyq_mcq_batch',
    description: 'Return paper metadata and only the requested MCQ range extracted from the PDF.',
    parameters: {
      type: 'object',
      properties: {
        paper_subject_name: { type: 'string', enum: [...SUBJECT_NAMES] },
        objective_question_count: { type: 'integer', minimum: 0, maximum: 200 },
        mcq_questions: { type: 'array', items: { type: 'object', properties: {
          question_number: { type: 'integer', minimum: 1, maximum: 200 },
          question_text_hindi: { type: 'string' }, question_text_english: { type: 'string' },
          option_a_hindi: { type: 'string' }, option_a_english: { type: 'string' },
          option_b_hindi: { type: 'string' }, option_b_english: { type: 'string' },
          option_c_hindi: { type: 'string' }, option_c_english: { type: 'string' },
          option_d_hindi: { type: 'string' }, option_d_english: { type: 'string' },
          correct_answer: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
          chapter_name: { type: 'string' }, difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
        }, required: ['question_number', 'question_text_hindi', 'question_text_english', 'option_a_hindi', 'option_a_english', 'option_b_hindi', 'option_b_english', 'option_c_hindi', 'option_c_english', 'option_d_hindi', 'option_d_english', 'correct_answer', 'chapter_name', 'difficulty'], additionalProperties: false } },
      },
      required: ['paper_subject_name', 'objective_question_count', 'mcq_questions'],
      additionalProperties: false,
    },
  },
};

const WRITTEN_BATCH_SCHEMA = {
  type: 'function' as const,
  function: {
    name: 'save_pyq_written_batch',
    description: 'Return paper metadata and all non-MCQ written/subjective questions from Section B.',
    parameters: {
      type: 'object',
      properties: {
        paper_subject_name: { type: 'string', enum: [...SUBJECT_NAMES] },
        subjective_question_count: { type: 'integer', minimum: 0, maximum: 80 },
        written_questions: { type: 'array', items: { type: 'object', properties: {
          question_number: { type: 'integer', minimum: 1, maximum: 200 },
          question_text_hindi: { type: 'string' }, question_text_english: { type: 'string' },
          marks: { type: 'integer', minimum: 1, maximum: 15 },
          question_type: { type: 'string', enum: ['very_short', 'short_answer', 'long_answer'] },
          chapter_name: { type: 'string' }, difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
        }, required: ['question_number', 'question_text_hindi', 'question_text_english', 'marks', 'question_type', 'chapter_name', 'difficulty'], additionalProperties: false } },
      },
      required: ['paper_subject_name', 'subjective_question_count', 'written_questions'],
      additionalProperties: false,
    },
  },
};

async function callAiStructured(lovableKey: string, body: Record<string, unknown>) {
  const models = ['google/gemini-3-flash-preview', 'google/gemini-2.5-pro'];
  let lastError: unknown = null;
  for (const model of models) {
    try {
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${lovableKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, ...body }),
      });
      return await parseToolCall(response);
    } catch (e) {
      lastError = e;
      console.warn(`Extraction model ${model} failed:`, e instanceof Error ? e.message : e);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('AI extraction failed');
}

async function callMcqBatch(lovableKey: string, fileName: string, pdfBase64: string, pyqYear: number | null, start: number, end: number) {
  const parsed = await callAiStructured(lovableKey, {
    messages: [
      { role: 'system', content: `You are an expert BSEB Class 10 PYQ extractor. Extract ONLY MCQ question numbers ${start} to ${end}. Identify objective_question_count from instructions. Preserve official question numbers. Include Hindi and English for question/options; translate missing side. Infer A/B/C/D answer if answer key is absent. chapter_name must exactly match the provided NCERT Class 10 chapter list. Do not return written questions.` },
      { role: 'user', content: [
        { type: 'text', text: `BSEB Class 10 PYQ paper${pyqYear ? ` for year ${pyqYear}` : ''}. Extract MCQ question numbers ${start} to ${end} only.\n\n${NCERT_CHAPTERS}` },
        { type: 'file', file: { filename: fileName, file_data: `data:application/pdf;base64,${pdfBase64}` } },
      ] },
    ],
    tools: [MCQ_BATCH_SCHEMA],
    tool_choice: { type: 'function', function: { name: 'save_pyq_mcq_batch' } },
  });
  const fallbackSubject = normalizeSubject(parsed.paper_subject_name);
  const objectiveCount = Math.max(0, Math.min(200, Math.floor(Number(parsed.objective_question_count) || 0)));
  const mcqs: ExtractedMCQ[] = Array.isArray(parsed.mcq_questions)
    ? parsed.mcq_questions.map((m: RawMCQ) => normalizeMCQ(m, fallbackSubject)).filter((x: ExtractedMCQ | null): x is ExtractedMCQ => Boolean(x)).filter((q) => q.question_number >= start && q.question_number <= end)
    : [];
  return { fallbackSubject, objectiveCount, mcqs };
}

async function callWrittenBatch(lovableKey: string, fileName: string, pdfBase64: string, pyqYear: number | null) {
  const parsed = await callAiStructured(lovableKey, {
    messages: [
      { role: 'system', content: `Extract ONLY non-MCQ written/subjective questions from Section B and later sections of this BSEB Class 10 paper. Include Hindi and English text; translate missing side. Use exact NCERT chapter names. Do not return objective MCQs.` },
      { role: 'user', content: [
        { type: 'text', text: `BSEB Class 10 PYQ paper${pyqYear ? ` for year ${pyqYear}` : ''}. Extract all written/subjective questions only.\n\n${NCERT_CHAPTERS}` },
        { type: 'file', file: { filename: fileName, file_data: `data:application/pdf;base64,${pdfBase64}` } },
      ] },
    ],
    tools: [WRITTEN_BATCH_SCHEMA],
    tool_choice: { type: 'function', function: { name: 'save_pyq_written_batch' } },
  });
  const fallbackSubject = normalizeSubject(parsed.paper_subject_name);
  const subjectiveCount = Math.max(0, Math.min(80, Math.floor(Number(parsed.subjective_question_count) || 0)));
  const written: ExtractedWritten[] = Array.isArray(parsed.written_questions)
    ? parsed.written_questions.map((w: RawWritten) => normalizeWritten(w, fallbackSubject)).filter((x: ExtractedWritten | null): x is ExtractedWritten => Boolean(x))
    : [];
  return { fallbackSubject, subjectiveCount, written };
}

async function extractAll(fileName: string, pyqYear: number | null, pdfBase64: string, lovableKey: string, onProgress?: (message: string, mcqCount: number, writtenCount: number) => Promise<void>) {
  const mcqMap = new Map<number, ExtractedMCQ>();
  const writtenMap = new Map<number, ExtractedWritten>();
  const warnings: string[] = [];
  let detectedSubject = 'General';
  let objectiveCount = 0;
  let subjectiveCount = 0;

  for (const [start, end] of [[1, 20], [21, 40], [41, 60], [61, 80], [81, 100]]) {
    try {
      await onProgress?.(`Extracting MCQs ${start}-${end}…`, mcqMap.size, writtenMap.size);
      const batch = await callMcqBatch(lovableKey, fileName, pdfBase64, pyqYear, start, end);
      detectedSubject = batch.fallbackSubject || detectedSubject;
      objectiveCount = Math.max(objectiveCount, batch.objectiveCount);
      for (const q of batch.mcqs) mcqMap.set(q.question_number, { ...q, subject_name: q.subject_name || detectedSubject });
      await onProgress?.(`Extracted ${mcqMap.size} MCQs so far…`, mcqMap.size, writtenMap.size);
    } catch (e) {
      const message = `MCQ ${start}-${end} failed: ${e instanceof Error ? e.message : 'Unknown error'}`;
      warnings.push(message);
      console.warn(message);
    }
  }

  try {
    await onProgress?.('Extracting written questions…', mcqMap.size, writtenMap.size);
    const wb = await callWrittenBatch(lovableKey, fileName, pdfBase64, pyqYear);
    detectedSubject = wb.fallbackSubject || detectedSubject;
    subjectiveCount = wb.subjectiveCount;
    for (const w of wb.written) writtenMap.set(w.question_number, { ...w, subject_name: w.subject_name || detectedSubject });
  } catch (e) {
    warnings.push(`Written extraction failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }

  const mcqs = Array.from(mcqMap.values()).sort((a, b) => a.question_number - b.question_number);
  const written = Array.from(writtenMap.values()).sort((a, b) => a.question_number - b.question_number);
  if (mcqs.length === 0 && written.length === 0) throw new Error(warnings[0] || 'No questions extracted from PDF');
  return { detectedSubject, objectiveCount: objectiveCount || mcqs.length, subjectiveCount: subjectiveCount || written.length, mcqs, written, warnings };
}

async function processInBackground(uploadId: string, supabaseUrl: string, serviceKey: string, lovableKey: string) {
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    await admin.from('pyq_uploads').update({ status: 'processing', error_log: null }).eq('id', uploadId);

    const { data: upload, error: upErr } = await admin.from('pyq_uploads').select('*').eq('id', uploadId).single();
    if (upErr || !upload) throw new Error('Upload not found');

    const fileResp = await fetch(upload.file_url);
    if (!fileResp.ok) throw new Error(`Cannot fetch PDF: ${fileResp.status}`);

    const pdfBase64 = encodeBase64(new Uint8Array(await fileResp.arrayBuffer()));
    const result = await extractAll(upload.file_name, upload.pyq_year, pdfBase64, lovableKey);

    // Strip number from MCQs (legacy column shape)
    const mcqsOut = result.mcqs.map(({ question_number, ...rest }) => rest);
    const writtenOut = result.written.map(({ question_number, ...rest }) => ({ ...rest, _q_no: question_number }));

    const meta = {
      detected_subject: result.detectedSubject,
      mcq_total: result.objectiveCount,
      written_total: result.subjectiveCount,
      mcq_extracted: mcqsOut.length,
      written_extracted: writtenOut.length,
      finished_at: new Date().toISOString(),
    };

    await admin.from('pyq_uploads').update({
      questions_extracted: mcqsOut.length,
      written_extracted: writtenOut.length,
      extracted_questions: mcqsOut,
      extraction_meta: { ...meta, written_questions: writtenOut },
      error_log: null,
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

    const userClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await userClient.auth.getUser(token);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleRow } = await admin.from('user_roles').select('role').eq('user_id', user.id).single();
    const role = roleRow?.role;
    if (!['admin', 'super_admin', 'developer', 'teacher'].includes(role)) return json({ error: 'Forbidden' }, 403);

    await admin.from('pyq_uploads').update({ status: 'processing', error_log: null }).eq('id', upload_id);

    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    EdgeRuntime.waitUntil(processInBackground(upload_id, supabaseUrl, serviceKey, lovableKey));

    return json({ success: true, upload_id, status: 'processing', message: 'Extraction started in background. Poll status.' }, 202);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
