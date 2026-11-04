# HomeWise AI — Technical Architecture

Living design document for the finished MVP. Sections B–H record the
approved design (with as-built notes where the implementation
narrowed or deferred a plan); the appendices record per-phase
implementation decisions. Product requirements live in
[PRODUCT_SPEC.md](PRODUCT_SPEC.md); engineering ground rules live in
[PROJECT_RULES.md](PROJECT_RULES.md).

A note on verification (ground rule 4): this document recommends
technologies and describes integration patterns, but exact API shapes,
package versions, and configuration options must be verified against
official documentation at implementation time. Anything not yet
verifiable is marked accordingly.

## B. Technology evaluation and recommendations

Each proposed technology is evaluated on its own merits. Inclusion
below is a recommendation with a stated purpose, not an assumption that
it is necessary.

- Next.js (App Router) — RECOMMENDED. Full-stack React framework:
  server components and route handlers keep API keys, the calculation
  engine, and AI orchestration on the server, while the browser gets a
  fast interactive UI. One deployable unit suits a hackathon MVP.
- React — RECOMMENDED. Component model for the forms, results
  dashboards, comparison views, and what-if controls. Ships with
  Next.js; no separate decision.
- TypeScript (strict mode) — RECOMMENDED. Static types catch whole
  classes of money-math mistakes (wrong units, missing fields, mixed-up
  monthly/annual figures) before code runs. Non-negotiable for an app
  whose core value is numeric correctness.
- Tailwind CSS — RECOMMENDED. Utility-first styling keeps the MVP's
  forms and results views consistent with minimal CSS infrastructure
  and no custom design system to maintain.
- Component library — DEFERRED, not recommended for the MVP. The
  interface is forms, tables, and Accordion-free results panels —
  comfortably served by Tailwind plus a small set of custom
  components. Adding a library now would trade dependency weight and
  unverified package assumptions for little gain. Revisit if form
  complexity (custom selects, dialogs, charts) outgrows hand-built
  components; evaluate candidates against official docs at that time.
- Meta Model API using Muse Spark — RECOMMENDED with a verification
  gate. Powers capability 3.5 (grounded explanations) only. All calls
  are server-side; the model never computes figures and never touches
  the browser. The exact API shape, authentication method, and
  tool-calling mechanism must be verified against official Meta
  documentation before any integration code is written (see Phase 7
  in the roadmap).
- Zod — RECOMMENDED. Runtime schema validation for user inputs, tool
  arguments, and — critically — model outputs. TypeScript types vanish
  at runtime; Zod is what actually rejects a malformed value.
- Vitest — RECOMMENDED. Fast unit-test runner for the deterministic
  calculation engine and validation schemas, where most correctness
  risk lives.
- Playwright — RECOMMENDED. End-to-end tests for the primary user
  journey in a real browser, including the AI-unavailable degraded
  mode. Catches wiring mistakes unit tests cannot see.

Package versions for all of the above are pinned and verified at
install time, not assumed here.

## C. Application design

### C.1 Frontend responsibilities

- Render input forms (finances, property costs, what-if controls) with
  immediate client-side validation feedback.
- Render results: affordability snapshot, true-cost breakdowns,
  comparison deltas, and what-if deltas — with provenance labels
  (user-provided / estimate / assumption) and the persistent
  educational-use disclaimer.
- Render AI explanations in a dedicated panel. Displayed numbers are
  bound to verified calculation results, never parsed out of model
  text. Model text is rendered as plain text (escaped), never as raw
  HTML.
- Hold no secrets, make no direct model API calls, and perform no
  authoritative math: any client-side arithmetic is display formatting
  only.

### C.2 Backend/API responsibilities (Next.js server)

- Validate every incoming request with Zod; reject malformed input
  with user-friendly errors.
- Execute the deterministic calculation engine and return structured
  results.
- Orchestrate AI requests: build a grounded prompt from verified
  calculation results, call the model server-side with timeouts,
  validate the response against a strict schema, and return
  `{ calculations, explanation }`.
