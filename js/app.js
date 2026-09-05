import * as geminiApi from './gemini.js';
import * as mockApi from './mock.js';
import { renderQuestionnaire, collectAnswers } from './questionnaire.js';
import { computeCosts, computeReturn } from './calc.js';
import { renderResults } from './results.js';

const params = new URLSearchParams(location.search);
const MOCK = params.get('mock') === '1';
const api = MOCK ? mockApi : geminiApi;

const LS_KEY = 'te_gemini_api_key';
const LS_MODEL = 'te_engine_model';

const state = {
  apiKey: localStorage.getItem(LS_KEY) || '',
  engineModel: localStorage.getItem(LS_MODEL) || 'gemini-2.5-flash',
  workflowName: '',
  workflowDescription: '',
  dynamicQuestions: [],
  answers: null,
  pricing: null,
  costSummary: null,
  benefits: null,
  roi: null,
};

const screens = {
  setup: document.getElementById('screen-setup'),
  describe: document.getElementById('screen-describe'),
  loading: document.getElementById('screen-loading'),
  questionnaire: document.getElementById('screen-questionnaire'),
  results: document.getElementById('screen-results'),
};

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}

function showLoading(title, subtitle) {
  document.getElementById('loading-title').textContent = title;
  document.getElementById('loading-subtitle').textContent = subtitle || '';
  showScreen('loading');
}

function friendlyError(e) {
  return e && e.message ? e.message : 'Something went wrong. Please try again.';
}

function showKeyStatus(msg, ok) {
  const el = document.getElementById('key-status');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.style.color = ok ? 'var(--color-status-good)' : 'var(--color-status-critical)';
}

// ---- Setup screen ----
const inputApiKey = document.getElementById('input-api-key');
const selectEngine = document.getElementById('select-engine');

function initSetupScreen() {
  inputApiKey.value = state.apiKey;
  selectEngine.value = state.engineModel;
  if (MOCK) {
    inputApiKey.placeholder = 'Not needed in demo mode';
    inputApiKey.value = inputApiKey.value || 'demo-mode';
    showKeyStatus('Demo mode active — sample data will be used, no real API calls are made.', true);
  }
}
initSetupScreen();

document.getElementById('btn-test-key').addEventListener('click', async () => {
  const key = inputApiKey.value.trim();
  if (!key) return showKeyStatus('Enter a key first.', false);
  showKeyStatus('Testing…', true);
  try {
    await api.testApiKey(key);
    showKeyStatus('Key works! You can continue.', true);
  } catch (e) {
    showKeyStatus(friendlyError(e), false);
  }
});

document.getElementById('btn-save-key').addEventListener('click', () => {
  const key = inputApiKey.value.trim();
  if (!key && !MOCK) return showKeyStatus('Enter your Gemini API key to continue.', false);
  state.apiKey = key;
  state.engineModel = selectEngine.value;
  if (!MOCK) {
    localStorage.setItem(LS_KEY, state.apiKey);
    localStorage.setItem(LS_MODEL, state.engineModel);
  }
  showScreen('describe');
});

document.getElementById('link-mock-mode').addEventListener('click', (e) => {
  e.preventDefault();
  const url = new URL(location.href);
  url.searchParams.set('mock', '1');
  location.href = url.toString();
});

// ---- Settings modal ----
const modal = document.getElementById('modal-settings');
document.getElementById('btn-settings').addEventListener('click', () => {
  document.getElementById('modal-input-api-key').value = state.apiKey;
  document.getElementById('modal-select-engine').value = state.engineModel;
  modal.classList.remove('hidden');
});
document.getElementById('btn-close-settings').addEventListener('click', () => modal.classList.add('hidden'));
modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.classList.add('hidden'));
document.getElementById('btn-save-settings').addEventListener('click', () => {
  state.apiKey = document.getElementById('modal-input-api-key').value.trim();
  state.engineModel = document.getElementById('modal-select-engine').value;
  localStorage.setItem(LS_KEY, state.apiKey);
  localStorage.setItem(LS_MODEL, state.engineModel);
  modal.classList.add('hidden');
});
document.getElementById('btn-clear-key').addEventListener('click', () => {
  localStorage.removeItem(LS_KEY);
  state.apiKey = '';
  modal.classList.add('hidden');
  inputApiKey.value = '';
  showScreen('setup');
});

