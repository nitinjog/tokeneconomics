// Thin wrapper around the Gemini API (generateContent), called directly from the
// browser. generativelanguage.googleapis.com supports CORS so no backend is needed.
//
// IMPORTANT constraint: the `google_search` grounding tool and structured JSON
// output (`responseSchema`) cannot be used in the same call. Pricing lookup
// (Call B, uses search) is therefore a separate call from the structured calls
// (A: questionnaire, C: benefits/recommendation).

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiError extends Error {
  constructor(message, kind) {
    super(message);
    this.kind = kind; // 'invalid_key' | 'quota' | 'network' | 'parse' | 'unknown'
  }
}

async function callGemini(apiKey, model, body) {
  let res;
  try {
    res = await fetch(`${API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new GeminiError('Could not reach the Gemini API. Check your internet connection.', 'network');
  }

  if (!res.ok) {
    let detail = '';
    try {
      const errJson = await res.json();
      detail = errJson?.error?.message || '';
    } catch {
      /* ignore */
    }
    if (res.status === 400 || res.status === 403) {
      throw new GeminiError(`Invalid API key or request. ${detail}`, 'invalid_key');
    }
    if (res.status === 429) {
      throw new GeminiError('Gemini free-tier quota exceeded for now. Wait a bit and try again.', 'quota');
    }
    throw new GeminiError(`Gemini API error (${res.status}). ${detail}`, 'unknown');
  }

  return res.json();
}

function extractText(json) {
  const parts = json?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || '').join('');
}

function extractJson(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) {
    throw new GeminiError('Gemini returned a response we could not parse as JSON.', 'parse');
  }
  try {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
  } catch {
    throw new GeminiError('Gemini returned malformed JSON.', 'parse');
  }
}

/** Cheap call to validate a key works, without spending a generation. */
export async function testApiKey(apiKey) {
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
  } catch {
    throw new GeminiError('Could not reach the Gemini API. Check your internet connection.', 'network');
  }
  if (!res.ok) {
    if (res.status === 400 || res.status === 403) {
      throw new GeminiError('That key was rejected by Google. Double-check it was copied correctly.', 'invalid_key');
    }
    throw new GeminiError(`Gemini API error (${res.status}).`, 'unknown');
  }
  return true;
}

const QUESTIONS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    dynamicQuestions: {
      type: 'ARRAY',
      description: 'Extra clarifying questions specific to this workflow, beyond the standard set already collected (volume, tokens, agentic loops, model, benefit inputs).',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING', description: 'unique snake_case identifier' },
          label: { type: 'STRING', description: 'the question, phrased for a non-technical user' },
          hint: { type: 'STRING', description: 'one-sentence helper text explaining why this matters' },
          type: { type: 'STRING', enum: ['number', 'text', 'boolean', 'select'] },
          options: { type: 'ARRAY', items: { type: 'STRING' }, description: 'choices, only when type is select' },
          defaultValue: { type: 'STRING', description: 'a sensible stringified default' },
        },
        required: ['id', 'label', 'type'],
      },
    },
  },
  required: ['dynamicQuestions'],
};

/** Call A — generate a short, tailored questionnaire for this workflow. */
export async function generateQuestions(apiKey, model, { workflowName, workflowDescription }) {
  const prompt = `You are helping size the token economics of an AI/LLM workflow.

Workflow name: ${workflowName}
Description: ${workflowDescription}

A standard questionnaire already collects: monthly sessions, transactions per session,
input/output tokens per transaction, whether it's agentic (and loop count if so), the
model being evaluated, and benefit inputs (hours saved, loaded hourly cost).

Generate 2-5 SHORT additional clarifying questions specific to THIS workflow that would
help refine cost or benefit estimates — e.g. retry/error rates, human-in-the-loop review
percentage, caching potential, seasonality, complexity tiers. Keep questions concrete and
answerable by a non-technical stakeholder in seconds. Do not repeat the standard fields
above. If nothing meaningful to add, return an empty array.`;

  const json = await callGemini(apiKey, model, {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: QUESTIONS_SCHEMA,
    },
  });
  return extractJson(extractText(json));
}

/** Call B — grounded web search for current token pricing of the chosen model. */
export async function fetchPricing(apiKey, model, { modelProvider, modelName }) {
  const prompt = `Search the web for the CURRENT official token pricing (per 1 million tokens,
in USD) for this LLM: provider "${modelProvider}", model "${modelName}".

Find the input (prompt) token price and output (completion) token price per 1M tokens.
If a cached-input discount price exists, include it. Prefer the vendor's own pricing page.

Respond with ONLY a fenced json code block containing exactly this shape, no other text outside the fence:
\`\`\`json
{
  "provider": "string",
  "model": "string",
  "inputPricePerMillion": number,
  "outputPricePerMillion": number,
  "cachedInputPricePerMillion": number or null,
  "currency": "USD",
  "asOf": "string, e.g. the month/year this pricing was found",
  "notes": "string, any caveats (e.g. tiered pricing, free tier limits)"
}
\`\`\``;

  const json = await callGemini(apiKey, model, {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
  });

  const text = extractText(json);
  const pricing = extractJson(text);

  const chunks = json?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const sources = chunks
    .map((c) => c.web && { title: c.web.title, url: c.web.uri })
    .filter(Boolean);

  return { ...pricing, sources };
}

const BENEFITS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    monthlyBenefit: { type: 'NUMBER', description: 'total estimated monthly benefit in USD' },
    benefitAssumptions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          label: { type: 'STRING' },
          value: { type: 'STRING' },
          basis: { type: 'STRING', description: 'why this number was chosen: research, formula, or stated assumption' },
        },
        required: ['label', 'value', 'basis'],
      },
    },
    recommendation: { type: 'STRING', enum: ['GO', 'NO-GO', 'CONDITIONAL'] },
    confidence: { type: 'STRING', enum: ['low', 'medium', 'high'] },
    rationale: { type: 'STRING', description: '2-4 sentences explaining the recommendation' },
    bestPractices: { type: 'ARRAY', items: { type: 'STRING' }, description: '3-6 concrete best practices for similar workflows' },
    risks: { type: 'ARRAY', items: { type: 'STRING' }, description: '2-4 key risks or failure modes to watch for' },
  },
  required: ['monthlyBenefit', 'benefitAssumptions', 'recommendation', 'confidence', 'rationale', 'bestPractices', 'risks'],
};

