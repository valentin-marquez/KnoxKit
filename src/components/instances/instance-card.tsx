import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { InstanceTile } from "@/components/instances/instance-tile";
import { Play, Star } from "@/components/ui/icons";
import type { InstanceCard as Data } from "@/lib/mock";
import { cn } from "@/lib/utils";

const STATUS_DOT: Record<Data["status"], string> = {
  idle: "bg-muted-foreground/50",
  running: "bg-success",
  updating: "bg-warning",
};

export function InstanceCard({ data }: { data: Data }) {
  const { t } = useTranslation();
  const [fav, setFav] = useState(data.favorite);

  return (
    <Link
      to="/instances/$id"
      params={{ id: data.id }}
      className={cn(
        "group flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5",
        "transition-[background-color,border-color,box-shadow] duration-150",
        "hover:border-primary/60 hover:bg-accent/25",
        "hover:shadow-[0_4px_14px_-6px_hsl(0_0%_0%/0.5)]",
      )}
    >
      <div className="relative">
        <InstanceTile name={data.name} className="h-12 w-12" />
        <span className="absolute inset-0 grid place-items-center rounded-[0.6rem] bg-black/55 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_2px_6px_-1px_hsl(0_0%_0%/0.5)]">
            <Play size={15} />
          </span>
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[data.status])} />
          <h3 className="truncate text-sm font-semibold">{data.name}</h3>
        </div>
        <div className="flex items-center gap-2 overflow-hidden whitespace-nowrap font-mono text-[11px] text-muted-foreground">
          <span className="shrink-0">{data.build}</span>
          <span className="text-border">|</span>
          <span className="shrink-0">{t("library.modCount", { count: data.mods })}</span>
          <span className="text-border">|</span>
          <span className="truncate">{data.lastPlayed ?? t("status.never")}</span>
        </div>
      </div>

      <button
        type="button"
        aria-label="Favorita"
        onClick={(e) => {
          e.preventDefault();
          setFav((v) => !v);
        }}
        className={cn(
          "shrink-0 transition-colors",
          fav ? "text-primary" : "text-muted-foreground/40 hover:text-muted-foreground",
        )}
      >
        <Star size={16} filled={fav} />
      </button>
    </Link>
  );
}
