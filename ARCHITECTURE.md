# HomeWise AI — Architecture

## 1. System overview

HomeWise AI is a Next.js App Router application with a strict separation between **financial computation** and **AI explanation**. Its three shipped calculation workflows—Affordability, Property Costs, and Compare Properties—remain useful without an AI key or a successful provider response.

The architecture is designed around a simple trust boundary:

- **The application** validates inputs, calculates numbers, formats charts, and stores session state.
- **Meta Muse Spark 1.3** optionally explains a server-generated collection of known financial facts.
- **The application again** validates the generated text before displaying it.

The model has no tool-calling privileges and does not execute commands or control the calculation engine.

## 2. System flow

```text
Browser (Next.js client views)
    │
    ├── User enters financial or property figures
    │
    ├── POST /api/affordability
    ├── POST /api/true-cost
    └── POST /api/compare
              │
              ▼
       Input validation (Zod)
              │
              ▼
       Deterministic calculation engines
              │
              ▼
       Verified result + provenance
              │
              ├── Main result cards and charts
              ├── Session-scoped dashboard summaries
              └── Calculated Financial Insights visuals

User explicitly clicks Generate insights
              │
              ▼
         POST /api/explain
              │
              ├── Validate request and recompute financial results
              ├── Build fact ledger and prompt
              ├── Call Meta Muse Spark 1.3 through /v1/responses
              ├── Parse strict structured response
              └── Validate cited facts, amounts, and language
                        │
                  ┌─────┴─────┐
                  ▼           ▼
               Accepted     Rejected / unavailable
                  │           │
             Show text +   Show safe status;
             evidence      retain calculated charts
```

The browser requests the application's `/api/explain` route; the Meta API call occurs on the server. Browser developer tools will therefore show the application endpoint, while optional server diagnostics can identify the actual Meta provider call.

## 3. Application structure

| Area | Responsibility | Representative paths |
| --- | --- | --- |
| Pages | Dashboard and three user-facing workflows | `app/`, `app/affordability/`, `app/property-costs/`, `app/compare/` |
| Calculation routes | Validate inputs and return deterministic results | `app/api/affordability/`, `app/api/true-cost/`, `app/api/compare/` |
| Explanation route | Build facts, invoke Meta, validate the reply | `app/api/explain/route.ts` |
| Calculation engine | Mortgage, affordability, property cost, comparison, and deferred What-If computations | `lib/calc/` |
| Contracts | Input schemas and API boundary validation | `lib/validation/`, `lib/api/` |
| Meta integration | Client, prompts, facts, validator, diagnostics | `lib/ai/` |
| User interface | Forms, result cards, insights and visualization | `components/` |
| Session and formatting | Temporary workflow state, currency and provenance formatting | `lib/session/`, `lib/format/` |
| Tests | Pure-function, API and end-to-end coverage | `tests/`, `e2e/` |

This table describes responsibilities rather than promising a file with every possible example name. Refer to the repository tree for the exact module list.

## 4. Deterministic financial engine

### 4.1 Monetary representation

Amounts are parsed and represented in integer cents for core monetary calculations. This avoids making user-facing currency totals depend directly on imprecise binary floating-point formatting. Rates, ratios, and loan-term inputs are validated and converted using explicit domain rules.

### 4.2 Affordability

The engine uses entered take-home income, proposed housing costs, debts, other expenses, and savings to derive:

- Total monthly obligations.
- Monthly income remaining after those obligations.
- Housing expense share of take-home income.
- Total obligations share of take-home income.
- Months of obligations covered by available savings, where applicable.

No universal approval threshold or housing recommendation is inferred from these quantities. Zero and negative values are displayed with appropriate not-applicable or shortfall handling.

### 4.3 Property Costs

The property-cost engine calculates principal and interest from the loan amount, rate, and term, then incorporates the provided monthly or annual cost inputs as appropriate. Outputs distinguish the **recurring monthly total**, the **annualized estimate**, and **estimated upfront cash**.

Property taxes, insurance, HOA fees, maintenance, PMI and additional recurring costs remain separate categories. The optional PMI field is not silently guessed. The editable maintenance reserve starting assumption is not represented as an independently measured property expense.

Upfront cash is an estimate based on included down payment and closing-cost figures—not lender-confirmed cash to close.

### 4.4 Compare Properties

Each property's costs are calculated independently using the same engine. Comparison data contains differences between the two sets of results; the presentation identifies whether A costs more, B costs more, or both are equal.

Internal signed differences must not leak into confusing user-facing phrases. The interface can show a positive difference magnitude alongside an explicit direction, while detailed calculations preserve the underlying comparison convention.

### 4.5 Deferred What-If engine

The deterministic What-If engine and `POST /api/what-if` route are implemented and tested. **There is no shipped What-If user interface** in this release. The exposed product experience remains focused on the three completed workflows.

## 5. Validation and provenance

### Input validation

Zod schemas establish the accepted input shapes and protect HTTP boundaries. Blank, invalid or out-of-range user entries produce controlled validation errors rather than unchecked arithmetic. Financial results are recomputed from the supplied inputs.

### Provenance

Where applicable, user-facing figures are labeled as:

