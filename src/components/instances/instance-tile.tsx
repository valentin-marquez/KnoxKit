import { cn } from "@/lib/utils";

/**
 * Procedural instance icon — no image assets. A warm hue-driven gradient
 * with a faint contamination-stripe motif and the instance initials in the
 * display face. Deterministic from `name` + `hue`.
 */
export function InstanceTile({
  name,
  hue,
  className,
}: {
  name: string;
  hue: number;
  className?: string;
}) {
  const initials = name
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-xl ring-1 ring-inset ring-white/10",
        className,
      )}
      style={{
        background: `radial-gradient(120% 120% at 20% 10%, hsl(${hue} 80% 28%), hsl(${
          (hue + 14) % 360
        } 70% 12%) 70%)`,
      }}
      aria-hidden="true"
    >
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage: "repeating-linear-gradient(135deg, #000 0 10px, transparent 10px 22px)",
        }}
      />
      <span
        className="font-display relative font-bold text-white/90"
        style={{ fontSize: "42%", letterSpacing: "-0.02em" }}
      >
        {initials || "PZ"}
      </span>
    </div>
  );
}
