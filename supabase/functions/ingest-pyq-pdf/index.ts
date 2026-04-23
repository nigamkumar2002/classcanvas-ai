// Ingest a PYQ PDF: extract bilingual MCQs via Lovable AI in the background.
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

type Difficulty = 'easy' | 'medium' | 'hard';

interface ExtractedQ {
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

interface RawExtractedQ {
  question_number?: number | string;
  question_text?: string;
  question_text_hindi?: string;
  question_text_english?: string;
  option_a?: string;
  option_a_hindi?: string;
  option_a_english?: string;
  option_b?: string;
  option_b_hindi?: string;
  option_b_english?: string;
  option_c?: string;
  option_c_hindi?: string;
  option_c_english?: string;
  option_d?: string;
  option_d_hindi?: string;
  option_d_english?: string;
  correct_answer?: string;
  subject_name?: string;
  chapter_name?: string;
  difficulty?: Difficulty | string;
}

const EXPECTED_QUESTION_COUNT = 100;
const SUBJECT_NAMES = ['Mathematics', 'Science', 'Social Science', 'Hindi', 'English', 'Sanskrit'] as const;
const NCERT_CHAPTERS = `
BSEB Class 10 NCERT chapters by subject (use the EXACT chapter name from this list and do not invent alternatives):
- Mathematics: Real Numbers, Polynomials, Pair of Linear Equations in Two Variables, Quadratic Equations, Arithmetic Progressions, Triangles, Coordinate Geometry, Introduction to Trigonometry, Some Applications of Trigonometry, Circles, Areas Related to Circles, Surface Areas and Volumes, Statistics, Probability
- Science: Chemical Reactions and Equations, Acids, Bases and Salts, Metals and Non-metals, Carbon and its Compounds, Life Processes, Control and Coordination, How do Organisms Reproduce?, Heredity and Evolution, Light – Reflection and Refraction, The Human Eye and the Colourful World, Electricity, Magnetic Effects of Electric Current, Our Environment, Periodic Classification of Elements, Sources of Energy, Management of Natural Resources
- Social Science: Resources and Development, Forest and Wildlife Resources, Water Resources, Agriculture, Minerals and Energy Resources, Manufacturing Industries, Lifelines of National Economy, The Rise of Nationalism in Europe, Nationalism in India, The Making of a Global World, The Age of Industrialisation, Print Culture and the Modern World, Power Sharing, Federalism, Democracy and Diversity, Gender, Religion and Caste, Popular Struggles and Movements, Political Parties, Outcomes of Democracy, Challenges to Democracy, Development, Sectors of the Indian Economy, Money and Credit, Globalisation and the Indian Economy, Consumer Rights
- Hindi: Hindi Gadya, Hindi Padya, Vyakaran, Lekhan
- English: Literature Reader, Grammar and Writing, Reading Comprehension
- Sanskrit: Gadya Bhag, Padya Bhag, Vyakaran
`;

const sanitizeText = (value: unknown) =>
  typeof value === 'string'
    ? value.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    : '';

const normalizeSubjectName = (value: unknown) => {
  const raw = sanitizeText(value).toLowerCase();
  if (!raw) return 'General';
  if (raw.includes('math')) return 'Mathematics';
  if (raw.includes('science')) return 'Science';
  if (raw.includes('social')) return 'Social Science';
  if (raw.includes('hindi')) return 'Hindi';
  if (raw.includes('english')) return 'English';
  if (raw.includes('sanskrit')) return 'Sanskrit';
  return SUBJECT_NAMES.find((subject) => raw === subject.toLowerCase()) || sanitizeText(value) || 'General';
};

const normalizeCorrectAnswer = (value: unknown): ExtractedQ['correct_answer'] | null => {
  const normalized = sanitizeText(value).toUpperCase().replace(/[^A-D]/g, '');
  return normalized === 'A' || normalized === 'B' || normalized === 'C' || normalized === 'D' ? normalized : null;
};

const combineBilingual = (hindi?: string, english?: string, fallback?: string) => {
  const hi = sanitizeText(hindi);
  const en = sanitizeText(english);
  const base = sanitizeText(fallback);

  if (hi && en) return `हिंदी: ${hi}\nEnglish: ${en}`;
  if (base && /(?:हिंदी|english)\s*:/i.test(base)) return base;
  if (hi) return `हिंदी: ${hi}`;
  if (en) return `English: ${en}`;
  return base;
};

const normalizeDifficulty = (value: unknown): Difficulty => {
  const normalized = sanitizeText(value).toLowerCase();
  if (normalized === 'easy' || normalized === 'hard') return normalized;
  return 'medium';
};

const completenessScore = (question: ExtractedQ) => {
  return [
    question.question_text,
    question.option_a,
    question.option_b,
    question.option_c,
    question.option_d,
    question.subject_name,
    question.chapter_name,
  ].filter(Boolean).length;
};

const normalizeQuestion = (raw: RawExtractedQ, fallbackSubject?: string): ExtractedQ | null => {
  const questionNumber = Number(raw.question_number);
  const correctAnswer = normalizeCorrectAnswer(raw.correct_answer);
  const question_text = combineBilingual(raw.question_text_hindi, raw.question_text_english, raw.question_text);
  const option_a = combineBilingual(raw.option_a_hindi, raw.option_a_english, raw.option_a);
  const option_b = combineBilingual(raw.option_b_hindi, raw.option_b_english, raw.option_b);
  const option_c = combineBilingual(raw.option_c_hindi, raw.option_c_english, raw.option_c);
  const option_d = combineBilingual(raw.option_d_hindi, raw.option_d_english, raw.option_d);

  if (!Number.isFinite(questionNumber) || questionNumber < 1 || questionNumber > EXPECTED_QUESTION_COUNT || !correctAnswer) {
    return null;
  }

  if (!question_text || !option_a || !option_b || !option_c || !option_d) {
    return null;
  }

  return {
    question_number: questionNumber,
    question_text,
    option_a,
    option_b,
    option_c,
    option_d,
    correct_answer: correctAnswer,
    subject_name: normalizeSubjectName(raw.subject_name || fallbackSubject),
    chapter_name: sanitizeText(raw.chapter_name) || 'Unmapped PYQ',
    difficulty: normalizeDifficulty(raw.difficulty),
  };
};

const parseToolCall = async (response: Response) => {
  if (!response.ok) {
    const text = await response.text();
    if (response.status === 429) throw new Error('AI rate limit reached. Please retry in a moment.');
    if (response.status === 402) throw new Error('AI credits are unavailable right now. Please add workspace usage credits.');
    throw new Error(`AI error ${response.status}: ${text.slice(0, 500)}`);
  }

  const data = await response.json();
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    throw new Error('AI returned no structured extraction');
  }

