import { cn } from "@/lib/utils";

/** KnoxKit mark — an ember-lit crate "K" in the display face. */
export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="relative grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_0_18px_-4px_hsl(var(--primary)/0.7)]">
        <span className="font-display text-lg font-extrabold leading-none">K</span>
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-warning ring-2 ring-card" />
      </div>
      {compact ? null : (
        <div className="leading-tight">
          <div className="font-display text-[15px] font-bold tracking-tight">KnoxKit</div>
          <div className="font-typewriter text-[10px] text-muted-foreground">survival kit</div>
        </div>
      )}
    </div>
  );
}
