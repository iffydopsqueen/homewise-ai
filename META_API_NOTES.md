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

## Not yet verified (Phase 7 gate)

- Exact request/response JSON shapes for the chosen protocol.
- Tool-calling wire format and structured-output schema dialect.
- Rate limits, pricing, timeouts, and error-code taxonomy.
- Whether an official TypeScript SDK exists and what it covers.

## Standing constraints (from PROJECT_RULES.md and ARCHITECTURE.md)

- Server-side calls only; the key never reaches the browser, logs,
  errors, or the repository.
- Minimum-necessary figures sent per request; no names or identifiers.
- Model output validated against a strict schema; failures degrade to
  the calc-only view.
