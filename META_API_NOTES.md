# Meta Model API — Integration Notes

How HomeWise AI calls Meta Muse Spark, and what was verified along the
way. No credentials live in this file; the key is configured per
[README.md](README.md) and read server-side only.

## Integration (as built)

- Model: `muse-spark-1.3`, the standard API variant. Contributor
  variants are deliberately never selected.
- Protocol: **Responses API** (`POST https://api.meta.ai/v1/responses`),
  single-turn stateless input (developer instructions + fact-ledger
  user block), no tools, no history, no files.
- Authentication: Bearer [REDACTED] from the server-only `MODEL_API_KEY`
  environment variable, read at call time. The key never reaches the
  browser, logs, errors, or the repository.
- Reasoning effort `low` by default. `minimal` exists only behind the
  server-only `HOMEWISE_AI_EFFORT` experiment flag: it was tested,
  produced validation failures, and was not promoted. `low` is the
  safer default, not a guarantee of successful explanations.
- Structured output: `text.format` JSON Schema (`homewise_explanation`,
  strict) with observations + limitations; the server re-validates
  everything with Zod regardless. Requests set `store: false` and cap
  output at 8,000 tokens.
- Client (`lib/ai/metaClient.ts`): 60-second timeout, no automatic
  retries (a 429 delay is surfaced, never acted on; UI retries are
  manual and allowlisted to transient failures), usage counters
  extracted when present. Failures carry stable kinds — never provider
  bodies, prompts, figures, or credentials.
- Facts ledger (`lib/ai/facts.ts`): every figure the model may
  reference is minted server-side from the app's own deterministic
  recomputation, with exact integer numerics, display strings, and
  provenance kinds.
- Verification (`lib/ai/validateExplanation.ts`): citations must
  resolve to the server ledger, every number must match a cited fact
  exactly (integer-exact; directional difference facts also accept the
  absolute magnitude phrased with a direction word), and verdict,
  recommendation, provenance, or multiplier vocabulary rejects the
  whole reply.
- Route (`POST /api/explain`): recomputes figures from inputs (never
  trusts client results), maps every AI-side failure to one sanitized
  503, and emits opt-in diagnostics (`provider`, `model`, `api`,
  workflow, outcome, stage timings, token counts — never figures or
  secrets) when `HOMEWISE_AI_DIAGNOSTICS=1`.

## Early research notes (historical)

Recorded during Phase 3 scaffold verification from the official Meta
documentation at <https://dev.meta.ai/docs> (overview, quickstart, and
models pages). No keys were created and no calls were made at that
time. These notes informed the design; the section above describes
what actually shipped.

- Base URL `https://api.meta.ai/v1`, with `/responses` and `/models`
  endpoints documented under it.
- Muse Spark model IDs listed: `muse-spark-1.1`, `muse-spark-1.2`,
  `muse-spark-1.3`, plus `-contributor` variants of 1.2 and 1.3.
- Three protocol options documented (Responses, Chat Completions,
  Messages) with a "Choosing an API" guide; Responses was selected at
  implementation time.
- Dedicated capability docs existed for tool calling and structured
  output. Structured output shipped; tool calling was superseded by
  the narrower fact-ledger design (see ARCHITECTURE.md §E).
- No SDK was adopted: the client is hand-rolled `fetch`, deliberately
  dependency-free per ground rule 9.

## Still open (not verified)

- Rate limits, pricing, and the full error-code taxonomy.
- Whether an official TypeScript SDK exists.

## Standing constraints (from PROJECT_RULES.md and ARCHITECTURE.md)

- Server-side calls only; the key never reaches the browser, logs,
  errors, or the repository.
- Minimum-necessary figures sent per request; no names or identifiers.
- Model output validated against a strict schema; failures degrade to
  the calc-only view.
