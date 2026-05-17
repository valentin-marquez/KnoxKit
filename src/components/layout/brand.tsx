import { cn } from "@/lib/utils";

/** KnoxKit mark — a solid orange crate "K" in the display face. */
export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
        <span className="font-display text-base font-extrabold leading-none">K</span>
      </div>
      {compact ? null : (
        <span className="font-display text-[15px] font-bold tracking-tight">KnoxKit</span>
      )}
    </div>
  );
}
