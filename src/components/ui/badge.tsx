import { cn } from "@/lib/utils";

type Tone = "default" | "primary" | "success" | "warning" | "muted" | "outline";

const tones: Record<Tone, string> = {
  default: "bg-secondary text-secondary-foreground",
  primary: "bg-primary/15 text-primary ring-1 ring-primary/25",
  success: "bg-success/15 text-success ring-1 ring-success/25",
  warning: "bg-warning/15 text-warning ring-1 ring-warning/25",
  muted: "bg-muted text-muted-foreground",
  outline: "border border-border text-muted-foreground",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ className, tone = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium leading-none tracking-wide",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
