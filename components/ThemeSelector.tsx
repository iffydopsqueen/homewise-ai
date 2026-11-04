import { THEMES, type ThemeName } from "../lib/theme/theme";

const LABELS: Record<ThemeName, string> = {
  light: "Light",
  natural: "Natural",
  dark: "Dark",
};

interface ThemeSelectorProps {
  // Unique prefix per instance (desktop + mobile render simultaneously).
  idPrefix: string;
  value: ThemeName;
  onChange: (theme: ThemeName) => void;
}

// Compact segmented appearance control (T3d.3-I). Native radio semantics:
// arrow-key movement, Space/Enter activation, and AT-checked state come
// free; the input stays screen-reader/keyboard-focusable while the swatch
// carries the visible selected + focus styles via peer modifiers.
export default function ThemeSelector({
  idPrefix,
  value,
  onChange,
}: ThemeSelectorProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="inline-flex rounded-lg border border-t-line-strong p-1"
    >
      {THEMES.map((option) => {
        const id = `${idPrefix}-${option}`;
        const checked = value === option;
        return (
          <label
            key={option}
            htmlFor={id}
            className="cursor-pointer rounded-md"
          >
            <input
              id={id}
              type="radio"
              name={`${idPrefix}-appearance`}
              value={option}
              checked={checked}
              onChange={() => onChange(option)}
              className="peer sr-only"
            />
            <span
              className={[
                "block px-3 py-1.5 text-sm font-medium",
                checked
                  ? "rounded-md bg-t-action text-t-on-action"
                  : "rounded-md text-t-muted hover:text-t-ink",
                "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-t-focus",
              ].join(" ")}
            >
              {LABELS[option]}
            </span>
          </label>
        );
      })}
    </div>
  );
}
