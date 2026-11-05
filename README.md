# HomeWise AI

**Understand the full cost of a home before you buy.**

HomeWise AI helps first-time homebuyers explore what a home could mean for their monthly budget. It combines transparent financial calculations, property cost comparisons, and optional explanations powered by **Meta Muse Spark 1.3**.

## Why HomeWise AI?

A mortgage payment is not the full cost of homeownership. Property taxes, insurance, maintenance, homeowners association (HOA) fees, and upfront expenses can significantly affect a household's budget. HomeWise AI brings these figures together so buyers can understand the costs and tradeoffs before taking their next steps.

The application **calculates with deterministic code and explains with Meta AI**. The AI does not decide whether someone can afford a house or which property they should purchase.

## Features

| Feature | What you can do |
| --- | --- |
| **Affordability** | Enter take-home income, proposed housing costs, debts, living expenses, and savings to see monthly money remaining, income ratios, and a savings cushion. |
| **Property Costs** | Estimate monthly and annual housing costs, including principal and interest, property tax, insurance, HOA fees, maintenance, and other applicable expenses. Review estimated upfront cash separately. |
| **Compare Properties** | Compare two properties side by side, including monthly costs, annual costs, upfront cash, and the categories driving the differences. |
| **Financial Insights** | Explore calculated charts immediately; optionally request plain-language Meta AI observations, supporting figures, and limitations. |
| **Dashboard** | See the status and results of completed workflows in one place. |

The interface works on desktop and mobile, supports keyboard interaction, and offers **Light**, **Natural**, and **Dark** themes. Values are labeled as user-provided, estimated, assumed, or calculated where relevant.

## What Meta AI contributes

HomeWise AI uses **Meta Muse Spark 1.3** through the server-side **Responses API** to interpret financial results—not to calculate them.

```text
User enters information
        ↓
Validated, deterministic financial calculations
        ↓
Results and provenance recorded in a server-generated facts ledger
        ↓  (only after the user requests an explanation)
Meta Muse Spark 1.3 produces structured observations
        ↓
HomeWise validates cited facts and numerical claims
        ↓
Readable observations, supporting figures, and limitations
```

A model-generated explanation is shown only after passing the application's structural, citation, numerical, and prohibited-language checks. These checks reduce risk but cannot guarantee every sentence is perfectly expressed. If the model is unavailable or its answer is rejected, **calculated results and charts remain usable**. The user initiates each request; HomeWise does not automatically generate explanations or automatically retry failed requests.

The AI does not independently verify entered values, approve mortgages, rank homes, or provide purchase recommendations. See [Meta integration notes](META_API_NOTES.md) for details.

## Technology

| Area | Technology |
| --- | --- |
| Application | Next.js App Router, React, TypeScript |
| Styling | Tailwind CSS |
| Input and output contracts | Zod |
| Financial calculations | Deterministic TypeScript engine using integer monetary amounts |
| AI explanations | Meta Muse Spark 1.3, Responses API, structured output |
| Quality checks | Vitest, Playwright, TypeScript, ESLint |

## Run locally

**Requirements:** Node.js 20.9 or newer and npm. This project was developed and verified using Node.js 26.

```bash
git clone https://github.com/iffydopsqueen/homewise-ai.git
cd homewise-ai
npm install
npm run dev
```

Open **http://localhost:3000**. The financial calculators and charts work without a Meta API key.

### Enable optional Meta explanations

If you do not already have `.env.local`, create it from the provided template:

```bash
cp .env.example .env.local
```

Set your own key locally:

```dotenv
MODEL_API_KEY=your_meta_model_api_key
```

In local development, explanations can be available when a valid key is configured. For production, follow the `AI_EXPLAIN_ENABLED` setting documented in `.env.example`. Restart the server after changing environment variables.

**Never commit `.env.local` or a real API key.** The model is called by the server; credentials are never needed in the browser. Optional server-only diagnostics and reasoning settings are described in [META_API_NOTES.md](META_API_NOTES.md).

## Check the project

Run these commands from the repository root:

```bash
npm run typecheck
npm run lint
npm run test
npx playwright test
npm run build
```

Playwright requires its browser dependencies. The browser test suite uses controlled test responses; genuine Meta requests are a separate, manual integration check.

## Documentation

- [Product specification](PRODUCT_SPEC.md) — intended users, workflows, requirements, and scope.
- [Architecture](ARCHITECTURE.md) — data flow, financial engine, AI boundaries, and design decisions.
- [Meta API notes](META_API_NOTES.md) — model request, validation, failure behavior, and diagnostics.
- [Project rules](PROJECT_RULES.md) — correctness, privacy, and engineering safeguards.
- [Demo guide](docs/DEMO.md) — sample data and how to record a genuine Meta API call.

## Scope and limitations

HomeWise AI is an **educational estimation tool**, not a lender, credit-decision system, or financial adviser. Results are based on entered figures and assumptions, which are not independently verified. The upfront-cash estimate is **not** lender-confirmed cash to close. Missing or uncertain costs, including private mortgage insurance (PMI), may change the real total.

The MVP has no user accounts or persistent financial history. Financial workflow data is kept in the browser session rather than saved as an account record. The **What-If** calculation engine and API exist, but the user-facing What-If feature was deliberately deferred from this release.

HomeWise AI is a hackathon prototype, not a production mortgage or lending service. Its explanations can occasionally be unavailable if a model response fails validation.
