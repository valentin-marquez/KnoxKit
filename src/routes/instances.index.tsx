import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { InstanceCard } from "@/components/instances/instance-card";
import { Button } from "@/components/ui/button";
import { Plus, Search } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { type InstanceCard as Data, instances } from "@/lib/mock";

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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-lg font-bold">{t("library.title")}</h1>
          <span className="font-mono text-xs text-muted-foreground">
            {t("library.count", { count: instances.length })}
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
        {list.length === 0 ? (
          <EmptyLibrary />
        ) : (
          <div className="space-y-6">
            {groups.map(({ key, items }) => (
              <section key={key}>
                {group !== "none" && (
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {key}
                  </h2>
                )}
                <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
                  {items.map((d) => (
                    <InstanceCard key={d.id} data={d} />
                  ))}
                </div>
              </section>
            ))}
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

function EmptyLibrary() {
  const { t } = useTranslation();
  return (
    <div className="grid h-full place-items-center">
      <div className="flex flex-col items-center text-center">
        <div className="grid h-12 w-12 place-items-center rounded-md border border-border text-muted-foreground">
          <Search size={20} />
        </div>
        <h2 className="mt-3 text-sm font-semibold">{t("library.emptyTitle")}</h2>
      </div>
    </div>
  );
}
