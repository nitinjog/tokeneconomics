// Renders the base questionnaire (always present, guarantees the cost math has
// its inputs) plus AI-generated dynamic questions specific to the workflow.

export const BASE_FIELDS = [
  {
    id: 'sessionsPerMonth', type: 'number', required: true, min: 1, defaultValue: '500',
    label: 'Sessions per month', hint: 'How many user/customer sessions touch this workflow monthly?',
  },
  {
    id: 'transactionsPerSession', type: 'number', required: true, min: 1, defaultValue: '1',
    label: 'Transactions per session', hint: 'How many distinct AI calls/tasks happen per session?',
  },
  {
    id: 'inputTokensPerTxn', type: 'number', required: true, min: 1, defaultValue: '2000',
    label: 'Input tokens per transaction', hint: 'Rough size of prompt + context sent to the model each time.',
  },
  {
    id: 'outputTokensPerTxn', type: 'number', required: true, min: 1, defaultValue: '500',
    label: 'Output tokens per transaction', hint: 'Rough size of the model’s response each time.',
  },
  {
    id: 'isAgentic', type: 'select', required: true, options: ['No', 'Yes'], defaultValue: 'No',
    label: 'Is this an agentic workflow?', hint: 'Agentic = the model calls itself / loops multiple times per transaction.',
  },
  {
    id: 'loopsPerTransaction', type: 'number', required: false, min: 1, defaultValue: '3',
    label: 'Average loop iterations per transaction', hint: 'Only applies to agentic workflows.',
    conditionalOn: { field: 'isAgentic', equals: 'Yes' },
  },
  {
    id: 'modelProvider', type: 'select', required: true,
    options: ['Google', 'OpenAI', 'Anthropic', 'Meta', 'Mistral', 'Other'], defaultValue: 'Google',
    label: 'Model provider', hint: '',
  },
  {
    id: 'modelName', type: 'text', required: true, defaultValue: 'gemini-2.5-flash',
    label: 'Model name', hint: 'e.g. gemini-2.5-flash, gpt-4o, claude-sonnet-5',
  },
  {
    id: 'hoursSavedPerMonth', type: 'number', required: true, min: 0, defaultValue: '40',
    label: 'Estimated hours saved per month', hint: 'Your best estimate — Gemini will sanity-check this.',
  },
  {
    id: 'loadedHourlyCost', type: 'number', required: true, min: 0, defaultValue: '45',
    label: 'Loaded hourly cost (USD)', hint: 'Fully-loaded cost of the work being automated/assisted.',
  },
  {
    id: 'oneTimeImplementationCost', type: 'number', required: false, min: 0, defaultValue: '0',
    label: 'One-time build cost (optional, USD)', hint: 'Used to estimate payback period, if provided.',
  },
];

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fieldWrapperHtml(field, inner) {
  return `
    <div class="field-row" data-field-wrapper="${escapeHtml(field.id)}">
      <label class="field-label" for="f-${escapeHtml(field.id)}">${escapeHtml(field.label)}${field.required ? '' : ' <span class="field-hint">(optional)</span>'}</label>
      ${inner}
      ${field.hint ? `<span class="field-hint">${escapeHtml(field.hint)}</span>` : ''}
    </div>`;
}

function renderField(field) {
  const common = `id="f-${escapeHtml(field.id)}" name="${escapeHtml(field.id)}" class="field-input" ${field.required ? 'required' : ''}`;
  if (field.type === 'select' && Array.isArray(field.options) && field.options.length > 0) {
    const opts = field.options
      .map((o) => `<option value="${escapeHtml(o)}" ${o === field.defaultValue ? 'selected' : ''}>${escapeHtml(o)}</option>`)
      .join('');
    return fieldWrapperHtml(field, `<select ${common}>${opts}</select>`);
  }
  if (field.type === 'boolean') {
    return fieldWrapperHtml(field, `
      <select ${common}>
        <option value="true" ${field.defaultValue === 'true' ? 'selected' : ''}>Yes</option>
        <option value="false" ${field.defaultValue === 'false' ? 'selected' : ''}>No</option>
      </select>`);
  }
  const min = field.min !== undefined ? `min="${field.min}"` : '';
  const type = field.type === 'number' ? 'number' : 'text';
  return fieldWrapperHtml(field, `<input type="${type}" ${min} value="${escapeHtml(field.defaultValue)}" ${common} />`);
}

export function renderQuestionnaire(formEl, dynamicQuestions = []) {
  formEl.innerHTML = '';

  BASE_FIELDS.forEach((field) => {
    formEl.insertAdjacentHTML('beforeend', renderField(field));
  });

  if (dynamicQuestions.length > 0) {
    formEl.insertAdjacentHTML('beforeend', `<div class="pt-2 border-t border-hairline"><p class="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">Workflow-specific questions</p></div>`);
    dynamicQuestions.forEach((q) => {
      const field = { ...q, required: false };
      formEl.insertAdjacentHTML('beforeend', renderField(field));
    });
  }

  // Conditional visibility (e.g. loop count only for agentic workflows)
  const applyConditionals = () => {
    BASE_FIELDS.forEach((field) => {
      if (!field.conditionalOn) return;
      const wrapper = formEl.querySelector(`[data-field-wrapper="${field.id}"]`);
      const controller = formEl.querySelector(`#f-${field.conditionalOn.field}`);
      if (!wrapper || !controller) return;
      wrapper.style.display = controller.value === field.conditionalOn.equals ? '' : 'none';
    });
  };
  formEl.addEventListener('change', applyConditionals);
  applyConditionals();
}

export function collectAnswers(formEl, dynamicQuestions = []) {
  const answers = {};
  BASE_FIELDS.forEach((field) => {
    const el = formEl.querySelector(`#f-${field.id}`);
    if (!el) return;
    answers[field.id] = field.type === 'number' ? Number(el.value || 0) : el.value;
  });
  answers.isAgentic = answers.isAgentic === 'Yes';

  answers.dynamicAnswers = {};
  dynamicQuestions.forEach((q) => {
    const el = formEl.querySelector(`#f-${q.id}`);
    if (!el) return;
    answers.dynamicAnswers[q.id] = q.type === 'number' ? Number(el.value || 0) : el.value;
  });

  return answers;
}