- Guarantee the degraded mode: calculation results are returned even
  when AI fails, times out, or returns invalid output.

### C.3 Deterministic financial calculation engine

- Pure functions: same inputs always produce the same outputs. No I/O,
  no network calls, no randomness, no clocks, no LLM involvement.
- Single internal money discipline (recommended: integer cents
  throughout, formatting to dollars only at display time) with one
  documented rounding rule applied consistently.
- Monthly/annual figures carried as distinct, explicitly named values
  so the two can never be silently mixed.
- Every function declares its required inputs and outputs (see
  section D) and rejects invalid input (negatives where meaningless,
  non-finite numbers, out-of-range values) instead of guessing.
- Fully covered by Vitest unit tests, including every edge case in
  section D, before any UI or AI work depends on it.

### C.4 Meta AI integration

- Server-side only: the browser never sees API keys, prompts, or raw
  model traffic.
- The model receives a bounded context package: the verified
  calculation results, the user's scenario inputs, and strict
  instructions (explain only these numbers; invent nothing; promise no
  approval; give no professional advice).
- Only the minimum necessary figures are sent — aggregates needed for
  the explanation, never names, account identifiers, or anything the
  product does not already display.
- Timeouts and failure handling are mandatory: slow or failed AI calls
  resolve to the calc-only response, never to a hang or a fabricated
  explanation.

### C.5 Approved AI tool-calling architecture

> Design history — not shipped. The approved containment model below
> was superseded by a narrower one: the model makes no tool calls and
> receives only a server-generated fact ledger (see §E and the Phase 7
> record). The function names survive as the server API the route
> calls directly.

The model gets capabilities through a small fixed allowlist of
server-executed tools — plain function calls into the calculation
engine, not shell commands, not database access, not network calls:

- `assessAffordability` — runs the affordability assessment.
- `calculateTrueCost` — runs the true-cost computation for one property.
- `compareProperties` — runs the two-property comparison.
- `runWhatIf` — recomputes a base scenario with overrides.

Interaction flow:

1. The application presents the verified scenario and results to the
   model along with the tool allowlist.
2. The model may request a tool call with arguments (e.g. recompute a
   what-if the user asked about in free text).
3. The application validates the arguments with Zod, executes the
   deterministic function itself, and returns the result to the model.
4. The model composes its explanation citing the returned values.

The model never executes anything directly: it proposes, the
application disposes. The exact tool-calling wire protocol is whatever
the official Meta documentation specifies, verified in Phase 7 —
the architecture above does not depend on its details.

### C.6 Input and output validation

- User input: Zod schemas enforcing types, required fields, finite
  numbers, and sensible ranges (e.g. no negative income, no
  200%-interest rates). Client-side checks give fast feedback;
  server-side checks are the real enforcement.
- Tool arguments: validated with the same schemas before execution.
  (Design history: no tools shipped, so this step has no runtime
  counterpart; the route validates explain-request inputs instead.)
- Model output: validated against a strict explanation schema (plain
  text plus references to result IDs, not free-floating figures).
  Output that fails validation is discarded in favor of the calc-only
  response — never repaired by guessing, never shown raw.

### C.7 Error handling

