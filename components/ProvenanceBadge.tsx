import type { ProvenanceLabel } from "../lib/validation/api";

export type DisplayLabel = ProvenanceLabel | "calculated";

const STYLES: Record<DisplayLabel, { text: string; title: string; className: string }> = {
  "user-provided": {
    text: "User-provided",
    title: "Figure you entered",
    className: "bg-t-prov-bg text-t-prov-ink",
  },
  estimate: {
    text: "Estimate",
    title: "Figure you marked as an estimate",
    className: "bg-t-est-bg text-t-est-ink",
  },
  assumption: {
    text: "Assumption",
    title: "Modeling assumption, not a measured figure",
    className: "bg-t-warn-bg text-t-warn-ink",
  },
  calculated: {
    text: "Calculated",
    title: "Computed by the app from the figures above",
    className: "bg-t-calc-bg text-t-calc-ink",
  },
};

export default function ProvenanceBadge({ label }: { label: DisplayLabel }) {
  const style = STYLES[label];
  return (
    <span
      title={style.title}
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${style.className}`}
    >
      {style.text}
    </span>
  );
}
