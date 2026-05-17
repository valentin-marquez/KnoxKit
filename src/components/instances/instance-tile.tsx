import { cn } from "@/lib/utils";

/**
 * Instance monogram — flat neutral tile (no game icon available). Two
 * initials in the display face on a plain surface. Deterministic, calm,
 * software-like; the accent lives in the UI, not here.
 */
export function InstanceTile({ name, className }: { name: string; className?: string }) {
  const initials =
    name
      .replace(/[^\p{L}\p{N} ]/gu, "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "PZ";

  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-[0.6rem] border border-border bg-secondary text-secondary-foreground",
        className,
      )}
      aria-hidden="true"
    >
      <span className="font-display font-bold" style={{ fontSize: "40%" }}>
        {initials}
      </span>
    </div>
  );
}
