# HomeWise AI — Demo Recording Guide

Record the real application with genuine Meta Model API calls — no
mocked responses, and no presenting recorded output as autonomous
agent activity.

## Preparation

- Run HomeWise locally:
  `git clone https://github.com/iffydopsqueen/homewise-ai.git`,
  `npm install`, `npm run dev` (http://localhost:3000).
- If you do not already have a `.env.local`, create it from
  `.env.example` (never overwrite an existing one) and fill in
  `MODEL_API_KEY` locally.
- Enable safe server diagnostics: set `HOMEWISE_AI_DIAGNOSTICS=1` in
  `.env.local` and restart the server. Each explanation then prints
  one JSON record with provider, model, API, workflow, outcome,
  timing, and token counts — never figures, prompts, or secrets.
- Keep the browser and the server terminal visible side by side.
- Use the fictional sample figures below — never real personal data.
- Never open `.env.local` or print environment variables on screen.

## Product walkthrough

Use round numbers and narrate what each screen proves.

**Dashboard** (`/`). Show the three workflow cards, then open each
workflow below. Completed results appear back on the dashboard.

**Affordability** (`/affordability`). Enter monthly take-home income
8000, proposed housing 2000, debts 600, expenses 2500, savings 50000.
Expect $2,900 remaining, a 25% housing share, and a 9.8-month cushion
— with the insights visual rendered before any AI call.

**Property Costs** (`/property-costs`). Enter price 360,000, down
payment 60,000, rate 0%, taxes 1,200/yr, insurance 0, HOA 0,
maintenance 0%. Expect $833.33 P&I + $100 tax = $933.33/mo and
$60,000 upfront. Point out the source labels on each figure.

**Compare Properties** (`/compare`). Property A as above; Property B
with price 300,000, down 60,000, rate 0%, all other costs 0. Expect A
at $933.33/mo vs B at $666.67/mo, neutrally presented as "Property A
costs more per month" — never a ranking or recommendation.

## Meta demonstration

1. On any completed result, click **Generate insights** manually.
2. Show the real browser request completing in the UI.
3. Show the new `ai_explain` line in the server terminal, pointing
   out `"provider":"meta"` and `"model":"muse-spark-1.3"`.
4. Wait for the genuine response (bounded by the 60-second timeout).
5. Show the returned observations and Limitations note.
6. Open one **Supporting figures** disclosure to show the cited
   evidence behind the prose.
7. Explain: the numbers were computed by tested code before the AI
   was asked; the model only explains verified figures, and anything
   ungrounded is rejected instead of shown.

## If an explanation fails

AI calls can fail (network, rate limits, provider hiccups). Keep
recording: the calculated results and charts stay on screen while the
explanation area shows a short neutral message. Narrate that the
numbers never depended on the AI, optionally click **Try again** once
if it appears, and continue. Do not display fabricated output or
present an old explanation as a live one. If the call keeps failing,
re-record the Meta segment later with the same sample inputs.

## Video requirements

- Maximum duration: 3:00 — aim for the 2:50 outline below.
- Understandable in English.
- Mainly real footage of the running product.
- Genuine Meta calls visible (browser + terminal evidence).
- Public or unlisted link, watchable without login.

## Recording outline (2:50)

| Time | Beat |
|---|---|
| 0:00–0:25 | The problem: listing prices hide the true cost of owning; chatbots invent figures. HomeWise pairs tested math with grounded AI. |
| 0:25–1:00 | Dashboard, then Affordability with the sample inputs: $2,900 remaining, charts with zero AI involved. |
| 1:00–1:35 | Property Costs: $933.33/mo breakdown with source labels on every figure. |
| 1:35–2:00 | Compare A vs B: neutral $266.66/mo difference, no winner. |
| 2:00–2:35 | Generate insights live: terminal diagnostic line plus validated observations and one Supporting figures disclosure. |
| 2:35–2:50 | Why it matters: every number traces to tested code; the AI explains verified facts or stays silent. |
