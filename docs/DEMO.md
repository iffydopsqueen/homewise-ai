# HomeWise AI — Demo Guide

The demo shows the real application with genuine Meta Model API calls.

## Startup

```bash
cd homewise-ai               # your local clone of the repository
npm install
npm run dev                  # http://localhost:3000
```

If you do not already have a `.env.local` file, create one from the
template first (never overwrite an existing one), and fill in
`MODEL_API_KEY` locally:

```bash
cp .env.example .env.local
```

Keep two windows visible: the browser and the terminal running `npm run
dev`. The terminal shows server logs (and diagnostics, below) while the
browser shows the app.

## Safe diagnostic mode (live-call evidence)

In `.env.local`, set:

```bash
HOMEWISE_AI_DIAGNOSTICS=1
```

Restart `npm run dev`. Every `POST /api/explain` then prints one JSON
record to the server terminal, for example:

```json
{"event":"ai_explain","provider":"meta","model":"muse-spark-1.3","api":"responses","workflow":"affordability","outcome":"success","totalMs":8420,"stages":{"parseMs":1,"factsMs":2,"promptMs":0,"providerMs":8300,"validateMs":3},"inputTokens":111,"outputTokens":222}
```

This is the on-screen proof of a live Meta call: provider, model, API,
workflow, outcome, elapsed time, and token counts. The record never
contains figures, prompts, responses, or secrets — safe to show.

How to narrate it: click **Generate insights**, then point at the new
terminal line while the UI renders the validated observations.

## Suggested sample inputs

Use round numbers that keep the story clear. All figures are monthly
unless noted.

**1. Affordability** (`/affordability`)

| Field | Value |
|---|---|
| Monthly take-home income | 8000 |
| Proposed monthly housing cost | 2000 |
| Existing monthly debt payments | 600 |
| Other monthly living expenses | 2500 |
| Available savings | 50000 |

Expect: $2,900 remaining, 25% housing share, 9.8-month cushion, and the
insights visual immediately — before any AI call.

**2. Property Costs** (`/property-costs`)

Price 360,000 · down payment 60,000 · rate 0% · taxes 1,200/yr ·
insurance 0 · HOA 0 · maintenance 0%. (A 0% rate keeps mental math
trivial: $833.33 P&I + $100 tax = $933.33/mo, $60,000 upfront.)

**3. Compare** (`/compare`)

- Property A: price 360,000 · down 60,000 · rate 0% · taxes 1,200/yr ·
  insurance 0 · HOA 0 · maintenance 0%.
- Property B: price 300,000 · down 60,000 · rate 0% · all other costs 0.

Expect: A at $933.33/mo vs B at $666.67/mo, neutrally presented as
"Property A costs more per month" with a $266.66 magnitude — never a
ranking or recommendation.

**4. AI explanation.** On any result, click **Generate insights**.
Expect within the 60-second request window: 2–3 plain-language
observations with per-observation Supporting figures, a Limitations
note, and the attribution "Explanation by Meta Muse Spark 1.3". The
terminal prints the diagnostic record at the same time.
