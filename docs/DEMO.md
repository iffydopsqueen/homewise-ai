# HomeWise AI — Demo Guide

Live demo for the Meta Global AI Developer Hackathon. The demo shows the
real application with genuine Meta Model API calls — no canned AI text.

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

## Keeping secrets safe on screen

- Never open `.env.local` or print environment variables on the shared
  screen. The key lives only in that git-ignored file and server
  memory; the UI, diagnostics, and error messages never contain it.
- If you must prove the key exists, show `.env.example` (names only).
- Close or blur any tab showing the Meta dashboard.

## If a live explanation fails

AI calls can fail (network, rate limits, provider hiccups). The app was
built for this — treat it as a feature, not a bug:

1. The calculated results and charts stay on screen; only the
   explanation area shows "We couldn't show an AI explanation."
2. Narrate: "The numbers never depended on the AI — that is the whole
   point of the architecture."
3. Click **Try again** once if it appears (transient failures only).
4. Fallback: show a pre-recorded 30-second clip of a successful
   Generate insights run (record one the night before, same inputs as
   above), then continue the live demo.

Do not retry repeatedly on camera, and do not paste an old explanation
into the live UI and present it as live.

## Three-minute outline

| Time | Beat |
|---|---|
| 0:00–0:30 | The problem: listing prices hide taxes, insurance, HOA, and maintenance; chatbots explain fluently but invent figures. HomeWise pairs tested math with grounded AI. |
| 0:30–1:10 | Affordability: enter the sample income/expenses, submit, show remaining income and cushion. Point out the charts render with zero AI involved. |
| 1:10–1:50 | Compare: A vs B side by side, neutral differences, no winner. Mention estimates vs user-provided labels. |
| 1:50–2:40 | Generate insights live: watch the terminal diagnostic line land while observations render with supporting figures. |
| 2:40–3:00 | Why it matters: every number traces to tested code; the AI explains verified facts or stays silent. |

## After the demo

Set `HOMEWISE_AI_DIAGNOSTICS=` (empty) in `.env.local` and restart the
server so routine runs stay quiet. Never commit `.env.local`.
