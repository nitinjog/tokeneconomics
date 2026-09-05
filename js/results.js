import { formatCurrency, formatNumber } from './calc.js';

// Validated categorical palette (see dataviz skill) — fixed hue order, not cycled.
const PALETTE = {
  light: { blue: '#2a78d6', green: '#008300', violet: '#4a3aa7', ink: '#0b0b0b', muted: '#898781', grid: '#e1e0d9', surface: '#fcfcfb' },
  dark:  { blue: '#3987e5', green: '#008300', violet: '#9085e9', ink: '#ffffff', muted: '#898781', grid: '#2c2c2a', surface: '#1a1a19' },
};

function isDarkMode() {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'dark') return true;
  if (attr === 'light') return false;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function colors() {
  return isDarkMode() ? PALETTE.dark : PALETTE.light;
}

let costBenefitChart = null;
let costBreakdownChart = null;

function verdictClass(rec) {
  if (rec === 'GO') return 'verdict-go';
  if (rec === 'NO-GO') return 'verdict-nogo';
  return 'verdict-conditional';
}

function verdictIcon(rec) {
  if (rec === 'GO') return '✓';
  if (rec === 'NO-GO') return '✕';
  return '◐';
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function safeUrl(url) {
  try {
    const u = new URL(url, location.href);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '#';
  } catch {
    return '#';
  }
}

function listHtml(items) {
  if (!items || items.length === 0) return '<p class="text-sm text-ink-muted">None noted.</p>';
  return `<ul class="space-y-2 text-sm">${items.map((i) => `<li class="flex gap-2"><span class="text-ink-muted">–</span><span>${escapeHtml(i)}</span></li>`).join('')}</ul>`;
}

function assumptionsHtml(assumptions) {
  if (!assumptions || assumptions.length === 0) return '<p class="text-sm text-ink-muted">No assumptions listed.</p>';
  return `
    <div class="space-y-3">
      ${assumptions.map((a) => `
        <div class="flex items-start justify-between gap-4 text-sm border-b border-hairline pb-2 last:border-0 last:pb-0">
          <div>
            <div class="font-medium">${escapeHtml(a.label)}</div>
            <div class="text-ink-muted text-xs">${escapeHtml(a.basis || '')}</div>
          </div>
          <div class="font-semibold whitespace-nowrap">${escapeHtml(a.value)}</div>
        </div>`).join('')}
    </div>`;
}

function sourcesHtml(sources) {
  if (!sources || sources.length === 0) return '';
  return `
    <div class="mt-3 pt-3 border-t border-hairline">
      <p class="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">Pricing sources</p>
      <ul class="space-y-1">
        ${sources.map((s) => `<li class="text-xs"><a class="text-brand-blue hover:underline" href="${safeUrl(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title || s.url)}</a></li>`).join('')}
      </ul>
    </div>`;
}

export function renderResults(container, data) {
  const { workflowName, workflowDescription, pricing, costSummary, benefits, roi, currency } = data;
  const c = colors();

  container.innerHTML = `
    <div class="space-y-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="step-indicator mb-1">Step 4 of 4 — Results</p>
          <h2 class="text-2xl font-semibold">${escapeHtml(workflowName)}</h2>
          <p class="text-ink-secondary text-sm mt-1 max-w-2xl">${escapeHtml(workflowDescription)}</p>
        </div>
        <span class="verdict-badge ${verdictClass(benefits.recommendation)}">
          ${verdictIcon(benefits.recommendation)} ${escapeHtml(benefits.recommendation)}
        </span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="card stat-tile">
          <div class="stat-label">Monthly cost</div>
          <div class="stat-value">${formatCurrency(costSummary.monthlyCost, currency)}</div>
          <div class="text-xs text-ink-muted mt-1">${formatNumber(costSummary.modelCalls)} model calls/mo</div>
        </div>
        <div class="card stat-tile">
          <div class="stat-label">Monthly benefit</div>
          <div class="stat-value">${formatCurrency(benefits.monthlyBenefit, currency)}</div>
          <div class="text-xs text-ink-muted mt-1">Confidence: ${escapeHtml(benefits.confidence)}</div>
        </div>
        <div class="card stat-tile">
          <div class="stat-label">Net / ROI</div>
          <div class="stat-value" style="color:${roi.net >= 0 ? 'var(--color-status-good)' : 'var(--color-status-critical)'}">${formatCurrency(roi.net, currency)}</div>
          <div class="text-xs text-ink-muted mt-1">${roi.roiPct !== null ? roi.roiPct.toFixed(0) + '% ROI' : ''}${roi.paybackMonths ? ` · payback ${roi.paybackMonths.toFixed(1)} mo` : ''}</div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="card p-5">
          <h3 class="font-semibold mb-3 text-sm">Cost vs. benefit (monthly)</h3>
          <div class="h-56"><canvas id="chart-cost-benefit"></canvas></div>
        </div>
        <div class="card p-5">
          <h3 class="font-semibold mb-3 text-sm">Cost breakdown</h3>
          <div class="h-56"><canvas id="chart-cost-breakdown"></canvas></div>
        </div>
      </div>

      <div class="card p-5">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-sm">Token pricing used</h3>
          <span class="chip" style="background:${c.grid};color:${c.muted}">as of ${escapeHtml(pricing.asOf || 'n/a')}</span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <label class="field-row"><span class="field-hint">Input $/1M tokens</span>
            <input id="edit-input-price" type="number" step="0.01" class="field-input" value="${pricing.inputPricePerMillion}" /></label>
          <label class="field-row"><span class="field-hint">Output $/1M tokens</span>
            <input id="edit-output-price" type="number" step="0.01" class="field-input" value="${pricing.outputPricePerMillion}" /></label>
          <div class="flex items-end"><button id="btn-recompute" class="btn-secondary w-full">Recalculate</button></div>
        </div>
        ${pricing.notes ? `<p class="text-xs text-ink-muted mt-2">${escapeHtml(pricing.notes)}</p>` : ''}
        ${sourcesHtml(pricing.sources)}
      </div>

      <div class="card p-5">
        <h3 class="font-semibold mb-3 text-sm">Why this recommendation</h3>
        <p class="text-sm text-ink-secondary mb-4">${escapeHtml(benefits.rationale)}</p>
        <h4 class="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">Benefit assumptions</h4>
        ${assumptionsHtml(benefits.benefitAssumptions)}
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="card p-5">
          <h3 class="font-semibold mb-3 text-sm">Best practices</h3>
          ${listHtml(benefits.bestPractices)}
        </div>
        <div class="card p-5">
          <h3 class="font-semibold mb-3 text-sm">Risks to watch</h3>
          ${listHtml(benefits.risks)}
        </div>
      </div>

      <div class="flex justify-between no-print pt-2">
        <button id="btn-start-over" class="btn-secondary">Start a new analysis</button>
        <button id="btn-print" class="btn-primary">Download / print report</button>
      </div>
    </div>
  `;

  buildCharts(container, { costSummary, benefits, currency });

  container.querySelector('#btn-print').addEventListener('click', () => window.print());
  container.querySelector('#btn-start-over').addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('app:start-over'));
  });
  container.querySelector('#btn-recompute').addEventListener('click', () => {
    const inputPricePerMillion = Number(container.querySelector('#edit-input-price').value);
    const outputPricePerMillion = Number(container.querySelector('#edit-output-price').value);
    document.dispatchEvent(new CustomEvent('app:pricing-updated', { detail: { inputPricePerMillion, outputPricePerMillion } }));
  });
}

function buildCharts(container, { costSummary, benefits, currency }) {
  const c = colors();
  if (costBenefitChart) costBenefitChart.destroy();
  if (costBreakdownChart) costBreakdownChart.destroy();

  const cbCtx = container.querySelector('#chart-cost-benefit').getContext('2d');
  costBenefitChart = new Chart(cbCtx, {
    type: 'bar',
    data: {
      labels: ['Monthly cost', 'Monthly benefit'],
      datasets: [{
        data: [costSummary.monthlyCost, benefits.monthlyBenefit],
        backgroundColor: [c.blue, c.green],
        borderRadius: 4,
        maxBarThickness: 56,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => formatCurrency(ctx.parsed.x, currency) } },
      },
      scales: {
        x: { grid: { color: c.grid }, ticks: { color: c.muted, callback: (v) => formatCurrency(v, currency) } },
        y: { grid: { display: false }, ticks: { color: c.ink } },
      },
    },
  });

  const cbdCtx = container.querySelector('#chart-cost-breakdown').getContext('2d');
  costBreakdownChart = new Chart(cbdCtx, {
    type: 'bar',
    data: {
      labels: ['Token cost'],
      datasets: [
        { label: 'Input tokens', data: [costSummary.inputCost], backgroundColor: c.blue, borderRadius: 4, maxBarThickness: 56 },
        { label: 'Output tokens', data: [costSummary.outputCost], backgroundColor: c.violet, borderRadius: 4, maxBarThickness: 56 },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: c.ink, boxWidth: 12, boxHeight: 12 } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.x, currency)}` } },
      },
      scales: {
        x: { stacked: true, grid: { color: c.grid }, ticks: { color: c.muted, callback: (v) => formatCurrency(v, currency) } },
        y: { stacked: true, grid: { display: false }, ticks: { color: c.ink } },
      },
    },
  });
}
