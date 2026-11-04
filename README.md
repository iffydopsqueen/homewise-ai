# HomeWise AI

> Release status: three MVP workflows (Affordability, Property Costs,
> Compare Properties) with deterministic calculations, provenance
> labels, responsive UI, Light/Natural/Dark themes, and optional
> Meta Muse Spark 1.3 explanations validated against verified figures.
> Verified: 474/474 unit/API tests, typecheck, and lint (all current);
> 166/166 Playwright tests and the production build on Mac before the
> final prompt-polish change. That change touched only AI wording and
> its unit tests, but one confirmatory Mac run is still recommended —
> see docs/DEMO.md. What-If calculation engine and API exist but have
> no UI yet and stay out of the demo path.

## Project purpose

HomeWise AI is an AI-assisted homebuying affordability and property
comparison application. It helps first-time homebuyers understand the
true cost of homeownership — beyond principal and interest — and avoid
becoming house poor.

## Problem being addressed

Buyers focus on listing prices and headline mortgage payments while
property taxes, homeowners insurance, HOA fees, maintenance, and other
recurring costs stay hidden until after purchase. Traditional
calculators show numbers without explanation; general AI chatbots
explain fluently but can invent or miscalculate figures. HomeWise AI
pairs deterministic, tested calculations with AI explanations grounded
exclusively in those verified figures.

## MVP workflows

1. **Affordability** — monthly take-home income, debts, recurring
   expenses, savings, and proposed housing costs produce remaining
   income, obligation ratios, and a savings cushion.
2. **Property Costs** — true cost of ownership: mortgage principal
   and interest, property taxes, homeowners insurance, HOA fees,
   maintenance reserve, PMI, other recurring costs, and upfront cash.
3. **Compare Properties** — side-by-side comparison of two properties
   with per-component and total differences, neutrally presented.
4. **Financial Insights** (in every workflow) — deterministic charts
   plus optional AI explanations grounded in verified calculations —
   the model never computes figures.

What-If scenarios exist in the calculation engine and API but have no
UI yet; they are out of the demo path.

Around the workflows, the app provides a dashboard with per-workflow
status and result summaries, deterministic insight charts in every
workflow, source/provenance labels with supporting figures, a
responsive mobile-to-desktop layout, and Light, Natural, and Dark
appearance themes.

Full requirements, out-of-scope items, and open decisions:
[PRODUCT_SPEC.md](PRODUCT_SPEC.md).

For the hackathon demo walkthrough, see [docs/DEMO.md](docs/DEMO.md).

The application distinguishes user-provided values from estimates and
assumptions, and never promises mortgage approval or professional
financial advice.

## How AI fits in

- **Role of Meta Muse Spark 1.3:** on explicit click only, the server
  recomputes the workflow's figures, builds a fact ledger, and asks
  the model (Responses API, `low` reasoning effort) to explain those
  figures in plain language. Nothing is requested automatically.
- **Why calculations are deterministic:** every dollar, ratio, and
  chart is computed by tested integer math in `lib/calc` and rendered
  from those results. AI text is never parsed for numbers and never
  feeds a visualization.
- **How validation works:** every number in the model's reply must
  match a cited ledger fact exactly, and verdict, recommendation, or
  provenance vocabulary is rejected outright. Anything ungrounded
  discards the whole explanation.
- **Fallback:** if AI is unavailable, disabled, or rejected, the
  calculated results and charts stay fully visible with a short
  neutral message and a manual retry only for transient failures.
  There are no automatic retries.
- **Shape and privacy:** the model must reply in a strict JSON schema
  (observations plus limitations, both citation-bound); an opt-in
  server diagnostic log records timings, outcome categories, and token
  counts only — never figures, prompts, responses, or secrets.

## API endpoints

Same-origin JSON API over the deterministic engine (all POST):

- `/api/affordability` — affordability assessment + provenance
- `/api/true-cost` — true cost breakdown + provenance
- `/api/compare` — two-property comparison + per-side provenance
- `/api/what-if` — scenario recomputation + base/scenario provenance
- `/api/explain` — validated AI explanation + server facts

Requests carry `{ data, provenance? }`; errors are sanitized
`{ ok: false, error: { code, message, issues? } }` with no submitted
values. Details: [ARCHITECTURE.md](ARCHITECTURE.md) implementation
records.

## Technology stack (exact pins in package.json)

Rationale for each choice lives in [ARCHITECTURE.md](ARCHITECTURE.md).

- Next.js 16.4.3 (App Router) + React 19.3.1 + TypeScript 5.9.3 (strict)
- Tailwind CSS 4.3.3 (component library deferred for the MVP)
- Zod 4.6.7 for input and output validation
- Vitest 5.0.5 for unit testing, Playwright 1.64.1 for end-to-end testing
- ESLint 10.14.0 + eslint-config-next 16.4.3
- Meta Model API using Muse Spark 1.3, server-side only
  (see [META_API_NOTES.md](META_API_NOTES.md))

## Running the application

Prerequisites: Node.js 20+ and npm.

```bash
npm install
npm run dev                  # http://localhost:3000
```

If you do not already have a `.env.local` file, create one from the
template (never overwrite an existing `.env.local`):

```bash
cp .env.example .env.local   # then fill in MODEL_API_KEY locally
```

Environment variables (names only — never commit values):

- `MODEL_API_KEY` — Meta Model API key, read server-side at call time.
- `AI_EXPLAIN_ENABLED` — kill switch; production stays disabled unless
  exactly `"true"`.
- `HOMEWISE_AI_DIAGNOSTICS` — opt-in server timing/category log (`"1"`).
- `HOMEWISE_AI_EFFORT` — experimental effort override; only `"minimal"`
  changes the default `"low"`. Not a production recommendation.

Without `MODEL_API_KEY`, calculations and charts work fully; only the
optional AI explanation reports unavailable.

## Running tests

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint .
npm run test        # Vitest unit/API suite
npm run test:e2e    # Playwright (needs a browser-capable terminal)
npm run build       # production build
```

## Security principles

- Never commit, print, or log API keys, credentials, or populated
  environment variables.
- Validate all user inputs and all model outputs before use.
- Follow secure coding practices; add no unnecessary dependencies or
  infrastructure.
- Environment files are git-ignored by default (see `.gitignore`).
- Full risk analysis: [ARCHITECTURE.md](ARCHITECTURE.md) section F.

## Financial accuracy principles

- Financial calculations must be deterministic application logic
  (plain code with tested math), never LLM-generated arithmetic.
- Model output may explain or present numbers; it must never be the thing
  that computes them.
- Important numeric behavior must be covered by tests, and nothing is
  claimed to work until it has actually been tested.

## Product limitations

- Estimates and assumptions are labeled, not independently verified;
  upfront cash is this app's estimate, not a lender's cash-to-close.
- No mortgage-approval predictions, property rankings, or financial
  advice — the app presents figures neutrally for education only.
- AI explanations are optional, validated for figure grounding but not
  guaranteed semantically complete; failures keep the calculated view.
- Session data is memory-only: refresh or close the tab clears it.
- Same-origin MVP: no accounts, persistence, or rate limiting — abuse
  protection must be revisited before any public deployment.
