# Token Economics Analyzer

A static, client-side web app that turns a plain-language description of an AI/LLM
workflow into a token-economics business case: estimated monthly cost (based on live
model pricing), estimated monthly benefit, a go / no-go recommendation, and best-practice
suggestions — all generated via the Gemini API, called directly from your browser.

No backend, no build step. Runs entirely as static files, suitable for GitHub Pages.

## How it works

1. You paste your own Gemini API key (stored only in your browser's `localStorage`).
2. You describe the workflow; Gemini generates a short, tailored questionnaire.
3. You answer the questionnaire (volume, tokens per transaction, agentic loops, model,
   benefit inputs).
4. Gemini searches the web for current token pricing for your chosen model.
5. Cost is computed deterministically in JavaScript from that pricing and your answers.
6. Gemini estimates the monthly benefit, gives a recommendation, and lists best practices.
7. You get a results dashboard with charts, assumptions, citations, and a printable report.

## Getting a free Gemini API key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Sign in with a Google account and click **Create API key**.
3. Copy the key (starts with `AIza...`) and paste it into the app's setup screen.

The free tier (Gemini 2.5 Flash) supports roughly 1,500 requests/day — each analysis in
this app uses 3 requests, so that's ~500 analyses/day at no cost.

**Your key is never committed to this repo or sent anywhere except Google's API.** It
lives only in your browser's local storage.

## Running locally

No build step required. From the project root:

```
python -m http.server 8000
```

Then open `http://localhost:8000`.

To try the app without a real API key, append `?mock=1` to the URL (or click
"Try demo mode" on the setup screen) — this uses canned sample data instead of calling
Gemini, useful for exploring the UI or for local development.

## Deploying to GitHub Pages

1. Push this repository to GitHub.
2. In the repo, go to **Settings → Pages**.
3. Under **Source**, select the branch (e.g. `main`) and root folder (`/`).
4. Save. GitHub will publish the site at `https://<username>.github.io/<repo>/`.

The `.nojekyll` file at the repo root tells GitHub Pages to serve files as-is (important
since some filenames/folders could otherwise be mistaken for Jekyll content).

## Project structure

```
index.html          Screens: setup, describe, questionnaire, loading, results
css/styles.css       Design tokens (light/dark) + component styles
js/app.js            State machine, screen navigation, localStorage
js/gemini.js         Gemini API calls (questionnaire, pricing search, benefits)
js/mock.js           Canned responses for ?mock=1 demo mode
js/questionnaire.js  Base + AI-generated question rendering and validation
js/calc.js           Deterministic cost math (tokens → USD) and ROI
js/results.js        Results dashboard rendering + charts
```

## Notes & limitations

- Estimates are indicative. Benefit figures are AI-generated assumptions, not audited
  numbers — validate with a real pilot before committing budget.
- Gemini's web-search grounding and structured JSON output can't be used in the same
  API call, so pricing lookup and benefit/recommendation generation are separate calls.
- If the live pricing lookup looks wrong, you can correct it manually on the results
  page before recalculating the cost figures.
