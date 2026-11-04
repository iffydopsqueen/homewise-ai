# HomeWise AI

**Understand the full cost of a home before you buy.**

HomeWise AI helps first-time homebuyers assess monthly affordability,
estimate the ongoing and upfront costs of homeownership, and compare
two properties side by side.

It combines deterministic financial calculations with optional
explanations powered by Meta Muse Spark 1.3, helping buyers understand
financial information without relying on AI to perform the calculations.

Built for the Meta Global AI Developer Hackathon.

## Why HomeWise AI?

A mortgage payment does not represent the full cost of owning a home.
Property taxes, homeowners insurance, HOA fees, maintenance reserves,
and other recurring costs — plus the upfront cash needed at purchase —
can reshape a household budget long after the listing price stops
mattering.

Traditional calculators show numbers without explanation, while
general-purpose AI chatbots explain fluently but can invent or
miscalculate figures. HomeWise AI pairs tested calculation code with
AI explanations grounded exclusively in those verified figures, so
buyers see both the numbers and what they mean.

## Features

| Area | What you can do |
|---|---|
| Affordability | See how a proposed housing payment fits against take-home income, debts, expenses, and savings. |
| Property Costs | Break down one property's monthly, annual, and upfront costs across every major category. |
| Compare Properties | Compare two properties side by side with neutral, per-component differences. |
| Financial Insights | Read deterministic charts plus optional AI explanations with supporting evidence. |
| Dashboard | Track each workflow's status and revisit completed results. |
| Layout & themes | Work on mobile or desktop in Light, Natural, or Dark appearance. |

Every figure carries a source label — user-provided, estimate,
assumption, or calculated — and every result view includes an
educational-use disclaimer.

## How Meta AI works

Each explanation follows the same verified pipeline:

User financial inputs
→ deterministic financial calculations
→ server-generated facts ledger
→ Meta Muse Spark 1.3 Responses API
→ structured AI explanation
→ server-side numerical and citation validation
→ readable observations, supporting evidence, and limitations.

Key properties of this design:

- Meta AI interprets calculated figures; deterministic code performs
  all financial arithmetic.
- Explanation requests are user-initiated — nothing is requested
  automatically, and there are no automatic retries.
- The model does not independently verify user-entered data.
- The model does not recommend a home or approve a mortgage.
- Every number in a reply must match a cited ledger fact exactly, or
  the whole explanation is safely rejected.
- Calculations and visualizations remain fully usable when Meta is
  unavailable, with a short neutral message and manual retry only for
  transient failures.

Validation grounds figures and citations; like any fixed check, it
cannot prove every qualitative sentence true, so explanations stay
short, cited, and beside their evidence.

## Technology

- Next.js App Router + React + TypeScript (strict)
- Tailwind CSS
- Zod for input, API, and model-output validation
- Meta Muse Spark 1.3 via the Responses API (server-side only)
- Vitest for unit/API tests, Playwright for end-to-end tests
- ESLint

Exact dependency versions are pinned in `package.json`.

## Getting started

Prerequisites: Node.js 20.9 or newer (per the Next.js 16 engine
requirement) and npm.

```bash
git clone https://github.com/iffydopsqueen/homewise-ai.git
cd homewise-ai
npm install
npm run dev
```

Open http://localhost:3000. The calculators, charts, dashboard, and
comparison views all work without a Meta API key.

To enable optional AI explanations, create a `.env.local` file from
the template (never overwrite an existing `.env.local`) and add your
key locally:

```bash
cp .env.example .env.local   # then fill in MODEL_API_KEY
```

Environment variables (names only — values stay local):

- `MODEL_API_KEY` — Meta Model API key, read server-side at call time.
- `AI_EXPLAIN_ENABLED` — kill switch; production stays disabled unless
  exactly `"true"`.
- `HOMEWISE_AI_DIAGNOSTICS` — opt-in server timing/category log (`"1"`).
- `HOMEWISE_AI_EFFORT` — experimental effort override; only `"minimal"`
  changes the default `"low"`. Not a production recommendation.

## Running tests

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint .
npm run test        # Vitest unit/API suite
npm run test:e2e    # Playwright journeys (stubbed provider, no live calls)
npm run build       # production build
```

## Project documentation

- [PRODUCT_SPEC.md](PRODUCT_SPEC.md) — product requirements and MVP scope.
- [ARCHITECTURE.md](ARCHITECTURE.md) — technical design and implementation records.
- [META_API_NOTES.md](META_API_NOTES.md) — Meta integration details and verification notes.
- [PROJECT_RULES.md](PROJECT_RULES.md) — engineering ground rules and safety baseline.
- [docs/DEMO.md](docs/DEMO.md) — three-minute demo recording guide.

## Scope and limitations

- Educational estimates only — not lending or credit approval, and not
  personalized financial advice.
- The app never ranks properties or recommends a purchase.
- User-provided values are not independently verified; estimates
  depend on the assumptions supplied.
- Upfront cash is this app's estimate, not a lender-confirmed
  cash-to-close figure; missing costs such as PMI affect estimates.
- No accounts or persistent financial records in the MVP; session data
  clears on refresh.
- The What-If user interface is intentionally deferred (its engine and
  API are implemented and tested).
- AI explanation availability may vary; calculations never depend on it.
