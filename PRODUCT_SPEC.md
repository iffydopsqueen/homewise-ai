# HomeWise AI — Product Specification

Product requirements for the MVP. Technical design lives in
[ARCHITECTURE.md](ARCHITECTURE.md). Engineering ground rules live in
[PROJECT_RULES.md](PROJECT_RULES.md).

## 1. Target users

Primary users — first-time homebuyers who:

- Earn a regular income and can state their monthly take-home pay.
- Are evaluating whether they can afford to buy without becoming
  "house poor" (spending so much on housing that little is left for
  savings, debt, and daily life).
- Are comparing at most two specific properties.
- Want plain-language explanations of costs, not just numbers.

Non-users for the MVP: real-estate professionals, lenders, investors,
and anyone seeking mortgage approval decisions or professional
financial advice. The product must not present itself as any of those.

## 2. Problem statement

First-time buyers routinely underestimate the true cost of owning a home.
Listing prices and mortgage calculators spotlight principal and interest,
while property taxes, homeowners insurance, HOA fees, maintenance, and
other recurring costs stay hidden until after purchase. The result is
buyers who qualify for a loan they can technically service yet cannot
comfortably live with.

Two existing options each fail in one direction: traditional calculators
produce numbers with no explanation, while general-purpose AI chatbots
explain fluently but can invent or miscalculate figures. HomeWise AI
combines both strengths with neither weakness: deterministic,
tested application code computes every figure, and AI explains what
those verified figures mean for the user's situation.

## 3. MVP capabilities

### 3.1 Affordability assessment

Inputs: monthly take-home income, monthly debt payments, monthly
recurring expenses, current savings, and a proposed monthly housing cost.

Outputs: an affordability picture showing how the proposed housing cost
fits against income, obligations, and savings cushion — with every
threshold and guideline explicitly labeled as an assumption, not a
lending decision.

### 3.2 True cost of ownership calculator

Computes the full monthly and annual cost of owning one property from:
mortgage principal and interest, property taxes, homeowners insurance,
HOA fees, maintenance reserves, and other user-specified recurring costs.

Every line item must be labeled with its provenance: user-provided
value, estimate, or assumption.

### 3.3 Two-property comparison

Side-by-side comparison of two properties' true ownership costs,
showing per-component and total monthly, annual, and upfront-cash
differences. If the two properties were evaluated under different
assumptions, the comparison must flag that so the user does not read a
misleading delta.

### 3.4 What-if scenarios

Starting from a base scenario, the user varies down payment, interest
rate, property taxes, homeowners insurance, and maintenance inputs and
sees recomputed totals and deltas against the base. All recomputation
is deterministic application logic.

> Build status: the deterministic engine (`lib/calc/whatIf.ts`) and the
> `POST /api/what-if` endpoint are implemented and tested, but the
> user-facing What-If controls were intentionally deferred to keep the
> release focused on the three completed workflows. The requirement
> above stands for a future increment.

### 3.5 Grounded AI explanations and insights

Muse Spark generates plain-language explanations and insights (for
example: why one property costs more per month, which cost driver
dominates, how a what-if change moved the total). The model works only
from verified application calculations, must never compute or invent
figures independently, and its text is supplementary: the numbers shown
on screen always come from the calculation engine, with or without AI.

## 4. Explicitly out of MVP scope

- Mortgage approval predictions, pre-approval, or any promise that a
  loan will be granted.
- Professional financial advice (e.g. "you should buy this home").
  The UI must carry a persistent disclaimer to this effect.
- Comparing more than two properties, saved portfolios, or sharing.
- Live market data: interest-rate feeds, listings, or tax-record
  lookups. All figures are user-provided or clearly labeled estimates.
- User accounts, cross-device persistence, or collaboration.
- Rent-vs-buy analysis.
- Amortization schedules (monthly payment suffices for the MVP).
- Tax advice, including mortgage-interest deduction guidance.
- Native mobile apps.

## 5. Primary user journey

1. The user enters their finances: take-home income, debts, recurring
   expenses, savings.
2. The user enters a proposed monthly housing cost and receives an
   affordability snapshot with labeled assumptions.
3. The user enters property A's details and costs, and sees the true
   monthly, annual, and upfront cost breakdown with provenance labels.
4. The user adds property B and sees the side-by-side comparison
   with deltas.
5. The user runs what-if scenarios (down payment, rate, taxes,
   insurance, maintenance) and sees how totals move. (Deferred from
   this release: see the §3.4 build-status note.)
6. At each results step, the user may read an AI-generated explanation
   grounded in the verified figures on screen.
7. If AI is unavailable, steps 1–5 still work fully; only the
   explanations are absent.

Global UX requirements across this journey:

- Every figure is traceable to a user input or a labeled
  estimate/assumption.
- A persistent disclaimer states the product is educational, is not a
  lending decision, and is not professional financial advice.

## 6. Assumptions and unresolved product decisions

### Assumptions (accepted for MVP unless revisited)

- Users can state take-home pay, debts, expenses, and savings with
  reasonable accuracy; the product validates formats and ranges but
  cannot verify truthfulness.
- Taxes and insurance are either known by the user or entered as
  explicit estimates; the MVP provides no external data source.
- Session-only use is acceptable: no accounts and no saved data in
  the MVP, which also minimizes privacy risk.
- The application is fully usable without AI; AI explanations are an
  enhancement layer, never a requirement for correct numbers.

### Unresolved decisions (must be settled before or during build)

1. Affordability thresholds: which ratios or guidelines (if any) to
   show, and how to label them as general educational guidelines
   rather than lending criteria. → Resolved: the engine reports raw
   ratios only, with no thresholds, verdicts, or approvals.
2. Maintenance reserve default: which heuristic (if any) to offer as a
   starting estimate, clearly labeled as an assumption. → Resolved:
   1% annually, editable, always badged as an assumption with a
   "starting point only" caption.
3. PMI (private mortgage insurance): in or out of the MVP cost model.
   The confirmed cost list does not include it, but low–down-payment
   scenarios are materially incomplete without it. → Resolved: in, as
   an optional user-entered monthly figure on its own labeled line;
   no estimation formula.
4. Closing costs: in or out of the upfront-cash figure.
5. Loan terms offered: fixed 30-year only, or a choice (e.g. 15/30).
6. What counts as "other recurring costs": free-form user entries only,
   or a preset list (utilities, etc.).
7. Estimate assistance: whether the product may suggest starting
   estimates at all (still labeled as estimates), or require the user
   to enter every figure.
