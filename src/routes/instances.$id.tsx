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
      <div className="mx-auto max-w-[1000px] px-7 py-20 text-center">
        <p className="font-typewriter text-sm text-muted-foreground">
          {"// "}
          {t("instance.notFound")}
        </p>
        <Link to="/instances" className="mt-4 inline-block text-sm text-primary hover:underline">
          ← {t("library.title")}
        </Link>
      </div>
    );
  }

  const tabs: Tab[] = ["content", "saves", "logs", "settings"];

  return (
    <div>
      {/* Hero band */}
      <div className="relative overflow-hidden border-b border-border">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: `radial-gradient(80% 140% at 12% 0%, hsl(${instance.hue} 75% 22%), transparent 60%)`,
          }}
        />
        <div className="relative mx-auto flex max-w-[1100px] items-center gap-5 px-7 py-7">
          <InstanceTile
            name={instance.name}
            hue={instance.hue}
            className="h-24 w-24 text-5xl shadow-xl"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge tone={instance.status === "running" ? "success" : "muted"}>
                {t(`status.${instance.status}`)}
              </Badge>
              <Badge tone="outline">{instance.tag}</Badge>
            </div>
            <h1 className="font-display mt-2 truncate text-3xl font-bold tracking-tight">
              {instance.name}
            </h1>
            <p className="mt-1.5 flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <span>{instance.build}</span>
              <span className="text-muted-foreground/40">•</span>
              <span>{t("library.hours", { count: instance.hours })}</span>
              <span className="text-muted-foreground/40">•</span>
              <span>{t("library.modCount", { count: instance.mods })}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" aria-label={t("instance.folder")}>
              <Folder size={18} />
            </Button>
            <Button size="lg" className="gap-2 px-7 text-sm font-semibold">
              <Play size={16} />
              {t("instance.play")}
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mx-auto flex max-w-[1100px] gap-1 px-7">
          {tabs.map((tk) => (
            <button
              key={tk}
              type="button"
              onClick={() => setTab(tk)}
              className={cn(
                "relative px-3.5 py-2.5 text-sm font-medium transition-colors",
                tab === tk ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`instance.tabs.${tk}`)}
              {tab === tk && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-[1100px] px-7 py-6">
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
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("instance.searchContent")}
            className="h-9 rounded-lg pl-9"
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
        <Button variant="outline" size="md" className="gap-2">
          <Refresh size={15} />
          {t("common.refresh")}
        </Button>
        <Button size="md" className="gap-2">
          <Download size={15} />
          {t("instance.browse")}
        </Button>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border">
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
  const hue = ([...mod.id].reduce((a, c) => a + c.charCodeAt(0), 0) % 50) + 5;

  return (
    <div
      className={cn(
        "flex items-center gap-3 bg-card px-3.5 py-2.5 transition-colors hover:bg-accent/40",
        !last && "border-b border-border",
        !enabled && "opacity-55",
      )}
    >
      <InstanceTile name={mod.name} hue={hue} className="h-9 w-9 text-base" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{mod.name}</span>
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
        className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Dots size={16} />
      </button>
    </div>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-border py-24 text-center">
      <p className="font-typewriter text-sm text-muted-foreground">
        {"// "}
        {label.toLowerCase()} — próximamente
      </p>
    </div>
  );
}
