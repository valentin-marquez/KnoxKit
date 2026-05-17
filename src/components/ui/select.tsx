import { ChevronDown } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

/** Native select with a label prefix, styled to match the toolbar controls. */
export function Select({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label?: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-card pl-3 pr-2 text-xs transition-colors hover:border-ring/50 focus-within:border-ring",
        className,
      )}
    >
      {label && <span className="text-muted-foreground">{label}</span>}
      <span className="relative inline-flex items-center">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="cursor-pointer appearance-none bg-transparent pr-5 font-medium text-foreground outline-none"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-popover text-popover-foreground">
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-0 text-muted-foreground"
        />
      </span>
    </label>
  );
}
