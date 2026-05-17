import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { InstanceTile } from "@/components/instances/instance-tile";
import { Badge } from "@/components/ui/badge";
import { Play, Star } from "@/components/ui/icons";
import type { InstanceCard as Data } from "@/lib/mock";
import { cn } from "@/lib/utils";

const STATUS_TONE = {
  idle: "muted",
  running: "success",
  updating: "warning",
} as const;

export function InstanceCard({ data, index = 0 }: { data: Data; index?: number }) {
  const { t } = useTranslation();
  const [fav, setFav] = useState(data.favorite);

  return (
    <Link
      to="/instances/$id"
      params={{ id: data.id }}
      className={cn(
        "rise group relative flex gap-3.5 rounded-xl border border-border bg-card p-3.5",
        "transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40",
        "hover:shadow-[0_8px_30px_-12px_hsl(var(--primary)/0.35)]",
      )}
      style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}
    >
      <div className="relative">
        <InstanceTile name={data.name} hue={data.hue} className="h-16 w-16 text-3xl" />
        <span className="absolute inset-0 grid place-items-center rounded-xl bg-black/45 opacity-0 backdrop-blur-[1px] transition-opacity duration-200 group-hover:opacity-100">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">
            <Play size={16} />
          </span>
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display truncate text-[15px] font-semibold leading-tight">
            {data.name}
          </h3>
          <button
            type="button"
            aria-label="Favorita"
            onClick={(e) => {
              e.preventDefault();
              setFav((v) => !v);
            }}
            className={cn(
              "shrink-0 transition-colors",
              fav ? "text-warning" : "text-muted-foreground/40 hover:text-muted-foreground",
            )}
          >
            <Star size={16} filled={fav} />
          </button>
        </div>

        <span className="font-mono text-[11px] text-muted-foreground">{data.build}</span>

        <div className="mt-auto flex flex-wrap items-center gap-x-1.5 gap-y-1 pt-2.5">
          <Badge tone={STATUS_TONE[data.status]}>
            {data.status === "running" && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
            {t(`status.${data.status}`)}
          </Badge>
          <Badge tone="outline">{t("library.modCount", { count: data.mods })}</Badge>
          <span className="ml-auto truncate font-mono text-[11px] text-muted-foreground">
            {data.lastPlayed ?? t("status.never")}
          </span>
        </div>
      </div>
    </Link>
  );
}
