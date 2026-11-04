import type { ReactNode } from "react";

interface CardProps {
  id: string;
  title: string;
  description?: string;
  children?: ReactNode;
  // Makes the card heading programmatically focusable (tabIndex -1, never
  // in tab order) so a workflow can move focus to results after an explicit
  // submission. Defaults to false; no existing consumer is affected.
  focusableHeading?: boolean;
}

// Shared presentational card (T3a foundation): a labelled surface section
// with a title, an optional description, and caller-owned body content.
// No data, fetching, or state — parents compose status lines, summaries,
// links, or forms as children. Styling reuses the existing dashboard card
// conventions (surface, line border, radius, padding, shadow) so adoption
// never changes appearance.
export default function Card({
  id,
  title,
  description,
  children,
  focusableHeading = false,
}: CardProps) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col rounded-lg border border-t-line bg-t-surface p-5 shadow-sm"
    >
      <h2
        id={id}
        className="text-lg font-bold text-t-ink"
        tabIndex={focusableHeading ? -1 : undefined}
      >
        {title}
      </h2>
      {description !== undefined && (
        <p className="mt-2 text-sm text-t-muted">{description}</p>
      )}
      {children}
    </section>
  );
}
