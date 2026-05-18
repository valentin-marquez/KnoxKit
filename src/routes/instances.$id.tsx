import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { InstanceIcon } from "@/components/instances/instance-icon";
import { InstanceTile } from "@/components/instances/instance-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Folder, Play, Refresh, Search } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { Toggle } from "@/components/ui/toggle";
import {
  useInstance,
  useInstanceMods,
  useLaunchInstance,
  useSetInstanceIcon,
  useToggleMod,
} from "@/lib/queries";
import { pickFile } from "@/lib/tauri/dialog";
import { cn } from "@/lib/utils";
import { gameVersionLabel, type Id } from "@/types/instance";
import type { ModEntry } from "@/types/mod-collection";

export const Route = createFileRoute("/instances/$id")({
  component: InstanceDetailRoute,
});

type Tab = "content" | "saves" | "logs" | "settings";
type ContentFilter = "all" | "enabled" | "disabled";

function InstanceDetailRoute() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { id } = Route.useParams();
  const { data: instance, isLoading, isError } = useInstance(id);
  const launch = useLaunchInstance();
  const setIcon = useSetInstanceIcon();
  const [tab, setTab] = useState<Tab>("content");

  const onChangeIcon = async () => {
    const picked = await pickFile();
    if (!picked) return;
    setIcon.mutate(
      { id, srcPath: picked },
      {
        onSuccess: () =>
          toast({
            title: t("instance.icon"),
            description: t("instance.iconSet"),
            variant: "success",
          }),
        onError: (err) =>
          toast({
            title: t("instance.icon"),
            description: err instanceof Error ? err.message : String(err),
            variant: "destructive",
          }),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
        …
      </div>
    );
  }

  if (isError || !instance) {
    return (
      <div className="grid h-full place-items-center text-center">
        <div>
          <p className="text-sm text-muted-foreground">{t("instance.notFound")}</p>
          <Link to="/instances" className="mt-3 inline-block text-sm text-primary hover:underline">
            ← {t("library.title")}
          </Link>
        </div>
      </div>
    );
  }

  const tabs: Tab[] = ["content", "saves", "logs", "settings"];
  const lastPlayed = instance.last_played
    ? new Date(instance.last_played).toLocaleString()
    : t("status.never");

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 pt-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onChangeIcon}
            disabled={setIcon.isPending}
            aria-label={t("instance.changeIcon")}
            title={t("instance.changeIcon")}
            className="group/icon relative shrink-0 rounded-[0.6rem] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <InstanceIcon instance={instance} className="h-16 w-16" />
            <span className="absolute inset-0 grid place-items-center rounded-[0.6rem] bg-black/55 text-[10px] font-medium text-white opacity-0 transition-opacity duration-150 group-hover/icon:opacity-100">
              {setIcon.isPending ? "…" : t("instance.changeIcon")}
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display truncate text-xl font-bold">{instance.name}</h1>
            <p className="mt-1 flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <span>{gameVersionLabel(instance.game_version)}</span>
              <span className="text-border">·</span>
              <span>{lastPlayed}</span>
              {instance.author ? (
                <>
                  <span className="text-border">·</span>
                  <span>{t("instance.by", { author: instance.author })}</span>
                </>
              ) : null}
              {instance.pack_version ? (
                <>
                  <span className="text-border">·</span>
                  <span>v{instance.pack_version}</span>
                </>
              ) : null}
              {/* Running-state isn't tracked on disk yet — always idle. */}
              <Badge tone="muted">{t("status.idle")}</Badge>
            </p>
            {instance.description ? (
              <p className="mt-1 truncate text-xs text-muted-foreground">{instance.description}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" aria-label={t("instance.folder")}>
              <Folder size={17} />
            </Button>
            <Button
              size="md"
              className="gap-2 px-6"
              disabled={launch.isPending}
              onClick={() =>
                launch.mutate(instance.id, {
                  onError: (err) =>
                    toast({
                      title: t("instance.play"),
                      description: err instanceof Error ? err.message : String(err),
                      variant: "destructive",
                    }),
                })
              }
            >
              <Play size={15} />
              {t("instance.play")}
            </Button>
          </div>
        </div>

        <div className="mt-3 flex gap-0.5">
          {tabs.map((tk) => (
            <button
              key={tk}
              type="button"
              onClick={() => setTab(tk)}
              className={cn(
                "relative px-3 py-2 text-[13px] font-medium",
                tab === tk ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`instance.tabs.${tk}`)}
              {tab === tk && <span className="absolute inset-x-2 -bottom-px h-0.5 bg-primary" />}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5">
        {tab === "content" ? (
          <ContentTab id={instance.id} />
        ) : (
          <Placeholder label={t(`instance.tabs.${tab}`)} />
        )}
      </div>
    </div>
  );
}

function ContentTab({ id }: { id: Id }) {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch, isFetching } = useInstanceMods(id);
  const [filter, setFilter] = useState<ContentFilter>("all");
  const [query, setQuery] = useState("");

  const entries = (data?.mods ?? []).filter((m) => {
    if (filter === "enabled" && !m.enabled) return false;
    if (filter === "disabled" && m.enabled) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      const hit =
        String(m.workshop_id).includes(q) || m.mod_ids.some((mid) => mid.toLowerCase().includes(q));
      if (!hit) return false;
    }
    return true;
  });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("instance.searchContent")}
            className="h-8 rounded-lg pl-8"
          />
        </div>
        <Segmented
          value={filter}
          onChange={(v) => setFilter(v as ContentFilter)}
          options={[
            { value: "all", label: t("instance.contentFilter.all") },
            { value: "enabled", label: t("instance.contentFilter.enabled") },
            { value: "disabled", label: t("instance.contentFilter.disabled") },
          ]}
        />
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={isFetching}
          onClick={() => refetch()}
        >
          <Refresh size={14} />
          {t("common.refresh")}
        </Button>
      </div>

      {isLoading ? (
        <div className="mt-3 rounded-md border border-border py-16 text-center text-sm text-muted-foreground">
          …
        </div>
      ) : isError ? (
        <div className="mt-3 rounded-md border border-border py-16 text-center text-sm text-muted-foreground">
          {t("instance.notFound")}
        </div>
      ) : entries.length === 0 ? (
        <div className="mt-3 rounded-md border border-border py-16 text-center text-sm text-muted-foreground">
          {t("library.modCount", { count: 0 })}
        </div>
      ) : (
        <div className="mt-3 overflow-hidden rounded-md border border-border">
          {entries.map((m, idx) => (
            <ModItem key={m.workshop_id} id={id} mod={m} last={idx === entries.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function ModItem({ id, mod, last }: { id: Id; mod: ModEntry; last: boolean }) {
  const toggle = useToggleMod(id);
  // Workshop item names/versions aren't resolved yet — show the workshop id
  // and the mod ids it provides. TODO(review): hydrate names once the
  // backend resolves workshop metadata.
  const label = mod.mod_ids[0] ?? String(mod.workshop_id);

  return (
    <div
      className={cn(
        "flex items-center gap-3 bg-card px-3 py-2 hover:bg-accent/40",
        !last && "border-b border-border",
        !mod.enabled && "opacity-50",
      )}
    >
      <InstanceTile name={label} className="h-8 w-8" />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{label}</span>
        <span className="font-mono text-xs text-muted-foreground">#{mod.workshop_id}</span>
      </div>
      <Toggle
        checked={mod.enabled}
        disabled={toggle.isPending}
        onChange={(next) => toggle.mutate({ workshopId: mod.workshop_id, enabled: next })}
        label={label}
      />
    </div>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="grid place-items-center rounded-md border border-border py-20 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}