  return JSON.parse(toolCall.function.arguments);
};

async function runExtractionAttempt(
  lovableKey: string,
  fileName: string,
  pdfBase64: string,
  pyqYear: number | null,
  attempt: number,
  missingNumbers: number[],
) {
  const scopeInstruction = attempt === 1
    ? `Extract ALL ${EXPECTED_QUESTION_COUNT} questions numbered 1-${EXPECTED_QUESTION_COUNT}.`
    : `Extract ONLY these missing question numbers from the PDF: ${missingNumbers.join(', ')}.`;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
          content: `You are an expert BSEB Class 10 PYQ extractor.
Rules:
1. The PDF is a SINGLE subject paper. First identify the paper subject and keep it consistent across all extracted questions.
2. Return objective MCQs only, preserving official question numbering.
3. Every returned question must include BOTH Hindi and English text. If the source shows only one language, translate the missing side accurately.
4. Every option must include BOTH Hindi and English text.
5. Use one paper subject only from: ${SUBJECT_NAMES.join(', ')}.
6. chapter_name must be an exact match from the chapter list for that identified subject.
7. Do not stop early. Do not summarize. Do not merge two questions into one.
8. If a question is faint, reconstruct carefully from context instead of skipping it.`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `BSEB Class 10 PYQ paper${pyqYear ? ` for year ${pyqYear}` : ''}.
Attempt ${attempt}.
${scopeInstruction}

Return one function call with:
- paper_subject_name
- questions[] where each item includes question_number, chapter_name, difficulty, question_text_hindi, question_text_english, option_a_hindi, option_a_english, option_b_hindi, option_b_english, option_c_hindi, option_c_english, option_d_hindi, option_d_english, and correct_answer.

${NCERT_CHAPTERS}`,
            },
            {
              type: 'file',
              file: {
                filename: fileName,
                file_data: `data:application/pdf;base64,${pdfBase64}`,
              },
            },
          ],
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'save_pyq_questions',
            description: 'Return the identified paper subject and extracted MCQ questions',
            parameters: {
              type: 'object',
              properties: {
                paper_subject_name: { type: 'string', enum: [...SUBJECT_NAMES] },
                questions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      question_number: { type: 'integer', minimum: 1, maximum: EXPECTED_QUESTION_COUNT },
                      question_text_hindi: { type: 'string' },
                      question_text_english: { type: 'string' },
                      option_a_hindi: { type: 'string' },
                      option_a_english: { type: 'string' },
                      option_b_hindi: { type: 'string' },
                      option_b_english: { type: 'string' },
                      option_c_hindi: { type: 'string' },
                      option_c_english: { type: 'string' },
                      option_d_hindi: { type: 'string' },
                      option_d_english: { type: 'string' },
                      correct_answer: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
                      chapter_name: { type: 'string' },
                      difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                    },
                    required: [
                      'question_number',
                      'question_text_hindi',
                      'question_text_english',
                      'option_a_hindi',
                      'option_a_english',
                      'option_b_hindi',
                      'option_b_english',
                      'option_c_hindi',
                      'option_c_english',
                      'option_d_hindi',
                      'option_d_english',
                      'correct_answer',
                      'chapter_name',
                      'difficulty',
                    ],
                    additionalProperties: false,
                  },
                },
              },
              required: ['paper_subject_name', 'questions'],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'save_pyq_questions' } },
    }),
  });

  const parsed = await parseToolCall(response);
  const fallbackSubject = normalizeSubjectName(parsed.paper_subject_name);
  const questions = Array.isArray(parsed.questions)
    ? parsed.questions
      .map((item: RawExtractedQ) => normalizeQuestion(item, fallbackSubject))
      .filter((item: ExtractedQ | null): item is ExtractedQ => Boolean(item))
    : [];

  return { fallbackSubject, questions };
}

