# HomeWise AI

> Phase 5 status: deterministic calculation engine (Phase 4) exposed over
> four POST API endpoints with provenance labels and sanitized errors.
> Typecheck, lint, and 118 unit tests verified. Production build and E2E
> still need a non-sandboxed run (`npm run build`, `npm run test:e2e`).
> No UI, no AI integration, no API keys yet.

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

## Initial MVP scope

1. Affordability assessment from take-home income, debts, recurring
   expenses, savings, and proposed housing costs.
2. True cost of ownership calculator: mortgage principal and interest,
   property taxes, homeowners insurance, HOA fees, maintenance
   reserves, and other recurring costs.
3. Side-by-side comparison of two properties.
4. What-if scenarios for down payment, interest rate, taxes,
   insurance, and maintenance.
5. AI-generated explanations and insights grounded in verified
   application calculations — the model never computes figures.

Full requirements, out-of-scope items, and open decisions:
[PRODUCT_SPEC.md](PRODUCT_SPEC.md).

The application distinguishes user-provided values from estimates and
assumptions, and never promises mortgage approval or professional
financial advice.

## API endpoints (Phase 5)

Same-origin JSON API over the deterministic engine (all POST):

- `/api/affordability` — affordability assessment + provenance
- `/api/true-cost` — true cost breakdown + provenance
- `/api/compare` — two-property comparison + per-side provenance
- `/api/what-if` — scenario recomputation + base/scenario provenance

Requests carry `{ data, provenance? }`; errors are sanitized
`{ ok: false, error: { code, message, issues? } }` with no submitted
values. Details: [ARCHITECTURE.md](ARCHITECTURE.md) Phase 5 record.

## Technology stack (installed in Phase 3, exact pins in package.json)

Rationale for each choice lives in [ARCHITECTURE.md](ARCHITECTURE.md).

- Next.js 16.4.3 (App Router) + React 19.3.1 + TypeScript 5.9.3 (strict)
- Tailwind CSS 4.3.3 (component library deferred for the MVP)
- Zod 4.6.7 for input and output validation
- Vitest 5.0.5 for unit testing, Playwright 1.64.1 for end-to-end testing
- ESLint 10.14.0 + eslint-config-next 16.4.3
- Meta Model API using Muse Spark: official docs verified read-only
  (see [META_API_NOTES.md](META_API_NOTES.md)); server-side integration
  lands in Phase 7

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