// ---- Describe screen ----
document.getElementById('btn-back-to-setup').addEventListener('click', () => showScreen('setup'));

document.getElementById('btn-generate-questions').addEventListener('click', async () => {
  const name = document.getElementById('input-workflow-name').value.trim();
  const desc = document.getElementById('input-workflow-desc').value.trim();
  if (!name || !desc) {
    alert('Please enter both a workflow name and description.');
    return;
  }
  state.workflowName = name;
  state.workflowDescription = desc;

  showLoading('Generating tailored questions…', 'Gemini is reading your workflow description.');
  try {
    const result = await api.generateQuestions(state.apiKey, state.engineModel, {
      workflowName: name,
      workflowDescription: desc,
    });
    state.dynamicQuestions = result.dynamicQuestions || [];
    renderQuestionnaire(document.getElementById('form-questionnaire'), state.dynamicQuestions);
    showScreen('questionnaire');
  } catch (e) {
    alert(friendlyError(e));
    showScreen('describe');
  }
});

// ---- Questionnaire screen ----
document.getElementById('btn-back-to-describe').addEventListener('click', () => showScreen('describe'));

document.getElementById('btn-submit-questionnaire').addEventListener('click', async () => {
  const form = document.getElementById('form-questionnaire');
  if (!form.reportValidity()) return;
  state.answers = collectAnswers(form, state.dynamicQuestions);
  await runAnalysis();
});

async function runAnalysis() {
  showLoading('Looking up current token pricing…', 'Searching the web for the latest rates for your selected model.');
  try {
    const pricing = await api.fetchPricing(state.apiKey, state.engineModel, {
      modelProvider: state.answers.modelProvider,
      modelName: state.answers.modelName,
    });
    state.pricing = pricing;
    state.costSummary = computeCosts(state.answers, pricing);

    showLoading('Estimating benefits & recommendation…', 'Gemini is analyzing likely impact and best practices.');
    const benefits = await api.analyzeBenefits(state.apiKey, state.engineModel, {
      workflowName: state.workflowName,
      workflowDescription: state.workflowDescription,
      answers: state.answers,
      costSummary: state.costSummary,
      pricing: state.pricing,
    });
    state.benefits = benefits;
    state.roi = computeReturn(state.costSummary.monthlyCost, benefits.monthlyBenefit, state.answers.oneTimeImplementationCost);

    renderCurrentResults();
    showScreen('results');
  } catch (e) {
    alert(friendlyError(e));
    showScreen('questionnaire');
  }
}

function renderCurrentResults() {
  renderResults(document.getElementById('results-content'), {
    workflowName: state.workflowName,
    workflowDescription: state.workflowDescription,
    pricing: state.pricing,
    costSummary: state.costSummary,
    benefits: state.benefits,
    roi: state.roi,
    currency: state.pricing.currency || 'USD',
  });
}

// ---- Results screen events ----
document.addEventListener('app:start-over', () => {
  document.getElementById('input-workflow-name').value = '';
  document.getElementById('input-workflow-desc').value = '';
  state.workflowName = '';
  state.workflowDescription = '';
  state.dynamicQuestions = [];
  state.answers = null;
  showScreen('describe');
});

document.addEventListener('app:pricing-updated', (e) => {
  state.pricing = { ...state.pricing, ...e.detail };
  state.costSummary = computeCosts(state.answers, state.pricing);
  state.roi = computeReturn(state.costSummary.monthlyCost, state.benefits.monthlyBenefit, state.answers.oneTimeImplementationCost);
  renderCurrentResults();
});

// ---- Initial screen ----
showScreen(state.apiKey ? 'describe' : 'setup');
