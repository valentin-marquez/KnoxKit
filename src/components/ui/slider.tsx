import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * A small, dependency-free, accessible single-value range control.
 *
 * Built on a native `<input type="range">` (so keyboard, ARIA, and form
 * semantics come for free) styled to the app's token palette via the
 * `slider-*` classes below. The visible label sits above the track with the
 * formatted current value on the right; the fill and thumb recolour through
 * `tone` so callers can signal warn/danger thresholds without re-implementing
 * the control.
 *
 * Controlled only: there is no internal source of truth — `value` in,
 * `onChange(next)` out, exactly like the other `ui/` primitives.
 */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  valueText,
  tone = "normal",
  disabled,
  className,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
  /** Visible field label, rendered above the track. */
  label?: string;
  /** Pre-formatted current-value string (e.g. `"6 of 16 GB"`). */
  valueText?: string;
  /** Recolours the fill + thumb to flag a threshold. */
  tone?: "normal" | "warn" | "danger";
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  // Guard against a zero-width track (min === max) so the fill math is stable.
  const span = max - min;
  const pct = span > 0 ? ((value - min) / span) * 100 : 0;
  const clampedPct = Math.min(100, Math.max(0, pct));

  const toneColor =
    tone === "danger"
      ? "hsl(var(--destructive))"
      : tone === "warn"
        ? "hsl(var(--warning))"
        : "hsl(var(--primary))";

  return (
    <div className={cn("space-y-1.5", className)}>
      {(label || valueText) && (
        <div className="flex items-baseline justify-between gap-3">
          {label && (
            <label htmlFor={id} className="block text-xs font-medium text-muted-foreground">
              {label}
            </label>
          )}
          {valueText && (
            <span
              className={cn(
                "font-mono text-xs tabular-nums",
                tone === "danger"
                  ? "text-destructive"
                  : tone === "warn"
                    ? "text-warning"
                    : "text-foreground",
              )}
            >
              {valueText}
            </span>
          )}
        </div>
      )}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={valueText}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(
          "slider-input h-5 w-full cursor-pointer appearance-none bg-transparent outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-ring/40",
        )}
        style={
          {
            // Track fill: tone-coloured up to the thumb, muted after it.
            background: `linear-gradient(to right, ${toneColor} 0%, ${toneColor} ${clampedPct}%, hsl(var(--muted)) ${clampedPct}%, hsl(var(--muted)) 100%)`,
            borderRadius: 9999,
            // Consumed by the thumb pseudo-elements in the scoped <style>.
            "--slider-tone": toneColor,
          } as React.CSSProperties
        }
      />
      {/*
        Native range thumbs are not styleable via Tailwind utilities across
        engines; this scoped block is the documented, dependency-free way.
        WebView2 (Chromium) only needs the `-webkit-` pseudo-element.
      */}
      <style>{`
        .slider-input::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          height: 16px;
          width: 16px;
          border-radius: 9999px;
          background: var(--slider-tone);
          border: 2px solid hsl(var(--background));
          box-shadow: 0 1px 2px rgb(0 0 0 / 0.3);
          margin-top: -6px;
        }
        .slider-input::-webkit-slider-runnable-track {
          height: 4px;
          border-radius: 9999px;
        }
      `}</style>
    </div>
  );
}
