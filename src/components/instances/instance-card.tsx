import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { InstanceTile } from "@/components/instances/instance-tile";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { ChevronRight, Dots, Play } from "@/components/ui/icons";
import { useDeleteInstance, useInstanceMods } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { Instance } from "@/types/instance";

// Running-state is not tracked on disk yet (see CLAUDE.md rule 2): instances
// always render as "idle". `favorite`/`hours` from the old mock have no
// backend source and are intentionally dropped.
// TODO(review): surface a live "running" dot once the backend tracks it.
const IDLE_DOT = "bg-muted-foreground/50";

export function InstanceCard({ data }: { data: Instance }) {
  const { t } = useTranslation();
  const mods = useInstanceMods(data.id);
  const del = useDeleteInstance();
  const [confirm, setConfirm] = useState(false);

  const modCount = mods.data?.workshop_ids.length ?? 0;
  const lastPlayed = data.last_played
    ? new Date(data.last_played).toLocaleDateString()
    : t("status.never");

  return (
    <>
      <Link
        to="/instances/$id"
        params={{ id: data.id }}
        title={data.name}
        className={cn(
          "group flex items-center gap-3 rounded-xl border border-border bg-card py-2.5 pl-2.5 pr-3",
          "transition-[background-color,border-color] duration-150",
          "hover:border-primary/60 hover:bg-accent/30 active:bg-accent/50",
        )}
      >
        <div className="relative">
          <InstanceTile name={data.name} className="h-12 w-12" />
          <span className="absolute inset-0 grid place-items-center rounded-[0.6rem] bg-black/55 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground">
              <Play size={15} />
            </span>
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span
              title={t("status.idle")}
              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", IDLE_DOT)}
            />
            <h3 className="truncate text-sm font-semibold">{data.name}</h3>
          </div>
          <div className="flex items-center gap-2 overflow-hidden whitespace-nowrap font-mono text-[11px] text-muted-foreground">
            <span className="shrink-0">{data.game_version}</span>
            <span className="text-border">|</span>
            <span className="shrink-0">{t("library.modCount", { count: modCount })}</span>
            <span className="text-border">|</span>
            <span className="truncate">{lastPlayed}</span>
          </div>
        </div>

        <button
          type="button"
          aria-label={t("common.delete")}
          onClick={(e) => {
            e.preventDefault();
            setConfirm(true);
          }}
          className="shrink-0 text-muted-foreground/50 opacity-0 transition-[color,opacity] hover:text-destructive group-hover:opacity-100"
        >
          <Dots size={16} />
        </button>
        <ChevronRight
          size={15}
          className="shrink-0 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground"
        />
      </Link>

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t("common.delete")}
        description={data.name}
      >
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setConfirm(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={del.isPending}
            onClick={() => {
              del.mutate(data.id, { onSettled: () => setConfirm(false) });
            }}
          >
            {t("common.delete")}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
