# Demo proxy (Cloudflare Worker)

A transparent reverse-proxy for Gemini's `generateContent` endpoint. It holds a Gemini API
key as an encrypted secret (never in any file) and enforces an origin allowlist, a model
allowlist, and per-IP / global daily caps, so the main app can offer a "Try live demo"
mode without exposing anyone's personal API key.

No prompt or schema logic lives here — the frontend (`../js/gemini.js`) builds the exact
same request bodies for both BYOK and demo mode; this Worker just forwards them.

## One-time setup

```
cd worker
npx wrangler login                          # opens your browser, log into Cloudflare
npx wrangler kv namespace create RATE_LIMIT_KV
```

Copy the `id` printed by the KV command into `wrangler.toml` under `[[kv_namespaces]]`.

```
npx wrangler secret put GEMINI_API_KEY
```

Paste a **dedicated** Gemini API key (generate a fresh one at
https://aistudio.google.com/app/apikey just for this proxy — keep it separate from any
personal key, so it can be revoked independently if ever needed).

## Deploy

```
npx wrangler deploy
```

Prints the live URL, e.g. `https://tokeneconomics-demo.<your-subdomain>.workers.dev`.
Put that URL into `DEMO_PROXY_URL` in `../js/app.js`.

## Local dev

```
npx wrangler dev
```

Runs a local emulator (default `http://localhost:8787`) with local KV persistence — no
deploy needed to iterate.

## Tuning

Edit the `[vars]` in `wrangler.toml` (no redeploy of secrets needed, just `wrangler deploy`
again):

- `ALLOWED_ORIGINS` — comma-separated list of origins allowed to call this proxy
- `ALLOWED_MODELS` — comma-separated model allowlist (keep to cheap Flash models)
- `IP_DAILY_LIMIT` — max analyses/day per visitor IP
- `GLOBAL_DAILY_LIMIT` — max analyses/day across all visitors combined

Each analysis makes up to 3 calls through this proxy (questionnaire, pricing, benefits),
so `GLOBAL_DAILY_LIMIT * 3` should stay comfortably under Gemini's own free-tier daily
request cap for whichever model you allow.