- **User-provided:** entered by the user.
- **Estimate:** a value designated as estimated rather than confirmed.
- **Assumption:** an editable starting point or modeling choice.
- **Calculated:** derived by the financial engine.

Supporting figures and detailed breakdowns allow users to inspect where displayed totals come from. Provenance labels do **not** mean HomeWise independently verified the underlying real-world amounts.

## 6. Meta explanation boundary

The explanation route uses the same deterministic engines as the calculation endpoints and builds a restricted **fact ledger** from the calculated result. The prompt instructs the model to produce short observations and a limitation statement grounded in cited fact IDs.

The implementation includes:

- `lib/ai/facts.ts` — server-generated facts and provenance.
- `lib/ai/prompts.ts` — structured explanation instructions and fact presentation.
- `lib/ai/metaClient.ts` — server-side Responses API request and provider failure handling.
- `lib/ai/validateExplanation.ts` — response constraints and numerical consistency checks.
- `lib/ai/diagnostics.ts` — optional allowlisted operational logging.

The client sends **one provider request per explicit Generate insights action**. `store: false`, a strict JSON schema, a controlled token budget, and a request timeout are used in the server integration. There are no automatic provider retries.

### Explanation acceptance

An accepted reply must satisfy the structured shape and the application's validation rules, including cited known fact IDs and numerical matching. Unsupported numbers, prohibited decision language, malformed output, incomplete provider results or other failures produce a safe unavailable response rather than an unverified explanation.

**Important boundary:** numerical and lexical checks do not amount to full semantic verification of every sentence. Model responses can vary; the deterministic results remain authoritative.

### Explanation states

1. **Not requested:** calculated visuals are shown with an optional Generate insights control.
2. **Loading:** calculated visuals stay visible while the provider request runs.
3. **Success:** validated observations, supporting figures, provenance and limitations are added.
4. **Failure:** calculated visuals remain available; the user sees a neutral error status and an appropriate manual retry option only when allowed.

The AI is optional and never blocks calculation results or the dashboard.

## 7. Data lifecycle and privacy

- Financial workflow state is held in the browser session and is not an account record. A refresh clears the workflow data.
- Appearance-theme preference may persist independently of financial inputs.
- The browser does not receive the Meta API key.
- Meta requests are sent only after the user explicitly requests an explanation.
- The request disclosure identifies that relevant entered information and calculated values are sent to Meta.
- Opt-in diagnostics record allowlisted identifiers, timing, outcomes, and token counts rather than raw amounts, prompts, model text or credentials.

The absence of an account database is not a promise that a provider has no processing obligations; users should understand that optional AI requests transmit information to an external model service.

## 8. Accessibility and interface choices

- Main calculations and Financial Insights are presented as distinct sections.
- Collapsible detailed breakdowns and supporting figures reduce visual clutter while preserving evidence.
- Results use labeled cards and charts; chart data is also described textually.
- Compare Properties handles equal-cost and zero-total cases without declaring a winner.
- Navigation and disclosures support keyboard access.
- The layout adapts to narrow screens, with a mobile menu and three appearance themes.

## 9. Testing strategy

| Test layer | Purpose |
| --- | --- |
| Calculation unit tests | Known-answer arithmetic, boundaries, zero cases and signed differences |
| Validation and formatting tests | Parsing, contracts, percentage/currency presentation and provenance |
| AI client and prompt tests | Request construction, token-budget/timeout behavior, structured output, and safe failures |
| Explanation validator/API tests | Fact matching, citation constraints, failure mapping, one-call behavior and diagnostics |
| Playwright E2E | Complete forms, result cards, themes, mobile layouts, session state, and optional AI states |
| Manual live smoke test | Real Meta integration and explanation readability; separate from mocked E2E responses |

Run the documented commands from [README.md](README.md). Automated provider tests use mocked responses so normal test runs do not incur live Meta model calls.

## 10. Design decisions and tradeoffs

**Deterministic code instead of AI arithmetic.** Reproducibility and explainability take priority over asking a language model to calculate totals.

**Facts ledger instead of autonomous tool calling.** Earlier design exploration included a constrained tool-calling agent. The shipped implementation is narrower: a stateless, single-turn explanation request over server-generated facts. No filesystem, shell, browsing, or arbitrary network tools are exposed to the model.

**Strict validation instead of seamless but unchecked output.** An optional explanation may be unavailable when the provider fails or the response does not pass checks. The financial results are never discarded because of that failure.

**Session-scoped instead of persisted finance profiles.** This reduces onboarding and storage complexity for the hackathon MVP. It does not provide cross-device history.

**Three complete workflows instead of a partially implemented fourth.** What-If calculations exist behind an API, but the interactive What-If experience remains deferred.

## 11. Known limitations

- Results depend on user-entered amounts and assumptions.
- Mortgage and property ownership costs in the real world may include expenses the user has not entered.
- Estimated upfront cash is not lender-confirmed cash to close.
- Model explanations can be slow or rejected; successful validation does not guarantee perfect prose.
- HomeWise does not issue lending decisions, price forecasts, property rankings, or financial advice.

See [PRODUCT_SPEC.md](PRODUCT_SPEC.md) for functional scope, [META_API_NOTES.md](META_API_NOTES.md) for model behavior, and [PROJECT_RULES.md](PROJECT_RULES.md) for development safeguards.
