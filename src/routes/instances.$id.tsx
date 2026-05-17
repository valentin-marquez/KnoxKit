import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { InstanceTile } from "@/components/instances/instance-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dots, Download, Folder, Play, Refresh, Search } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Toggle } from "@/components/ui/toggle";
import { findInstance, type ModRow as Mod, modsFor } from "@/lib/mock";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/instances/$id")({
  component: InstanceDetailRoute,
});

type Tab = "content" | "saves" | "logs" | "settings";
type ContentFilter = "all" | "enabled" | "disabled" | "updates";

function InstanceDetailRoute() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const instance = findInstance(id);
  const [tab, setTab] = useState<Tab>("content");

  if (!instance) {
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

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 pt-4">
        <div className="flex items-center gap-4">
          <InstanceTile name={instance.name} className="h-16 w-16" />
          <div className="min-w-0 flex-1">
            <h1 className="font-display truncate text-xl font-bold">{instance.name}</h1>
            <p className="mt-1 flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <span>{instance.build}</span>
              <span className="text-border">·</span>
              <span>{t("library.hours", { count: instance.hours })}</span>
              <span className="text-border">·</span>
              <span>{t("library.modCount", { count: instance.mods })}</span>
              <Badge tone={instance.status === "running" ? "success" : "muted"}>
                {t(`status.${instance.status}`)}
              </Badge>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" aria-label={t("instance.folder")}>
              <Folder size={17} />
            </Button>
            <Button size="md" className="gap-2 px-6">
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

function ContentTab({ id }: { id: string }) {
  const { t } = useTranslation();
  const baseMods = useMemo(() => modsFor(id), [id]);
  const [filter, setFilter] = useState<ContentFilter>("all");
  const [query, setQuery] = useState("");

  const mods = baseMods.filter((m) => {
    if (filter === "enabled" && !m.enabled) return false;
    if (filter === "disabled" && m.enabled) return false;
    if (filter === "updates" && !m.hasUpdate) return false;
    if (query.trim() && !m.name.toLowerCase().includes(query.toLowerCase())) return false;
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
            className="h-8 rounded pl-8"
          />
        </div>
        <Segmented
          value={filter}
          onChange={(v) => setFilter(v as ContentFilter)}
          options={[
            { value: "all", label: t("instance.contentFilter.all") },
            { value: "enabled", label: t("instance.contentFilter.enabled") },
            { value: "disabled", label: t("instance.contentFilter.disabled") },
            { value: "updates", label: t("instance.contentFilter.updates") },
          ]}
        />
        <Button variant="outline" size="sm" className="gap-1.5">
          <Refresh size={14} />
          {t("common.refresh")}
        </Button>
        <Button size="sm" className="gap-1.5">
          <Download size={14} />
          {t("instance.browse")}
        </Button>
      </div>

      <div className="mt-3 overflow-hidden rounded-md border border-border">
        {mods.map((m, idx) => (
          <ModItem key={m.id} mod={m} last={idx === mods.length - 1} />
        ))}
      </div>
    </div>
  );
}

function ModItem({ mod, last }: { mod: Mod; last: boolean }) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(mod.enabled);

  return (
    <div
      className={cn(
        "flex items-center gap-3 bg-card px-3 py-2 hover:bg-accent/40",
        !last && "border-b border-border",
        !enabled && "opacity-50",
      )}
    >
      <InstanceTile name={mod.name} className="h-8 w-8" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium">{mod.name}</span>
          {mod.hasUpdate && <Badge tone="warning">update</Badge>}
        </div>
        <span className="text-xs text-muted-foreground">
          {t("instance.by", { author: mod.author })}
        </span>
      </div>
      <span className="font-mono text-xs text-muted-foreground">{mod.version}</span>
      <Toggle checked={enabled} onChange={setEnabled} label={mod.name} />
      <button
        type="button"
        aria-label="Más"
        className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Dots size={16} />
      </button>
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
