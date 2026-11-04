"use client";

import { useRef, useState } from "react";

import type { Fact } from "../lib/ai/facts";
import type { AffordabilityResult } from "../lib/calc/affordability";
import type { ComparisonResult } from "../lib/calc/compare";
import type { TrueCostResult } from "../lib/calc/trueCost";
import type { ResolvedTrueCostProvenance } from "../lib/validation/api";
import {
  isRetryable,
  requestExplanation,
  type ExplainData,
} from "../lib/api/explainClient";
import Disclaimer from "./Disclaimer";
import {
  AffordabilityInsightsVisual,
  CompareInsightsVisual,
  TrueCostInsightsVisual,
} from "./InsightVisuals";
import ProvenanceBadge from "./ProvenanceBadge";

// Shared AI explanation block, mounted inside a "Financial insights" card
// beneath a completed calculation result. All state is local: nothing
// persists, and editing inputs retires the parent result, which unmounts
// this section with it. Exactly one request per explicit click; retries
// are always manual.
//
// Data integrity: charts render ONLY from the verified deterministic
// engine result passed via `visual`. AI narrative is never parsed for
// numbers and never feeds a visualization.

// Verified engine results already computed by the parent workflow. Passed
// through for display; this section never recalculates them.
export type InsightsVisualData =
  | { workflow: "affordability"; result: AffordabilityResult }
  | {
      workflow: "true-cost";
      result: TrueCostResult;
      provenance: ResolvedTrueCostProvenance;
    }
  | { workflow: "compare"; result: ComparisonResult };

interface ExplainSectionProps {
  buildPayload: () => unknown | null;
  visual: InsightsVisualData;
}

type Status =
  | { stage: "idle" }
  | { stage: "loading" }
  | { stage: "ready"; data: ExplainData }
  | { stage: "failed"; message: string; retryable: boolean };

// At most this many observations render as prominent cards; the rest move
// into an expandable disclosure with their full content intact.
const PROMINENT_OBSERVATIONS = 3;

const DISCLOSURE =
  "On request, HomeWise sends your inputs and calculated figures to Meta to explain these results.";

const LOADING_TEXT = "Meta AI is preparing your explanation. This may take up to a minute.";

// Neutral failure headline. The calculated visuals above stay visible, so
// the message only needs to explain the missing explanation — never the
// figures. A specific safe detail follows when the client has one.
const FAILURE_HEADLINE =
  "We couldn't show an AI explanation. Your calculated results are still available.";

// Compact model attribution, truthful per AI state. Idle names the
// available model (not a completed analysis); ready confirms the shown
// narrative is Meta-generated and validator-checked; failed renders no
// attribution at all, so a failure can never claim a verified result.
const MODEL_ATTRIBUTION = {
  idle: "Optional explanations powered by Meta Muse Spark 1.3.",
  loading: "Powered by Meta Muse Spark 1.3.",
  ready: "Explanation by Meta Muse Spark 1.3, checked against your calculated figures.",
} as const;

function FactChips({ facts }: { facts: Fact[] }) {
  if (facts.length === 0) {
    return null;
  }
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {facts.map((fact) => (
        <li
          key={fact.id}
          className="inline-flex items-center gap-2 rounded-md bg-t-surface-alt px-2.5 py-1 text-sm text-t-body-strong"
        >
          <span className="font-medium">{fact.label}</span>
          <span>{fact.displayValue}</span>
          {fact.kind === "info" ? (
            <span
              title="Background note, not a measured figure"
              className="inline-block rounded-full bg-t-prov-bg px-2 py-0.5 text-xs font-medium text-t-prov-ink"
            >
              Note
            </span>
          ) : (
            <ProvenanceBadge label={fact.kind} />
          )}
        </li>
      ))}
    </ul>
  );
}

// Supporting evidence lives behind a native disclosure (T5b.4): the
// validated text stays primary while every citation — amounts, labels,
// provenance — remains one keyboard-accessible toggle away, associated
// with its own observation. Nothing is summarized or dropped.
function SupportingFigures({ facts }: { facts: Fact[] }) {
  if (facts.length === 0) {
    return null;
  }
  return (
    <details className="mt-2">
      <summary className="w-fit cursor-pointer text-sm font-semibold text-t-ink underline">
        Supporting figures ({facts.length})
      </summary>
      <FactChips facts={facts} />
    </details>
  );
}

function ObservationCard({ text, facts }: { text: string; facts: Fact[] }) {
  return (
    <div className="rounded-lg bg-t-surface-alt p-4">
      <p className="text-t-body-strong">{text}</p>
      <SupportingFigures facts={facts} />
    </div>
  );
}

function InsightsVisual({ visual }: { visual: InsightsVisualData }) {
  switch (visual.workflow) {
    case "affordability":
      return <AffordabilityInsightsVisual result={visual.result} />;
    case "true-cost":
      return (
        <TrueCostInsightsVisual
          result={visual.result}
          provenance={visual.provenance}
        />
      );
    case "compare":
      return <CompareInsightsVisual result={visual.result} />;
  }
}

