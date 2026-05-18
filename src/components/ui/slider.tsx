import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * A small, dependency-free, accessible single-value range control.
 *
 * Built on a native `<input type="range">` (so keyboard, ARIA, and form
 * semantics come for free), visually rebuilt: a recessed rounded track with
 * faint warn/danger zone bands always visible behind it, a gradient orange
 * fill up to the thumb, and a crisp thumb that grows + rings on hover / focus
 * / drag. The `tone` prop recolours the fill + value readout so callers can
 * signal warn (>70%) / danger (>85%) thresholds.
 *
 * Controlled only: there is no internal source of truth — `value` in,
 * `onChange(next)` out, exactly like the other `ui/` primitives. The public
 * props/types/behavior are byte-compatible with the previous version.
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
  // A slightly lighter lead so the fill reads as a gradient, not a flat bar.
  const toneColorSoft =
    tone === "danger"
      ? "hsl(var(--destructive) / 0.72)"
      : tone === "warn"
        ? "hsl(var(--warning) / 0.72)"
        : "hsl(var(--primary) / 0.72)";

  return (
    <div className={cn("space-y-2", className)}>
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
                "font-mono text-xs font-medium tabular-nums transition-colors",
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
      {/*
        The control is a single layered box: zone bands (static), then the
        gradient fill (width = thumb %), then the transparent native range on
        top capturing all interaction. Keeping the input on top preserves
        keyboard/ARIA/pointer behaviour for free.
      */}
      <div className={cn("relative h-5 w-full", disabled && "cursor-not-allowed opacity-50")}>
        {/* Recessed track + always-visible warn(70%)/danger(85%) zone bands. */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-muted shadow-[inset_0_1px_2px_rgb(0_0_0_/_0.18)]"
          style={{
            backgroundImage:
              "linear-gradient(to right, transparent 0%, transparent 70%, hsl(var(--warning) / 0.16) 70%, hsl(var(--warning) / 0.16) 85%, hsl(var(--destructive) / 0.18) 85%, hsl(var(--destructive) / 0.18) 100%)",
          }}
        >
          {/* Gradient fill up to the thumb position. */}
          <div
            className="h-full rounded-full transition-[width] duration-75 ease-out"
            style={{
              width: `${clampedPct}%`,
              backgroundImage: `linear-gradient(to right, ${toneColorSoft}, ${toneColor})`,
            }}
          />
        </div>
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
            "slider-input absolute inset-0 m-0 w-full cursor-pointer appearance-none bg-transparent outline-none",
            "disabled:cursor-not-allowed",
          )}
          style={{ "--slider-tone": toneColor } as React.CSSProperties}
        />
      </div>
      {/*
        Native range thumbs are not styleable via Tailwind utilities across
        engines; this scoped block is the documented, dependency-free way.
        WebView2 (Chromium) only needs the `-webkit-` pseudo-elements. The
        runnable track is made transparent so our layered fill shows through.
      */}
      <style>{`
        .slider-input::-webkit-slider-runnable-track {
          height: 100%;
          background: transparent;
          border-radius: 9999px;
        }
        .slider-input::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          height: 16px;
          width: 16px;
          margin-top: -1px;
          border-radius: 9999px;
          background: var(--slider-tone);
          border: 2px solid hsl(var(--background));
          box-shadow: 0 1px 3px rgb(0 0 0 / 0.35), 0 0 0 1px hsl(var(--slider-tone) / 0.35);
          transition: box-shadow 120ms ease, transform 120ms ease;
        }
        .slider-input:enabled:hover::-webkit-slider-thumb {
          transform: scale(1.12);
        }
        .slider-input:enabled:focus-visible::-webkit-slider-thumb {
          box-shadow: 0 1px 3px rgb(0 0 0 / 0.35), 0 0 0 4px hsl(var(--ring) / 0.35);
        }
        .slider-input:enabled:active::-webkit-slider-thumb {
          transform: scale(1.18);
          box-shadow: 0 1px 4px rgb(0 0 0 / 0.4), 0 0 0 5px hsl(var(--slider-tone) / 0.28);
        }
      `}</style>
    </div>
  );
}
