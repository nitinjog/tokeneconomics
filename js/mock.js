// Canned responses matching the real gemini.js return shapes exactly, so the
// full UI/math flow can be exercised without an API key or quota.
// Activated by adding ?mock=1 to the URL.

const DELAY = 700;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function testApiKey() {
  await wait(300);
  return true;
}

export async function generateQuestions(_model, { workflowDescription }) {
  await wait(DELAY);
  return {
    dynamicQuestions: [
      {
        id: 'human_review_pct',
        label: 'What percentage of outputs get a human review before use?',
        hint: 'Higher review rates reduce risk but also reduce time savings.',
        type: 'number',
        defaultValue: '20',
      },
      {
        id: 'retry_rate_pct',
        label: 'Roughly what % of runs need a retry due to errors or bad output?',
        hint: 'Retries add extra token cost on top of the base loop count.',
        type: 'number',
        defaultValue: '10',
      },
      {
        id: 'complexity_tier',
        label: 'How would you describe typical task complexity?',
        hint: '',
        type: 'select',
        options: ['Simple / templated', 'Moderate', 'Complex / highly variable'],
        defaultValue: 'Moderate',
      },
    ],
  };
}

export async function fetchPricing(_model, { modelProvider, modelName }) {
  await wait(DELAY + 400);
  return {
    provider: modelProvider || 'Google',
    model: modelName || 'gemini-2.5-flash',
    inputPricePerMillion: 0.3,
    outputPricePerMillion: 2.5,
    cachedInputPricePerMillion: 0.075,
    currency: 'USD',
    asOf: '2026-09 (demo data)',
    notes: 'Demo mode — these are sample prices, not a live lookup. Connect a real API key for live pricing.',
    sources: [
      { title: 'Gemini API pricing (demo source)', url: 'https://ai.google.dev/gemini-api/docs/pricing' },
    ],
  };
}

export async function analyzeBenefits(_model, { costSummary }) {
  await wait(DELAY + 300);
  const monthlyBenefit = Math.max(costSummary.monthlyCost * 2.4, 250);
  return {
    monthlyBenefit,
    benefitAssumptions: [
      { label: 'Hours saved per month', value: '40', basis: 'stated hours-saved input' },
      { label: 'Loaded hourly cost', value: '$45/hr', basis: 'stated loaded hourly cost input' },
      { label: 'Automation reliability discount', value: '15% reduction applied', basis: 'demo estimate for review overhead' },
    ],
    recommendation: 'GO',
    confidence: 'medium',
    rationale:
      'This is demo data: estimated benefit comfortably exceeds token cost, suggesting a favorable case. Connect a real Gemini key for an analysis grounded in your actual workflow and live pricing.',
    bestPractices: [
      'Start with a scoped pilot on a subset of volume before full rollout.',
      'Cache repeated context (system prompts, knowledge base chunks) to cut input token costs.',
      'Set a hard cap on agentic loop iterations to bound worst-case cost.',
      'Track actual token usage in production and compare against this estimate monthly.',
    ],
    risks: [
      'Real-world token usage often exceeds initial estimates once edge cases appear.',
      'Human review time is easy to under-count and can erode net benefit.',
    ],
  };
}