export default function ExplainSection({
  buildPayload,
  visual,
}: ExplainSectionProps) {
  const [status, setStatus] = useState<Status>({ stage: "idle" });
  const inFlight = useRef(false);

  async function handleExplain(): Promise<void> {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setStatus({ stage: "loading" });
    try {
      const payload = buildPayload();
      if (payload === null) {
        setStatus({
          stage: "failed",
          message: "These inputs changed. Review the form and try again.",
          retryable: false,
        });
        return;
      }
      const response = await requestExplanation(payload);
      if (response.ok) {
        setStatus({ stage: "ready", data: response.data });
      } else {
        setStatus({
          stage: "failed",
          message: response.error.message,
          retryable: isRetryable(response.error.code),
        });
      }
    } catch {
      // Unreachable through known paths (builders and the client catch
      // internally), but an unexpected throw must never strand the UI on
      // "loading": fail safe with a generic, non-retryable message.
      setStatus({
        stage: "failed",
        message: "Something went wrong.",
        retryable: false,
      });
    } finally {
      inFlight.current = false;
    }
  }

  const observations =
    status.stage === "ready" ? status.data.observations : [];
  const prominent = observations.slice(0, PROMINENT_OBSERVATIONS);
  const extra = observations.slice(PROMINENT_OBSERVATIONS);

  return (
    <div className="mt-6">
      <p className="text-sm leading-6 text-t-muted">{DISCLOSURE}</p>
      {/* Deterministic visuals stay mounted in every AI state: they render
          only from the verified engine result, so AI availability never
          gates them. */}
      <div className="mt-4">
        <InsightsVisual visual={visual} />
      </div>
      {status.stage !== "failed" && (
        <p className="mt-4 text-xs text-t-muted">
          {MODEL_ATTRIBUTION[status.stage]}
        </p>
      )}
      <div aria-live="polite">
        {status.stage === "idle" && (
          <button
            type="button"
            onClick={() => void handleExplain()}
            className="mt-4 rounded-md bg-t-action px-5 py-2.5 font-semibold text-t-on-action hover:bg-t-action-hover"
          >
            Generate insights
          </button>
        )}
        {status.stage === "loading" && (
          <div className="mt-4">
            <div aria-hidden="true" className="space-y-3">
              <div className="h-24 rounded-lg bg-t-surface-alt motion-safe:animate-pulse" />
              <div className="h-12 rounded-lg bg-t-surface-alt motion-safe:animate-pulse" />
            </div>
            <p className="mt-3 text-sm font-medium text-t-body">
              {LOADING_TEXT}
            </p>
          </div>
        )}
        {status.stage === "failed" && (
          <div className="mt-4">
            <div
              role="alert"
              className="rounded-md border border-t-line-strong bg-t-surface-alt p-4"
            >
              <p className="text-sm font-medium text-t-ink">
                {FAILURE_HEADLINE}
              </p>
              <p className="mt-1 text-sm text-t-body">{status.message}</p>
            </div>
            {status.retryable && (
              <button
                type="button"
                onClick={() => void handleExplain()}
                className="mt-3 rounded-md border border-t-line-strong px-5 py-2.5 font-semibold text-t-ink hover:bg-t-secondary-hover"
              >
                Try again
              </button>
            )}
          </div>
        )}
        {status.stage === "ready" && (
          <div className="mt-4 space-y-6">
            <div>
              <h3 className="text-base font-semibold text-t-ink">
                Key observations
              </h3>
              <ol className="mt-3 grid gap-3">
                {prominent.map((observation, index) => (
                  <li key={index}>
                    <ObservationCard
                      text={observation.text}
                      facts={observation.facts}
                    />
                  </li>
                ))}
              </ol>
              {extra.length > 0 && (
                <details className="mt-3">
                  <summary className="w-fit cursor-pointer text-sm font-semibold text-t-ink underline">
                    Show {extra.length} more observation
                    {extra.length === 1 ? "" : "s"}
                  </summary>
                  <ol
                    start={PROMINENT_OBSERVATIONS + 1}
                    className="mt-3 grid gap-3"
                  >
                    {extra.map((observation, index) => (
                      <li key={index}>
                        <ObservationCard
                          text={observation.text}
                          facts={observation.facts}
                        />
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </div>
            <div className="rounded-md bg-t-surface-alt p-4">
              <p className="text-sm font-semibold text-t-body-strong">
                Limitations
              </p>
              <p className="mt-1 text-sm text-t-body">
                {status.data.limitations.text}
              </p>
              <SupportingFigures facts={status.data.limitations.facts} />
            </div>
            <Disclaimer />
          </div>
        )}
      </div>
    </div>
  );
}
