// Token Economics Analyzer — demo proxy.
//
// A transparent reverse-proxy for Gemini's generateContent endpoint. It knows
// nothing about prompts or schemas — it only validates origin/model/rate-limits,
// injects the real (secret) Gemini API key server-side, and forwards the request
// body verbatim. This keeps ALL prompt-engineering logic in the frontend's
// js/gemini.js as the single source of truth for both BYOK and demo modes.
//
// Required bindings (see wrangler.toml):
//   env.GEMINI_API_KEY   — Worker secret, set via `wrangler secret put GEMINI_API_KEY`
//   env.RATE_LIMIT_KV    — KV namespace for per-IP / global daily counters
//   env.ALLOWED_ORIGINS  — comma-separated allowlist, e.g. GitHub Pages origin
//   env.ALLOWED_MODELS   — comma-separated model allowlist (cheap models only)
//   env.IP_DAILY_LIMIT   — max analyses/day per IP (default 5)
//   env.GLOBAL_DAILY_LIMIT — max analyses/day across all visitors (default 50)

const COUNTER_TTL_SECONDS = 60 * 60 * 24 * 2; // 2 days — counters auto-expire

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = parseList(env.ALLOWED_ORIGINS);
    const originAllowed = allowedOrigins.includes(origin);

    const headers = corsHeaders(origin, originAllowed);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (!originAllowed) {
      return json({ error: { message: 'Origin not allowed.', kind: 'demo_origin' } }, 403, headers);
    }

    if (request.method === 'GET' && url.pathname === '/status') {
      return handleStatus(request, env, headers);
    }

    const match = url.pathname.match(/^\/v1beta\/models\/([^:]+):generateContent$/);
    if (request.method === 'POST' && match) {
      return handleGenerate(request, env, match[1], headers);
    }

    return json({ error: { message: 'Not found.' } }, 404, headers);
  },
};

function parseList(value) {
  return (value || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function corsHeaders(origin, originAllowed) {
  const h = new Headers();
  if (originAllowed) {
    h.set('Access-Control-Allow-Origin', origin);
    h.set('Vary', 'Origin');
  }
  h.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type');
  return h;
}

function json(obj, status, headers) {
  const h = new Headers(headers);
  h.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(obj), { status, headers: h });
}

function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, UTC
}

async function getCount(env, key) {
  const v = await env.RATE_LIMIT_KV.get(key);
  return v ? parseInt(v, 10) || 0 : 0;
}

async function incrCount(env, key, current) {
  await env.RATE_LIMIT_KV.put(key, String(current + 1), { expirationTtl: COUNTER_TTL_SECONDS });
}

function limits(env) {
  return {
    ipLimit: Number(env.IP_DAILY_LIMIT) || 5,
    globalLimit: Number(env.GLOBAL_DAILY_LIMIT) || 50,
  };
}

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

async function handleStatus(request, env, headers) {
  const { ipLimit, globalLimit } = limits(env);
  const d = today();
  const ip = clientIp(request);

  const [globalCount, ipCount] = await Promise.all([
    getCount(env, `global:${d}`),
    getCount(env, `ip:${d}:${ip}`),
  ]);

  return json(
    {
      globalRemaining: Math.max(0, globalLimit - globalCount),
      globalLimit,
      ipRemaining: Math.max(0, ipLimit - ipCount),
      ipLimit,
    },
    200,
    headers
  );
}

async function handleGenerate(request, env, model, headers) {
  const allowedModels = parseList(env.ALLOWED_MODELS);
  if (!allowedModels.includes(model)) {
    return json(
      { error: { message: `Model "${model}" is not available in demo mode.`, kind: 'demo_model' } },
      403,
      headers
    );
  }

  const { ipLimit, globalLimit } = limits(env);
  const d = today();
  const ip = clientIp(request);
  const globalKey = `global:${d}`;
  const ipKey = `ip:${d}:${ip}`;

  const [globalCount, ipCount] = await Promise.all([getCount(env, globalKey), getCount(env, ipKey)]);

  if (ipCount >= ipLimit) {
    return json(
      {
        error: {
          message: `You've used today's demo allowance (${ipLimit} analyses). Add your own free Gemini key for unlimited use.`,
          kind: 'demo_ip_limit',
        },
      },
      429,
      headers
    );
  }
  if (globalCount >= globalLimit) {
    return json(
      {
        error: {
          message: "Today's shared demo quota is used up. Try again tomorrow, or add your own free Gemini key.",
          kind: 'demo_global_limit',
        },
      },
      429,
      headers
    );
  }

  let body;
  try {
    body = await request.text();
  } catch {
    return json({ error: { message: 'Could not read request body.' } }, 400, headers);
  }

  // Soft cap: increment before forwarding. Not atomic (KV has no atomic increment on
  // the free tier) — a small race window under concurrent requests is an accepted
  // tradeoff for a cost-control heuristic, not a security boundary.
  await Promise.all([incrCount(env, globalKey, globalCount), incrCount(env, ipKey, ipCount)]);

  let upstream;
  try {
    upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
    );
  } catch {
    return json({ error: { message: 'Could not reach the Gemini API from the proxy.' } }, 502, headers);
  }

  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
