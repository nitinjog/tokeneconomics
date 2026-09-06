# Token Economics Analyzer

A static, client-side web app that turns a plain-language description of an AI/LLM
workflow into a token-economics business case: estimated monthly cost (from live model
pricing), estimated monthly benefit, a go/no-go recommendation, and best-practice
suggestions — generated via the Gemini API. No backend for the app itself; hosted on
GitHub Pages. A small Cloudflare Worker exists solely to power the public live demo
(see below) — it is not required for BYOK usage.

- **Live site:** https://nitinjog.github.io/tokeneconomics/
- **Repo:** https://github.com/nitinjog/tokeneconomics (`main` is what Pages serves)
- **Demo proxy:** https://tokeneconomics-demo.nitin-nandrajog.workers.dev (Cloudflare Worker)

## Three ways to use the app

1. **BYOK** — user pastes their own Gemini key; stored only in `localStorage`, sent only
   to Google. Default path, unlimited use.
2. **Live demo** (`?demo=1`, or the "🚀 Try live demo" button) — routes Gemini calls
   through the Cloudflare Worker proxy instead, using a key the proxy holds server-side.
   Real AI, but capped (see Operations below) so no one's key/quota gets drained.
3. **Sample data** (`?mock=1`, or "Explore with sample data") — canned responses, no
   network calls, no key needed. Good for UI iteration without spending quota.

## Architecture

```
index.html          Screens: setup, describe, questionnaire, loading, results
css/styles.css       Design tokens (light/dark) + component styles
js/app.js            State machine, screen navigation, localStorage, mode selection
js/gemini.js         Gemini API calls — configurable transport (BYOK vs proxy)
js/mock.js           Canned responses for ?mock=1 (same call signatures as gemini.js)
js/questionnaire.js  Base + AI-generated question rendering and validation
js/calc.js           Deterministic cost math (tokens → USD) and ROI — not AI-computed
js/results.js        Results dashboard rendering + charts
worker/              Cloudflare Worker: demo-mode reverse proxy (see below)
```

**Flow:** describe workflow → Gemini generates a tailored questionnaire (Call A,
structured JSON) → user answers → Gemini searches the web for current token pricing
(Call B, `google_search` grounding) → cost computed deterministically in `calc.js` from
that pricing → Gemini estimates benefit + recommendation (Call C, structured JSON) →
results dashboard.

**Key API constraint:** Gemini's `google_search` tool and `responseSchema` structured
output cannot be used in the same call — this is why pricing lookup (search) and the two
structured calls are separate requests. All three prompts/schemas live in `js/gemini.js`
and are shared unchanged between BYOK and proxy transport modes (see `configureTransport`).

## The demo proxy (`worker/`)

A transparent reverse-proxy for `generateContent` — it knows nothing about prompts or
schemas, just forwards request bodies after validating:
- **Origin allowlist** (`ALLOWED_ORIGINS` in `worker/wrangler.toml`)
- **Model allowlist** (`ALLOWED_MODELS` — cheap Flash models only, no Pro)
- **Per-IP daily cap** (`IP_DAILY_LIMIT`, default 5 analyses/day)
- **Global daily cap** (`GLOBAL_DAILY_LIMIT`, default 50 analyses/day)

Counters live in Cloudflare KV (`RATE_LIMIT_KV`, namespace id
`0d2395cdd6a946109356b1316d2317cc`), keyed by date, auto-expiring after 2 days. The real
Gemini key is a Worker secret (`GEMINI_API_KEY`, set via `wrangler secret put` — **never
in any file, never in this repo, never pasted into a Claude Code session**). Cloudflare
account: `nitin.nandrajog@gmail.com`, subdomain `nitin-nandrajog.workers.dev`.

Each analysis = 3 calls through the proxy. At the default 50/day global cap that's ≤150
Gemini calls/day — comfortably inside Gemini 2.5 Flash's free-tier 1,500 requests/day, so
the demo runs at $0 as configured. Cloudflare Workers free tier (100k req/day, no card)
covers the proxy itself.

## Operations

### Reset today's demo usage (give everyone full quota again, mid-day)

Counters auto-expire after 2 days on their own — this is only for forcing an early reset.

```
cd worker
npx wrangler kv key list --namespace-id 0d2395cdd6a946109356b1316d2317cc --remote
# note the keys, e.g. global:2026-09-06 and ip:2026-09-06:<some ip>
npx wrangler kv key delete --namespace-id 0d2395cdd6a946109356b1316d2317cc "global:2026-09-06" --remote
npx wrangler kv key delete --namespace-id 0d2395cdd6a946109356b1316d2317cc "ip:2026-09-06:<ip>" --remote
```

Verify: `curl -s -H "Origin: https://nitinjog.github.io" "https://tokeneconomics-demo.nitin-nandrajog.workers.dev/status"`

### Change the daily limit values

Edit `IP_DAILY_LIMIT` / `GLOBAL_DAILY_LIMIT` in `worker/wrangler.toml`, then:

```
cd worker
npx wrangler deploy
```

No re-login or secret re-entry needed. Keep `GLOBAL_DAILY_LIMIT × 3` well under Gemini's
free-tier daily request cap for whichever model `ALLOWED_MODELS` permits, to stay at $0.

### Rotate the demo Gemini key

Generate a new key at aistudio.google.com, then:
```
cd worker
npx wrangler secret put GEMINI_API_KEY
```
Run this in a terminal outside Claude Code / any chat session — the key should never be
pasted into a conversation or shell command visible to a tool transcript.

## Local development

```
python -m http.server 8123
```
Then open `http://localhost:8123` (add `?mock=1` or `?demo=1` as needed — the Worker's
`ALLOWED_ORIGINS` already includes `http://localhost:8123`).

## Git workflow notes

- `main` is what GitHub Pages serves — treat it as the stable/live branch.
- Feature work happens on a branch (e.g. `demo-proxy` was used for the live-demo feature)
  and merges via PR once verified, so `main`/Pages always has a known-good fallback.
- Commits carry no AI attribution (per the user's global Claude Code rules) — git identity
  is the user's own (`Nitin`, `nitin.nandrajog@gmail.com`).

## Secrets — never commit

The only secret in this project is `GEMINI_API_KEY` on the Worker, set via
`wrangler secret put` and stored encrypted by Cloudflare. It appears in no file. The
BYOK user's own key lives only in their browser's `localStorage`, never sent anywhere but
Google's API. `worker/wrangler.toml`'s KV namespace id is not a secret (just an
identifier) and is safe to have committed.
