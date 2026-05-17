import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { InstanceCard } from "@/components/instances/instance-card";
import { Button } from "@/components/ui/button";
import { ChevronDown, Plus, Search } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { type InstanceCard as Data, instances } from "@/lib/mock";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/instances/")({
  component: LibraryRoute,
});

type Filter = "all" | "modpacks" | "favorites" | "servers";
type Sort = "name" | "played" | "created";
type Group = "none" | "build" | "tag";

function LibraryRoute() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [group, setGroup] = useState<Group>("none");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const filtering = filter !== "all" || query.trim() !== "";

  const list = useMemo(() => {
    let out = instances.filter((i) => {
      if (filter === "modpacks") return i.tag === "modpack";
      if (filter === "servers") return i.tag === "server";
      if (filter === "favorites") return i.favorite;
      return true;
    });
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter((i) => i.name.toLowerCase().includes(q));
    }
    return [...out].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "played") return b.hours - a.hours;
      return 0;
    });
  }, [filter, query, sort]);

  const groups = useMemo(() => groupBy(list, group), [list, group]);

  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const resetFilters = () => {
    setFilter("all");
    setQuery("");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-lg font-bold">{t("library.title")}</h1>
          <span className="font-mono text-xs text-muted-foreground">
            {filtering
              ? t("library.results", { count: list.length, total: instances.length })
              : t("library.count", { count: instances.length })}
          </span>
        </div>
        <Button size="sm" className="gap-1.5">
          <Plus size={15} />
          {t("library.new")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-2.5">
        <Segmented
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          options={[
            { value: "all", label: t("library.filter.all") },
            { value: "modpacks", label: t("library.filter.modpacks") },
            { value: "favorites", label: t("library.filter.favorites") },
            { value: "servers", label: t("library.filter.servers") },
          ]}
        />
        <div className="relative min-w-[180px] flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("library.searchPlaceholder")}
            className="h-8 rounded-lg pl-8"
          />
        </div>
        <Select
          label={t("library.sortBy")}
          value={sort}
          onChange={(v) => setSort(v as Sort)}
          options={[
            { value: "name", label: t("library.sort.name") },
            { value: "played", label: t("library.sort.played") },
            { value: "created", label: t("library.sort.created") },
          ]}
        />
        <Select
          label={t("library.groupBy")}
          value={group}
          onChange={(v) => setGroup(v as Group)}
          options={[
            { value: "none", label: t("library.group.none") },
            { value: "build", label: t("library.group.build") },
            { value: "tag", label: t("library.group.tag") },
          ]}
        />
      </div>

      <div className="flex-1 overflow-auto p-5">
        {instances.length === 0 ? (
          <Empty title={t("library.emptyTitle")} hint={t("library.emptyHint")} />
        ) : list.length === 0 ? (
          <Empty
            title={t("library.noResults")}
            hint={t("library.noResultsHint")}
            action={
              <Button size="sm" variant="outline" onClick={resetFilters}>
                {t("library.clearFilters")}
              </Button>
            }
          />
        ) : (
          <div className="space-y-5">
            {groups.map(({ key, items }) => {
              const isCollapsed = collapsed.has(key);
              return (
                <section key={key}>
                  {group !== "none" && (
                    <button
                      type="button"
                      onClick={() => toggleGroup(key)}
                      className="mb-2 flex w-full items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                    >
                      <ChevronDown
                        size={14}
                        className={cn("transition-transform", isCollapsed && "-rotate-90")}
                      />
                      <span>{groupLabel(key, group, t)}</span>
                      <span className="font-mono font-normal normal-case text-muted-foreground/60">
                        {items.length}
                      </span>
                      <span className="ml-1 h-px flex-1 bg-border" />
                    </button>
                  )}
                  {!isCollapsed && (
                    <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
                      {items.map((d) => (
                        <InstanceCard key={d.id} data={d} />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function groupBy(list: Data[], group: Group): { key: string; items: Data[] }[] {
  if (group === "none") return [{ key: "all", items: list }];
  const map = new Map<string, Data[]>();
  for (const item of list) {
    const key = group === "build" ? item.build : item.tag;
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return [...map.entries()].map(([key, items]) => ({ key, items }));
}

function groupLabel(key: string, group: Group, t: (k: string) => string): string {
  if (group !== "tag") return key;
  const map: Record<string, string> = {
    modpack: t("library.filter.modpacks"),
    server: t("library.filter.servers"),
    custom: t("library.group.custom"),
  };
  return map[key] ?? key;
}

function Empty({ title, hint, action }: { title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="grid h-full place-items-center">
      <div className="flex max-w-xs flex-col items-center text-center">
        <div className="grid h-12 w-12 place-items-center rounded-xl border border-border text-muted-foreground">
          <Search size={20} />
        </div>
        <h2 className="mt-3 text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}