/** Call C — estimate benefits and produce a go/no-go recommendation. */
export async function analyzeBenefits(apiKey, model, { workflowName, workflowDescription, answers, costSummary, pricing }) {
  const prompt = `You are a pragmatic AI ROI analyst. Estimate the monthly BENEFIT of the
workflow below and give a go/no-go recommendation. Be conservative and show your assumptions
transparently — cite realistic industry benchmarks where relevant, but do not invent false
precision.

Workflow: ${workflowName}
Description: ${workflowDescription}

Collected details: ${JSON.stringify(answers)}

Computed monthly token cost (already calculated deterministically, do not recompute):
$${costSummary.monthlyCost.toFixed(2)} for ${costSummary.modelCalls} model calls/month
(${costSummary.monthlyInputTokens} input tokens, ${costSummary.monthlyOutputTokens} output tokens).

Pricing used: ${JSON.stringify(pricing)}

Estimate the monthly benefit (time saved, labor cost avoided, error reduction, throughput
gains, etc. converted to USD/month using the provided hourly cost and hours-saved fields
plus your own reasoned estimate of the workflow's realistic productivity impact). List every
assumption you used. Then recommend GO if benefit clearly exceeds cost with healthy margin,
NO-GO if cost exceeds or roughly equals benefit, or CONDITIONAL if it's promising but depends
on unverified assumptions or piloting. Include best practices and risks specific to this kind
of workflow.`;

  const json = await callGemini(apiKey, model, {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: BENEFITS_SCHEMA,
    },
  });
  return extractJson(extractText(json));
}
