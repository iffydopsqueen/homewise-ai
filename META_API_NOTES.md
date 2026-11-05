# HomeWise AI — Meta Model API Integration

## Purpose

HomeWise AI uses **Meta Muse Spark 1.3** to generate optional, plain-language explanations of **already calculated** Affordability, Property Costs, and Compare Properties results.

The integration is intentionally **not** an autonomous agent, a property-search system, or a financial calculator. The financial engines remain the authoritative source of numbers.

## How a request is made

1. The user completes a calculation using the HomeWise interface.
2. The application displays deterministic results and charts immediately.
3. The user explicitly clicks **Generate insights**.
4. `POST /api/explain` validates the request and recomputes the relevant results.
5. The server builds a ledger of allowed financial facts and sends a structured prompt to Meta.
6. The model returns structured observations and a limitation statement.
7. HomeWise validates response structure, citations and numerical claims before displaying it.

There is **one provider request per user activation** and no automatic retry or automatic explanation generation. Invalid model output never replaces the calculated results.

## Current integration configuration

| Setting | Implemented behavior |
| --- | --- |
| Provider | Meta Model API |
| Model | `muse-spark-1.3` |
| Endpoint | `POST /v1/responses` |
| Auth | Server-side bearer token from `MODEL_API_KEY` |
| Default reasoning | `low` |
| Experimental effort override | `HOMEWISE_AI_EFFORT`, allowlisted to `low` or `minimal`; defaults safely to `low` |
| Output token budget | `max_output_tokens: 8000` |
| Request timeout | 60 seconds |
| Persistence control | `store: false` |
| Response shape | Strict JSON schema for observations and limitations |
| Retry policy | No automatic provider retries |
| Trigger | Explicit user action only |

These values describe the current project configuration, not a guaranteed provider response time or success rate.

### Local environment

The calculators work without an API key. To enable optional Meta explanations, use a local `.env.local` file created from `.env.example` **only if one does not already exist**, and set:

```dotenv
MODEL_API_KEY=your_meta_model_api_key
```

In a production deployment, use the server-side `AI_EXPLAIN_ENABLED` setting according to the configuration template. Do not store credentials in browser variables or commit `.env.local`.

For privacy-safe operational diagnostics during development:

```bash
HOMEWISE_AI_DIAGNOSTICS=1 HOMEWISE_AI_EFFORT=low npm run dev
```

The effort override is server-only and experimental; `low` remains the recommended default for the shipped demo.

## Structured output and fact grounding

The server generates facts from the deterministic engine and assigns references to those facts. The model is instructed to explain salient figures in clear American English, distinguish monthly/annual/upfront amounts, and cite the fact IDs relevant to each observation.

The schema limits response length and requires structured observations and limitations. The prompt aims for a few short, readable observations rather than repeating every financial input.

The response validator checks, as applicable:

- Required output structure and field constraints.
- Referenced fact IDs and citation relationships.
- Numeric statements against the known facts.
- Unsupported claims or prohibited language suggesting decisions, approvals or recommendations.

The validator is a **guardrail**, not a proof that every possible natural-language interpretation is correct. A model may produce a grammatically awkward response or a directionally confusing phrase even when all numeric claims match. The deterministic comparison cards and tables remain authoritative.

## Provenance and explanations

Financial Insights distinguishes relevant figure sources:

- **User-provided:** a value entered by the user.
- **Estimate:** a value designated as an estimate.
- **Assumption:** an editable modeling starting point.
- **Calculated:** a result of the financial engine.

The model must not represent an estimated tax, insurance cost, or closing amount as independently verified. Estimated upfront cash is **not** the same as confirmed lender cash to close. Missing PMI or other costs must be disclosed when material to the current calculation.

## Failure and fallback behavior

A provider request can fail because of provider errors, network issues, timeout, incomplete output, malformed JSON, or a validation rejection. Known validation categories from live testing include `number_mismatch` and `banned_language`.

The API returns a safe failure response, and the interface displays a neutral unavailable message. **Calculated charts and amounts remain visible and usable.** Where the client contract permits it, the user can manually try again. There are no automatic repair calls or retries that might silently increase model usage.

A response with HTTP 503 from `/api/explain` does not by itself prove the Meta service is down; HomeWise also uses this safe response when model output fails its validation requirements.

## Reasoning-effort experiments

The project tested `minimal` effort as a latency experiment. It was faster in an initial three-workflow comparison but later produced validation failures on repeat requests. Consequently:

- `low` remains the default and demo configuration.
- `minimal` remains an explicit server-only test option, not a reliability recommendation.
- Lower reasoning effort must not be treated as equivalent quality without validation.
- Reducing the output-token cap merely to force faster responses is not a verified optimization and may increase incomplete output.

The project also improved the prompt to request takeaway-first, concise, grammatically clearer explanations. Prompt changes do not guarantee every generated response will pass validation.

## Diagnostics and privacy

When explicitly enabled, server diagnostics are designed to contain only operational information such as:

- Event name and workflow.
- Provider and model identifiers.
- Success/failure category and safe validator reason.
- Parse, facts, prompt, provider and validation timing.
- Available input, output and reasoning token counters.

Do not log or publish credentials, authorization headers, raw financial inputs, user-entered amounts, full prompts, model text, or reasoning content. Safe example diagnostic **field names** are useful in a demo, but the video must show a genuine live request rather than fabricated output.

In Chrome developer tools the browser request appears as `/api/explain`. The outbound request to Meta occurs on the server, so the terminal diagnostic is the appropriate companion evidence.

## Boundaries and non-goals

- No autonomous multi-agent orchestration or tool calling.
- No external property search, lender integration, or credit-check service.
- No model-generated authoritative calculations.
- No automatic background explanations or retries.
- No persistent user finance profile.
- No claims that the tool predicts mortgage approval or decides which home to buy.

For application architecture see [ARCHITECTURE.md](ARCHITECTURE.md); for the feature scope see [PRODUCT_SPEC.md](PRODUCT_SPEC.md); for a safe live demonstration see [docs/DEMO.md](docs/DEMO.md).
