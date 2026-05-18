import { useRef } from "react";
import { cn } from "@/lib/utils";

/** Which of the three semver segments a box represents. */
type Segment = 0 | 1 | 2;

const SEGMENTS: readonly Segment[] = [0, 1, 2] as const;
const LABELS: Record<Segment, string> = { 0: "major", 1: "minor", 2: "patch" };

/**
 * A controlled, OTP-style segmented `major.minor.patch` input.
 *
 * Three small numeric boxes joined by literal dots. Typing a digit advances
 * to the next box (like a one-time-code field); Backspace on an empty box
 * steps back. The value is reported as the joined `"x.y.z"` string, or `null`
 * when every box is blank (semver is optional — empty ⇒ "not set"). Strict,
 * dependency-free, accessible (each box has its own label + aria).
 *
 * Controlled only: `value` in (a dotted string or `null`), `onChange(next)`
 * out — no internal source of truth, matching the other `ui/` primitives.
 */
export function VersionInput({
  value,
  onChange,
  label,
  className,
  disabled,
}: {
  /** Current value as `"x.y.z"`, or `null`/`""` when unset. */
  value: string | null;
  /** Emits the joined `"x.y.z"`, or `null` when all segments are blank. */
  onChange: (next: string | null) => void;
  /** Visible group label, rendered above the boxes. */
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  // One ref per box so digit-entry can move focus forward/back.
  const refs = useRef<(HTMLInputElement | null)[]>([null, null, null]);

  // Split the controlled value into its three segments. Anything unpartable
  // (or null) degrades to empty boxes rather than throwing.
  const parts = splitVersion(value);

  /** Rebuild the dotted value from the three segments and report it. */
  const emit = (next: [string, string, string]) => {
    if (next.every((p) => p === "")) {
      onChange(null);
      return;
    }
    onChange(`${num(next[0])}.${num(next[1])}.${num(next[2])}`);
  };

  const setSegment = (seg: Segment, raw: string) => {
    // Keep digits only; cap each segment so a box stays a single field.
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    const next: [string, string, string] = [...parts];
    next[seg] = digits;
    emit(next);
    // Auto-advance once the user has typed into a non-last box.
    if (digits !== "" && raw.length > parts[seg].length && seg < 2) {
      refs.current[seg + 1]?.focus();
      refs.current[seg + 1]?.select();
    }
  };

  const onKeyDown = (seg: Segment, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && parts[seg] === "" && seg > 0) {
      e.preventDefault();
      refs.current[seg - 1]?.focus();
      refs.current[seg - 1]?.select();
      return;
    }
    if (e.key === "ArrowLeft" && seg > 0) {
      e.preventDefault();
      refs.current[seg - 1]?.focus();
    }
    if (e.key === "ArrowRight" && seg < 2) {
      e.preventDefault();
      refs.current[seg + 1]?.focus();
    }
    // A typed dot jumps to the next segment (natural semver typing).
    if ((e.key === "." || e.key === "Tab") && seg < 2 && !e.shiftKey && e.key === ".") {
      e.preventDefault();
      refs.current[seg + 1]?.focus();
      refs.current[seg + 1]?.select();
    }
  };

  return (
    <fieldset className={cn("space-y-1.5", className)}>
      {label && (
        <legend className="mb-1.5 block p-0 text-xs font-medium text-muted-foreground">
          {label}
        </legend>
      )}
      <div
        className={cn(
          "inline-flex items-center gap-1 rounded-lg border border-input bg-background px-2 py-1 transition-colors",
          "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/35",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        {SEGMENTS.map((seg) => (
          <div key={seg} className="flex items-center">
            {seg > 0 && (
              <span
                aria-hidden="true"
                className="select-none px-0.5 text-sm font-semibold text-muted-foreground"
              >
                .
              </span>
            )}
            <input
              ref={(el) => {
                refs.current[seg] = el;
              }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              disabled={disabled}
              aria-label={LABELS[seg]}
              placeholder="0"
              value={parts[seg]}
              onChange={(e) => setSegment(seg, e.target.value)}
              onKeyDown={(e) => onKeyDown(seg, e)}
              onFocus={(e) => e.target.select()}
              className={cn(
                "w-9 bg-transparent text-center font-mono text-sm tabular-nums outline-none",
                "placeholder:text-muted-foreground/50",
                "disabled:cursor-not-allowed",
              )}
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}

/** Coerce a possibly-empty digit string to a canonical number string. */
function num(s: string): string {
  if (s === "") return "0";
  // Strip leading zeros but keep a single digit (e.g. "007" → "7", "" → "0").
  const n = Number.parseInt(s, 10);
  return Number.isNaN(n) ? "0" : String(n);
}

/** Split a `"x.y.z"`-ish string into exactly three digit strings. */
function splitVersion(value: string | null): [string, string, string] {
  if (!value) return ["", "", ""];
  const raw = value.split(".");
  const seg = (i: number) => (raw[i] ?? "").replace(/\D/g, "").slice(0, 6);
  return [seg(0), seg(1), seg(2)];
}
