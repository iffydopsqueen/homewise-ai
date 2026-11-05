# HomeWise AI — Product Specification

## 1. Product summary

**HomeWise AI** is a homebuying affordability and property comparison application for first-time buyers. Its purpose is to make ongoing and upfront housing costs easier to understand before someone makes a purchase decision.

The product combines **deterministic financial estimates** with **optional Meta Muse Spark 1.3 explanations**. Meta AI interprets validated calculated results; it never supplies the authoritative financial calculations.

### Audience

- Primary: first-time homebuyers who want a clearer picture of their monthly budget and potential housing costs.
- Secondary: people comparing two prospective properties or reviewing their existing financial assumptions.

### Problem

Buyers may focus on a listing price or mortgage principal-and-interest payment while overlooking taxes, insurance, maintenance, HOA fees, upfront cash, and existing monthly commitments. HomeWise presents those pieces together without claiming that a lender would approve the purchase.

## 2. Product principles

1. **Clarity before complexity.** Use everyday English and clear, labeled figures.
2. **Deterministic calculations.** Every financial result comes from the application engine, not the model.
3. **Traceable assumptions.** Distinguish supplied values, estimates, assumptions, and calculated amounts.
4. **Optional AI.** Calculations and visualizations must work even if AI is disabled or unavailable.
5. **No lending or purchase verdicts.** Show financial information without approvals, rankings, or recommendations.
6. **Privacy by design.** No user accounts, persistent financial records, or unnecessary external services in the MVP.
7. **Mobile and accessible.** Core workflows must work with a narrow viewport and keyboard controls.

## 3. Shipped user-facing workflows

### 3.1 Affordability

**Inputs**

- Monthly take-home income.
- Proposed monthly housing cost.
- Existing monthly debt payments.
- Other monthly living expenses.
- Available savings.

**Outputs**

- Total monthly obligations and money remaining after the entered obligations.
- Proposed housing cost as a percentage of take-home pay.
- Total obligations as a percentage of take-home pay.
- A savings cushion in months based on the entered savings and monthly obligations, when the calculation is defined.
- Income-allocation visualization and a detailed, traceable breakdown.

**Required behavior**

- Clearly show positive, zero, or negative remaining money; do not turn a shortfall into a favorable verdict.
- Handle zero-income and zero-obligation cases without misleading percentages or infinite cushion values.
- Do not introduce a universal affordability threshold or lender-approval label.

### 3.2 Property Costs

**Inputs**

- Purchase price and down payment.
- Annual mortgage interest rate and loan term.
- Annual property tax and homeowners insurance.
- Monthly HOA fees, maintenance assumptions, and private mortgage insurance (PMI), when provided.
- Estimated closing costs and other recurring property expenses, when applicable.
- Source or estimation choices for relevant fields.

**Outputs**

- Monthly principal and interest.
- Itemized monthly property costs and annualized total.
- Estimated upfront cash based on the down payment and supplied closing costs.
- Visual cost allocation, largest monthly drivers, and a detailed breakdown.
- Appropriate notes when costs are missing, estimated, or outside the calculation.

**Required behavior**

- Keep one-time and recurring costs separate.
- Do not present the upfront estimate as lender-confirmed cash to close.
- Treat optional PMI as a user-supplied figure; do not silently infer it from the down payment.
- Label maintenance starting assumptions explicitly and allow the user to edit them.

### 3.3 Compare Properties

**Inputs**

Two independent property scenarios using the Property Costs inputs.

**Outputs**

- Property A and Property B monthly and annual estimates.
- Estimated upfront cash for each property.
- The size and direction of the monthly, annual, upfront, and category-by-category differences.
- A visual comparison and an explanation of relevant assumptions.

**Required behavior**

- State which side has the higher cost, including when B costs more than A.
- Treat equal costs neutrally and handle zero-cost cases honestly.
- Do not rank or recommend either property.
- Preserve each side's values when the other side is edited.

### 3.4 Dashboard and navigation

- Show each workflow's current status and summary of completed results.
- Keep values available while navigating in the current browser session.
- Retire outdated results when an input changes.
- Support mobile navigation, keyboard interaction, and Light/Natural/Dark themes.
- Do not treat theme persistence as persistence of financial records.

### 3.5 Financial Insights

**Calculated insights** are available immediately after a successful financial calculation. They include verified figures and visualizations that do not depend on Meta.

**Optional AI explanations** require an explicit user action. The server sends relevant inputs and calculated facts to Meta Muse Spark 1.3, accepts only structured output, checks numerical claims and cited facts, and displays observations with supporting figures and limitations when validation passes.

If an explanation is rejected or the provider is unavailable, the calculated insights remain visible. A retry is initiated only by the user, where allowed by the error contract.

## 4. Scope decisions

| Area | Release decision |
| --- | --- |
| Affordability | Included |
| Property Costs | Included |
| Compare Properties | Included |
| Dashboard and Financial Insights | Included |
| Meta-generated explanations | Included as optional, user-initiated analysis |
| What-If | Deterministic engine and `POST /api/what-if` implemented and tested; user-facing controls deferred |
| Mortgage or credit approval | Excluded |
| Property recommendations or rankings | Excluded |
| User accounts and persistent financial records | Excluded |
| External listings, live interest-rate feeds, and lender integration | Excluded |

The existence of the What-If engine and endpoint does **not** mean What-If is a completed user-facing workflow.

## 5. Financial model and evidence

- Monetary amounts are handled as integer subunits for consistent calculations and rounding.
- Inputs are validated before reaching the calculation engine.
- Results are recomputed from inputs rather than copied from model-generated text.
- The application distinguishes user-provided values, calculated values, assumptions, and estimates where appropriate.
- The user can inspect detailed breakdowns and supporting figures.
- Model explanations are not permitted to create authoritative new financial amounts.

Important product choices:

- Affordability ratios are descriptive; there is no hardcoded lending approval threshold.
- A **1% annual maintenance reserve** may be offered as an editable starting assumption; it is not a prediction of actual maintenance spending.
- PMI is an optional monthly figure when provided, not an automatic premium estimate.

## 6. Privacy, accessibility, and quality

- Keep secrets on the server and out of the repository.
- Do not send data to Meta simply because a calculation page opens.
- Explain clearly that requesting an AI analysis sends the relevant information and results to Meta.
- No account creation is required to use the MVP.
- Financial workflow state is session-scoped; a refresh clears it, while display-theme preference may persist.
- Make forms, disclosure controls, navigation, and charts keyboard- and screen-reader-friendly.
- Test the deterministic engine, HTTP routes, model response validation, and browser journeys separately.

## 7. Acceptance criteria

The release is acceptable when:

1. Each of the three user-facing workflows can calculate and display verified values.
2. Invalid inputs yield safe, actionable errors without showing stale results.
3. Changing inputs retires previously generated results and explanations.
4. Charts and figures remain available if Meta is disabled or returns a rejected response.
5. An AI explanation is never requested automatically and is never displayed before validation.
6. Property comparisons handle A-higher, B-higher, and equal cases correctly.
7. The experience works on mobile and supports accessible controls.
8. The README and demo show the actual implemented feature set without invented capabilities.

## 8. Limitations and future direction

HomeWise AI is intended for education and exploration. It does not verify bank statements, property data, quoted insurance premiums, tax assessments, loan eligibility, or lender closing disclosures. Real costs can differ from estimates.

Future work may include the deferred What-If interface and additional refinement of AI explanation reliability. These are **not part of the current shipped UI**.

See [ARCHITECTURE.md](ARCHITECTURE.md) for implementation structure and [PROJECT_RULES.md](PROJECT_RULES.md) for engineering safeguards.