async function extractAllQuestions(fileName: string, pyqYear: number | null, pdfBase64: string, lovableKey: string) {
  const questionMap = new Map<number, ExtractedQ>();
  let detectedSubject = 'General';

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const missingNumbers = Array.from({ length: EXPECTED_QUESTION_COUNT }, (_, index) => index + 1)
      .filter((number) => !questionMap.has(number));

    if (missingNumbers.length === 0) break;

    const { fallbackSubject, questions } = await runExtractionAttempt(
      lovableKey,
      fileName,
      pdfBase64,
      pyqYear,
      attempt,
      missingNumbers,
    );

    detectedSubject = fallbackSubject || detectedSubject;

    for (const question of questions) {
      const existing = questionMap.get(question.question_number);
      const normalizedQuestion = { ...question, subject_name: question.subject_name || detectedSubject };

      if (!existing || completenessScore(normalizedQuestion) >= completenessScore(existing)) {
        questionMap.set(question.question_number, normalizedQuestion);
      }
    }
  }

  const extracted = Array.from(questionMap.values()).sort((a, b) => a.question_number - b.question_number);
  const missing = Array.from({ length: EXPECTED_QUESTION_COUNT }, (_, index) => index + 1)
    .filter((number) => !questionMap.has(number));

  if (missing.length > 0) {
    throw new Error(`Partial extraction: found ${extracted.length} of ${EXPECTED_QUESTION_COUNT} questions. Missing question numbers: ${missing.join(', ')}`);
  }

  return extracted.map(({ question_number, ...question }) => ({
    ...question,
    subject_name: question.subject_name || detectedSubject,
  }));
}

async function processInBackground(uploadId: string, supabaseUrl: string, serviceKey: string, lovableKey: string) {
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    await admin.from('pyq_uploads').update({ status: 'processing', error_log: null }).eq('id', uploadId);

    const { data: upload, error: upErr } = await admin
      .from('pyq_uploads')
      .select('*')
      .eq('id', uploadId)
      .single();

    if (upErr || !upload) throw new Error('Upload not found');

    const fileResp = await fetch(upload.file_url);
    if (!fileResp.ok) throw new Error(`Cannot fetch PDF: ${fileResp.status}`);

    const pdfBase64 = encodeBase64(new Uint8Array(await fileResp.arrayBuffer()));
    const extracted = await extractAllQuestions(upload.file_name, upload.pyq_year, pdfBase64, lovableKey);

    await admin.from('pyq_uploads').update({
      questions_extracted: extracted.length,
      extracted_questions: extracted,
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

    await admin.from('pyq_uploads').update({ status: 'processing', error_log: null }).eq('id', upload_id);

    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    EdgeRuntime.waitUntil(processInBackground(upload_id, supabaseUrl, serviceKey, lovableKey));

    return json({
      success: true,
      upload_id,
      status: 'processing',
      message: 'Extraction started in background. Poll status.',
    }, 202);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