- Typed server errors map to clear user-facing messages ("Monthly
  income must be a positive number"); stack traces and internals never
  reach the client.
- Error responses and logs never contain API keys, credentials, or
  the user's financial values.
- AI failures (timeout, invalid output, service error) are ordinary,
  expected errors: the user keeps their verified numbers with a notice
  that explanations are temporarily unavailable.

### C.8 Privacy and security boundaries

Three zones with strict rules between them:

1. Browser: user input and rendered results only. No secrets, no keys,
   no direct model access.
2. Application server: validation, calculations, AI orchestration.
   Holds the model API key in server-only environment configuration;
   never sends it to the client or writes it to logs.
3. Model API: receives only the minimum figures needed for an
   explanation; returns only text for a validated schema.

Financial data is session-only in the MVP: held in memory for the
active session, never persisted to a database, never written to logs,
and transmitted only over HTTPS.

## D. Financial calculation design

Design only — no formulas and no code in this phase. Each calculation
below lists its required inputs, outputs, and the edge cases its future
implementation and tests must handle.

### D.1 Monthly mortgage principal and interest

- Inputs: home price, down payment, annual interest rate, loan term.
- Outputs: monthly principal-and-interest payment (zero when there is
  no mortgage).
- Edge cases: 0% interest rate; down payment equal to or exceeding the
  price (no mortgage); 100% financing (zero down); zero or negative
  term (reject); negative rate or price (reject); rounding to cents.

### D.2 Monthly property tax, insurance, and HOA

- Inputs: annual property tax, annual homeowners insurance, monthly
  HOA fee, each tagged with provenance (user-provided or estimate).
- Outputs: monthly cost per component.
- Edge cases: zero tax or HOA (allowed — some properties genuinely
  have none — but surfaced as "confirm this is correct" rather than
  silently accepted); negative values (reject).

### D.3 Monthly maintenance reserve

- Inputs: maintenance basis and rate (exact form per unresolved
  decision 2 in PRODUCT_SPEC.md, e.g. a percentage of home value).
- Outputs: monthly reserve amount, always labeled an assumption.
- Edge cases: zero reserve (allowed but flagged like D.2); basis or
  rate missing (reject or fall back to the documented default —
  behavior to be specified at implementation).

### D.4 Other recurring costs

- Inputs: user-specified monthly amounts as label/amount pairs (labels
  1–60 chars, at most 100 lines).
- Outputs: monthly total of other costs.
- Edge cases: empty list (valid, totals zero); negative entries
  (reject).

### D.5 Total ownership cost and upfront cash

- Inputs: outputs of D.1–D.4 plus down payment and optional
  user-supplied closing costs.
- Outputs: total monthly cost, total annual cost, upfront cash
  required — each component traceable to its source.
- Edge cases: totals must equal the sum of rounded components under
  the single documented rounding rule (no penny drift between the
  breakdown and the total).

### D.6 Affordability assessment

- Inputs: monthly take-home income, monthly debt payments, monthly
  recurring expenses, savings, proposed monthly housing cost.
- Outputs: housing-cost-to-income ratio, total-obligations ratio,
  residual monthly cash after all obligations, and savings cushion —
  raw ratios only, with no thresholds, verdicts, or approvals.
- Edge cases: zero or negative income (cannot assess — reject with a
  clear message, never divide by zero); obligations meeting or
  exceeding income (valid result showing a shortfall, not an error);
  any negative input (reject); proposed cost of zero (valid, shows
  maximum headroom).

### D.7 Two-property comparison

- Inputs: two completed D.5 results with their assumption sets.
- Outputs: side-by-side components and totals plus deltas
  (monthly, annual, upfront).
- Edge cases: both properties required (reject a comparison with a
  missing side); differing assumption sets between sides (flag, per
  PRODUCT_SPEC.md 3.3); identical costs (zero deltas — a valid result).

### D.8 What-if recomputation

- Inputs: a base scenario plus overrides for down payment, interest
  rate, taxes, insurance, and maintenance.
- Outputs: recomputed totals plus deltas against the base scenario.
- Edge cases: an override that removes the mortgage (down payment
  reaching the price — valid, P&I becomes zero and the change is
  surfaced); zero-rate overrides (valid); negative overrides
  (reject); overrides identical to base (zero deltas — valid).

## E. AI agent design

> Design record: this section specifies the approved tool-calling
> containment model. As built, the integration is narrower still —
> the model makes no tool calls at all and receives only a
> server-generated fact ledger (see the Phase 7 roadmap note and
> implementation record). The E.3 verification pipeline below is what
> shipped, applied to the ledger instead of tool results.

### E.1 Role and constraints

Muse Spark acts strictly as an explainer of verified numbers. Its
standing instructions:

- Explain only the figures provided by the application; never compute,
  adjust, or invent any number.
- Never promise mortgage approval or comment on creditworthiness.
- Never give professional financial advice; frame insights as
  educational observations about the user's own numbers.
- Preserve provenance: reflect which inputs were user-provided,
  estimates, or assumptions.
- Use only the approved tools in section C.5; request anything else
  and the request is denied.

### E.2 Capability containment

The model has no filesystem, database, shell, or general network
access — not restricted versions of them, but no such tools at all.
Its only possible action beyond writing explanation text is requesting
one of the four approved calculation tools, whose arguments are
validated and whose execution happens entirely inside the
application's own deterministic code.

### E.3 Independent verification before presenting

Trust flows one way — from the calculation engine to the screen — and
the model sits outside that path:

1. The application executes every tool call itself and validates the
   result; a model-claimed figure the application did not compute is
   not a result and is never displayed as one.
2. The UI binds every displayed number to validated calculation
   results, never to text extracted from the model's response.
3. Model output passes schema validation; as a further check, any
   figure appearing in explanation text that does not match a verified
   result causes the explanation to be discarded in favor of the
   calc-only response.
4. Provenance labels and the educational-use disclaimer are rendered
   by the application unconditionally — the model cannot remove them.

## F. Security and privacy risks

- API key exposure. Risk: model API key leaks via client bundle,
  logs, errors, or the repository. Mitigations: server-only key
  storage, never imported into client code; `.gitignore`d env files;
  no keys in logs, errors, or prompts echoed to the client; a key
  rotation plan is still required before any production use.
- Prompt injection. Risk: user-entered text (other-cost line labels)
  attempts to override the model's instructions. Mitigations: user
  content is always passed as untrusted data, never as instructions
  (user-controlled labels render generically in the model-facing
  ledger); with no tools shipped, an injection can only affect
  explanation wording, which must still pass schema validation,
  banned-language checks, and numeric verification before display.
- Malformed user inputs. Risk: hostile or accidental bad input
  corrupts calculations or crashes the server. Mitigations: Zod
  validation on client (feedback) and server (enforcement); finite,
  ranged numbers only; typed errors with safe messages.
- Malformed model outputs. Risk: the model returns invalid JSON,
  wrong shapes, or invented figures. Mitigations: strict output
  schema; discard-and-degrade to calc-only view on any failure; never
  render unvalidated model content as authoritative.
- Sensitive financial information. Risk: income, debts, and savings
  leak through logs, persistence, or over-sharing with the model API.
  Mitigations: session-only handling with no database in the MVP; no
  financial values in logs; minimum-necessary figures sent to the
  model API; HTTPS-only transport; a user-facing note explaining what
  data leaves the browser and why.
- Excessive API usage. Risk: runaway costs or quota exhaustion from
  repeated AI calls. Mitigations shipped: AI requested only on
  explicit user action (not on every keystroke); no automatic retries;
  60-second timeouts. Server-side rate limiting and response caching
  were considered but remain future work for any public deployment
  (same-origin MVP).
- Dependency vulnerabilities. Risk: compromised or outdated packages.
  Mitigations: minimal dependency set (see the deferred component
  library); pinned versions with a lockfile; `npm audit` (or the
  registry's equivalent) reviewed at scaffold time and before any
  release.
- Unsafe rendering of model-generated content. Risk: script injection
  via model output rendered as HTML. Mitigations: model text rendered
  as escaped plain text; no `dangerouslySetInnerHTML` (or equivalent)
  on any model-derived string; if rich formatting is ever wanted, it
  goes through a vetted sanitizer — not in the MVP.

## G. Project structure

As built (the scaffold followed this proposal; `public/` was never
needed and does not exist; `app/` holds the dashboard plus
affordability, property-costs, and compare routes with no `results/`
directory).

```text
homewise-ai/
├── README.md              # Product overview + links (exists)
├── PRODUCT_SPEC.md        # Product requirements (exists)
├── ARCHITECTURE.md        # This document (exists)
├── PROJECT_RULES.md       # Engineering ground rules (exists)
├── app/                   # Next.js routes: pages + API route handlers
│   ├── page.tsx           # Entry: finance + property input flow
│   ├── results/           # Results, comparison, what-if views
│   └── api/               # Server endpoints: calculate, explain
├── components/            # React UI: forms, breakdown tables, labels
├── lib/
│   ├── calc/              # Deterministic financial engine (pure functions)
│   ├── validation/        # Zod schemas: inputs, API envelopes, model outputs
│   ├── ai/                # Server-only model client + output validation
│   └── format/            # Display formatting (cents→dollars, percents)
├── tests/                 # Vitest unit tests for calc + validation
├── e2e/                   # Playwright end-to-end journey tests
└── public/                # Static assets
```

Responsibility rule: `lib/calc` never imports from `lib/ai` (math must
not depend on the model); components never import from `lib/ai`
(the browser must not touch model code); API routes orchestrate the
rest. As built, the single exception is one `import type` of the
`Fact` interface in `ExplainSection.tsx`, which is erased at compile
time — no runtime model code reaches the browser (verified by import
audit at release).

## H. Development roadmap

Small sequential phases. Per PROJECT_RULES.md, one phase per task with
its own completion check — never multiple phases at once.

### Phase 3 — Scaffold and verify

Set up Next.js + TypeScript (strict) + Tailwind + Zod + Vitest +
Playwright with pinned versions; confirm the proposed structure;
read the official Meta API documentation to verify the integration
shape (read-only — no keys, no integration code).

Completion criteria: clean install from lockfile; typecheck, lint,
unit, and e2e sample tests all pass; Meta docs findings recorded;
README stack section updated to installed versions.

### Phase 4 — Calculation engine + unit tests

Implement every calculation in section D as pure functions with Zod
input schemas; resolve or record decisions on rounding, PMI, closing
costs, loan terms, and maintenance defaults.

Completion criteria: all D.1–D.8 functions implemented; every listed
edge case has a passing Vitest test; no engine code imports AI, I/O,
or randomness.

### Phase 5 — API layer + validation

Build the server endpoints that validate requests, run the engine,
and return structured results with provenance labels; error handling
per C.7.

Completion criteria: valid requests return correct results; invalid
requests are rejected with safe messages; no endpoint requires AI to
respond.

### Phase 6 — User interface

Build the input flow, results views, comparison, and what-if controls
per the section-5 journey in PRODUCT_SPEC.md, including provenance
labels and the persistent disclaimer.

Completion criteria: the full journey works end to end with AI
disabled; every displayed number traces to a validated result.

> As built: the What-If controls were deferred (engine and API done,
> no UI); the Affordability, Property Costs, and Compare journeys meet
> the criteria above.

### Phase 7 — AI integration

Implement the server-only model client, the four-tool allowlist, and
the section E.3 verification pipeline against the verified Meta API
shape; wire the explanation panel.

> As built (see the Phase 7 record below): tool calling was replaced
> with a simpler single-turn stateless call over a server-generated
> fact ledger — narrower than the planned allowlist, with the same
> containment guarantees and no filesystem, shell, or network tools
> exposed to the model.

Completion criteria: explanations cite only verified figures;
malformed or failed AI responses degrade to the calc-only view; no
key material reachable from the client; prompt-injection and
over-sharing checks reviewed.

### Phase 8 — E2E hardening and release readiness

Playwright coverage for the full journey including degraded mode;
section F security review; dependency audit; documentation accuracy
pass.

Completion criteria: e2e suite green; every section F mitigation in
place or recorded as a known limitation; README, spec, and
architecture docs match the built product.

## Appendix: Phase 4 implementation decisions

Recorded when the engine was built. The design sections above are
unchanged; this appendix captures what was decided where they allowed
room.

- Rounding primitives (`lib/calc/money.ts`): `divRoundHalfUp` and
  `divFloor` validate a non-negative-safe-integer numerator and a
  positive-safe-integer denominator, compute with BigInt, and reject
  quotients above `MAX_SAFE_INTEGER` — no float division is involved,
  so half-cent boundaries cannot flip. `roundHalfUpPositive` documents
  the positive-value rule (`floor(x + 0.5)`) for the single float step.
- P&I (`lib/calc/mortgage.ts`): the documented floating-point
  exception. Zero rate uses the exact integer path; otherwise IEEE-754
  doubles with R2. Correctness rests on two unadjusted known-answer
  tests ($300k@6%/30yr = $1,798.65; $200k@5%/30yr = $1,073.64); the
  amortization simulation is a test-only sanity check with a derived
  worst-case tolerance, not a source of truth.
- Money cap: `MAX_CENTS` = 1,000,000,000 cents = $10,000,000 per
  figure. Largest engine intermediate (3e13, the affordability
  `total obligations x 10,000` numerator at 3e9 x 1e4) sits ~300x below
  2^53, so every integer step is exact. `.max()` is the load-bearing
  control (`.int()` alone cannot guarantee safe integers).
- Money brands use Zod's own `$brand` shape (type-only), since Zod v4
  brand outputs are not assignable to v3-style `__brand` declarations.
- Closing costs: optional with no default; absent values yield
  `closingCostsProvided: false` plus a `closing-costs-not-provided`
  warning, never a silent zero. Upfront cash is named
  `estimatedUpfrontCashCents` and documented as not a lender
  cash-to-close figure.
- PMI: dedicated optional `pmiMonthlyCents`, always echoed on its own
  labeled line with a `pmiProvided` flag; no estimation formula. It is
  not a what-if override field (D.8 lists five fields; PMI carries).
- Affordability: take-home basis with explicit input definitions; raw
  ratios only — no thresholds, verdicts, or approvals in the engine.
  Cushion is floored tenths of months, `null` on zero burn.
- Comparison: itemized lines match on normalized labels (trim,
  collapse whitespace, lowercase; originals kept for display),
  duplicate labels aggregate per side before comparing, and unmatched
  keys report as `added`/`removed` rather than differencing unrelated
  entries.
- Validation bounds: `termMonths` 12-480, annual rate 0-100% in
  milli-percent, maintenance 0-100% in basis points, other-cost labels
  1-60 chars with at most 100 lines, all schemas `.strict()` with no
  coercion. Zero tax/HOA/maintenance are allowed with confirm
  warnings; zero insurance is allowed silently (spec asymmetry,
  deliberate).
- Assumption sets are opaque string ids compared for equality;
  meaningful ids are a Phase 6 UI concern.

## Appendix: Phase 5 implementation record

- Endpoints (all POST, same-origin): `/api/affordability` -> F3,
  `/api/true-cost` -> F2, `/api/compare` -> F4, `/api/what-if` -> F5.
  Thin wrappers only: no arithmetic outside `lib/calc`.
- Request/response conventions: `{ data, provenance? }` in (compare
  nests `{ a, b }`; what-if takes `{ base, overrides }` with no client
  provenance on overrides); `{ ok: true, data }` out, where data holds
  `{ result, provenance }`, `{ result, provenanceA, provenanceB }`, or
  `{ result, baseProvenance, scenarioProvenance }` respectively.
- Provenance behavior: per-field allowed labels enforced server-side
  (maintenance always `assumption`; tax/insurance/HOA `user-provided`
  or `estimate`; all other figures `user-provided`; closing `estimate`
  by default with explicit `user-provided` preserved, no entry when
  omitted); what-if overrides resolve to `assumption`. Labels record
  origin declarations and are never independently verified.
- Error handling: safe JSON parse (`invalid_json`), strict envelope
  validation (`validation_error` with path/code/generic-message issues;
  submitted values never echoed, unrecognized key names not reflected),
  explicit 405s for GET/PUT/PATCH/DELETE, generic 500s. No logging of
  bodies or values anywhere in `app/` or `lib/` (grep-verified).
- Method contract, verified against the Next.js 16.4.3 docs and the
  vendored route-dispatch source (live HEAD/OPTIONS check still pending
  a non-sandboxed run): POST runs the handler; GET/PUT/PATCH/DELETE
  return our 405 JSON; HEAD falls back to the GET export, so 405;
  OPTIONS is framework-handled as 204 with an `Allow` header;
  unrecognized methods get a framework 400.
- Security notes: no auth, persistence, or rate limiting per approved
  scope (same-origin MVP); no new dependencies; routes import only
  `lib/calc`, `lib/validation`, and `lib/api`. API abuse protection
  (rate limiting, auth model, body-size review) must be revisited
  before any public deployment.

## Appendix: Phase 6 implementation record (UI)

- Routes: `/` dashboard, `/affordability`, `/property-costs`,
  `/compare`. Memory-only session store: drafts and results survive
  client navigation, clear on refresh; editing inputs retires stale
  results; Start over clears per workflow.
- No browser arithmetic: forms parse/validate display strings and POST
  to the Phase 5 endpoints; every rendered figure comes from the API
  response. Provenance badges echo server labels; calculated rows add
  "Based on …" contributor subtext.
- Responsive: mobile accordion patterns for compare inputs and result
  sections (CSS-driven, no hydration tricks); desktop layouts
  unchanged. Light/Natural/Dark themes via token re-pointing with a
  hydration-safe provider. Standard disclaimers on every result view.

## Appendix: Phase 7 implementation record (AI explanations)

- `POST /api/explain` validates engine inputs, recomputes with
  `lib/calc`, builds a server fact ledger (`lib/ai/facts.ts`), calls
  Muse Spark 1.3 via the Responses API (`low` effort, strict JSON
  Schema), and validates the reply (`lib/ai/validateExplanation.ts`).
  The request carries inputs only — never results — and What-If stays
  rejected (no UI).
- Validator: Zod shape, citation resolution, integer-exact number
  grounding per cited fact (directional difference facts also accept
  the absolute magnitude phrased with a direction word), and rejection
  of verdict/recommendation/provenance/multiplier language. Any failure
  discards the whole explanation; the client never renders unvalidated
  narrative or parses it for numbers.
- `lib/ai/metaClient.ts`: 60 s timeout, no automatic retries, key from
  server env at call time, `AI_EXPLAIN_ENABLED` kill switch (production
  fails closed). UI retry allowlist is `ai_unavailable` + `network_error`
  only, always manual. Opt-in `HOMEWISE_AI_DIAGNOSTICS=1` logging carries
  timings, categories, and token counts only.
- UI (`ExplainSection` + `InsightVisuals`): deterministic charts render
  from the verified result in every AI state; the explanation is an
  explicit opt-in with disclosure, truthful per-state model attribution,
  and a neutral failure message that keeps the calculated view.

## Appendix: Phase 8 implementation record (hardening)

- Test gates: `typecheck`, `lint`, Vitest unit/API suite, Playwright
  E2E (provider always stubbed via route interception — no live Meta
  calls in tests), and production build.
- Coverage includes known-answer engine vectors, boundary and
  invalid-input rejection, provenance matrices, sanitized-error
  sentinel checks, validator accept/reject fixtures (including signed
  differences), per-workflow journeys, responsive/overflow checks at
  320/390px, theme rendering, keyboard/focus behavior, and AI
  idle/loading/failed/ready states in all three workflows.
- Known limitations: validator grounds figures, not qualitative framing
  (documented M2); no auth/persistence/rate limiting (same-origin MVP);
  What-If has engine + API but no UI.
