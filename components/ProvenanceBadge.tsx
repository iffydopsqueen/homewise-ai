import type { ProvenanceLabel } from "../lib/validation/api";

export type DisplayLabel = ProvenanceLabel | "calculated";

const STYLES: Record<DisplayLabel, { text: string; title: string; className: string }> = {
  "user-provided": {
    text: "User-provided",
    title: "Figure you entered",
    className: "bg-slate-100 text-slate-800",
  },
  estimate: {
    text: "Estimate",
    title: "Figure you marked as an estimate",
    className: "bg-sky-100 text-sky-800",
  },
  assumption: {
    text: "Assumption",
    title: "Modeling assumption, not a measured figure",
    className: "bg-amber-100 text-amber-800",
  },
  calculated: {
    text: "Calculated",
    title: "Computed by the app from the figures above",
    className: "bg-slate-800 text-white",
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
