# Meta Model API — Research Notes (Phase 3, read-only)

Recorded during Phase 3 scaffold verification. No keys were created, no
integration code was written, and no API calls were made. Phase 7 must
re-verify request/response shapes against the live docs before coding.

Source: official Meta documentation at <https://dev.meta.ai/docs>
(overview, quickstart, and models pages fetched and confirmed).

## Verified facts

- Base URL: `https://api.meta.ai/v1` (docs show `/responses` and
  `/models` endpoints under it).
- Authentication: Bearer token from a Model API key (`MODEL_API_KEY`).
- Muse Spark model IDs listed: `muse-spark-1.1`, `muse-spark-1.2`,
  `muse-spark-1.3`, plus `-contributor` variants of 1.2 and 1.3.
  (Other models exist; these are the Spark ones relevant to us.)
- Three protocol options documented: Responses API, Chat Completions
  API, Messages API, with a "Choosing an API" guide. Protocol choice
  is deferred to Phase 7.
- Dedicated capability docs exist for tool calling and structured
  output — the two mechanisms our approved-tool architecture
  (ARCHITECTURE.md sections C.5 and E) depends on.
- SDK/library docs exist; no SDK chosen yet. Ground rule 9 applies:
  prefer the smallest client that covers our needs.

## Integration record (Phase 7, as built)

- Protocol: **Responses API** (`POST https://api.meta.ai/v1/responses`),
  single-turn stateless input (developer instructions + fact-ledger user
  block), no tools, no history, no files.
- Model: `muse-spark-1.3` (standard variant; Contributor variants are
  deliberately never selected). Reasoning effort `low`; `minimal` exists
  only behind the `HOMEWISE_AI_EFFORT` experiment flag after it produced
  validation failures in testing.
- Structured output: `text.format` JSON Schema (`homewise_explanation`,
  strict) with observations + limitations; the server re-validates
  everything with Zod regardless. Requests set `store: false` and cap
  output at 8,000 tokens.
- Client (`lib/ai/metaClient.ts`): 60 s timeout, no automatic retries
  (a 429 delay is surfaced, never acted on; UI retries are manual and
  allowlisted), Bearer key read server-side at call time, usage counters
  extracted when present. Failures carry stable kinds — never provider
  bodies, prompts, figures, or credentials.
- Verification (`lib/ai/validateExplanation.ts`): citations must resolve
  to the server ledger, every number must match a cited fact exactly
  (integer-exact; directional difference facts also accept the absolute
  magnitude with a direction word), and verdict/recommendation/provenance
  vocabulary rejects the whole reply.
- Route (`POST /api/explain`): recomputes figures from inputs (never
  trusts client results), maps every AI-side failure to one sanitized
  503, and emits opt-in diagnostics (`provider`, `model`, `api`,
  workflow, outcome, stage timings, token counts — never figures or
  secrets) when `HOMEWISE_AI_DIAGNOSTICS=1`.

## Not verified (still open)

- Rate limits, pricing, and the full error-code taxonomy.
- Whether an official TypeScript SDK exists (the client is hand-rolled
  `fetch`, deliberately dependency-free).

## Standing constraints (from PROJECT_RULES.md and ARCHITECTURE.md)

- Server-side calls only; the key never reaches the browser, logs,
  errors, or the repository.
- Minimum-necessary figures sent per request; no names or identifiers.
- Model output validated against a strict schema; failures degrade to
  the calc-only view.
