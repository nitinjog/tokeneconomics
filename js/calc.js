// Deterministic cost math. The model supplies pricing + benefit assumptions;
// this file owns the arithmetic so results are reproducible and auditable.

export function computeCosts(answers, pricing) {
  const loops = answers.isAgentic ? Math.max(1, Number(answers.loopsPerTransaction) || 1) : 1;
  const transactionsPerMonth = Number(answers.sessionsPerMonth) * Number(answers.transactionsPerSession);
  const modelCalls = transactionsPerMonth * loops;

  const monthlyInputTokens = modelCalls * Number(answers.inputTokensPerTxn);
  const monthlyOutputTokens = modelCalls * Number(answers.outputTokensPerTxn);

  const inputCost = (monthlyInputTokens / 1_000_000) * Number(pricing.inputPricePerMillion || 0);
  const outputCost = (monthlyOutputTokens / 1_000_000) * Number(pricing.outputPricePerMillion || 0);
  const monthlyCost = inputCost + outputCost;

  const perTransactionCost = transactionsPerMonth > 0 ? monthlyCost / transactionsPerMonth : 0;
  const perSessionCost = Number(answers.sessionsPerMonth) > 0 ? monthlyCost / Number(answers.sessionsPerMonth) : 0;

  return {
    loops,
    modelCalls,
    transactionsPerMonth,
    monthlyInputTokens,
    monthlyOutputTokens,
    inputCost,
    outputCost,
    monthlyCost,
    perTransactionCost,
    perSessionCost,
  };
}

export function computeReturn(monthlyCost, monthlyBenefit, oneTimeImplementationCost = 0) {
  const net = monthlyBenefit - monthlyCost;
  const roiPct = monthlyCost > 0 ? (net / monthlyCost) * 100 : null;
  const paybackMonths =
    oneTimeImplementationCost > 0 && net > 0 ? oneTimeImplementationCost / net : null;

  return { net, roiPct, paybackMonths };
}

export function deriveVerdict({ roiPct, net, confidence }) {
  // Simple, transparent thresholds — the model's own recommendation (from Call C)
  // takes precedence in the UI; this is a deterministic fallback/sanity check.
  if (roiPct === null) return 'CONDITIONAL';
  if (roiPct >= 50 && net > 0) return 'GO';
  if (roiPct < 0 || net <= 0) return 'NO-GO';
  return 'CONDITIONAL';
}

export function formatCurrency(value, currency = 'USD') {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  try {
    return (
      (sign === '-' ? '-' : '') +
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        maximumFractionDigits: abs >= 1000 ? 0 : 2,
      }).format(abs)
    );
  } catch {
    return `${sign}$${abs.toFixed(2)}`;
  }
}

export function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Math.round(value));
}
