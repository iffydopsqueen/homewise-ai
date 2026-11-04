type KpiVariant = "hero" | "secondary";
type KpiTone = "default" | "negative";

interface KpiProps {
  label: string;
  // Preformatted by the caller (e.g. "$2,900.00", "25.0%", "9.8 months"):
  // this component never calculates or formats financial values.
  value: string;
  caption?: string;
  variant?: KpiVariant;
  // "negative" styles signed-negative amounts (e.g. a shortfall) in the
  // error token. Factual negative-amount treatment only — never a verdict.
  tone?: KpiTone;
  // Accent fills the KPI with the sage action color and light text for a
  // prominent hero. Ignored when tone is "negative": shortfalls stay on a
  // neutral surface with an error-colored value for legibility.
  accent?: boolean;
  // Plain strips the card chrome (transparent, no border/shadow/padding)
  // for KPIs composed inside a parent surface. Padding comes from the
  // parent; variant still controls the value size.
  plain?: boolean;
}

// Dashboard summary figure (T3b-R). Presentational only: label, prominent
// value, and optional caption on a quiet card surface matching Card.
export default function Kpi({
  label,
  value,
  caption,
  variant = "secondary",
  tone = "default",
  accent = false,
  plain = false,
}: KpiProps) {
  const hero = variant === "hero";
  const accented = accent && tone !== "negative" && !plain;
  const valueColor = accented
    ? "text-t-on-action"
    : tone === "negative"
      ? "text-t-error"
      : "text-t-ink";
  const softColor = accented ? "text-t-on-action" : "text-t-muted";
  return (
    <div
      className={
        plain
          ? undefined
          : accented
            ? "rounded-lg bg-t-action p-6 shadow-sm"
            : hero
              ? "rounded-lg border border-t-line bg-t-surface p-6 shadow-sm"
              : "rounded-lg border border-t-line bg-t-surface p-4 shadow-sm"
      }
    >
      <p className={`text-sm font-medium ${softColor}`}>{label}</p>
      <p
        className={
          hero
            ? `mt-2 text-3xl font-bold tabular-nums break-words ${valueColor}`
            : `mt-1 text-xl font-bold tabular-nums break-words ${valueColor}`
        }
      >
        {value}
      </p>
      {caption !== undefined && (
        <p className={`mt-1 text-sm ${softColor}`}>{caption}</p>
      )}
    </div>
  );
}
