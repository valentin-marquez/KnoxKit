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
    <div className="mx-auto max-w-[1100px] px-7 py-7">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{t("library.title")}</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {t("library.count", { count: instances.length })}
          </p>
        </div>
        <Button size="lg" className="gap-2">
          <Plus size={16} />
          {t("library.new")}
        </Button>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-2.5">
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
        <div className="relative min-w-[200px] flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("library.searchPlaceholder")}
            className="h-9 rounded-lg pl-9"
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

      {list.length === 0 ? (
        <EmptyLibrary />
      ) : (
        <div className="mt-6 space-y-7">
          {groups.map(({ key, items }) => (
            <section key={key}>
              {group !== "none" && (
                <h2 className="mb-2.5 font-typewriter text-xs uppercase tracking-widest text-muted-foreground">
                  {key}
                </h2>
              )}
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
                {items.map((d, idx) => (
                  <InstanceCard key={d.id} data={d} index={idx} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
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
    <div className="mt-20 flex flex-col items-center text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl border border-dashed border-border text-muted-foreground">
        <Search size={24} />
      </div>
      <h2 className="font-display mt-4 text-lg font-semibold">{t("library.emptyTitle")}</h2>
      <p className="mt-2 max-w-sm font-typewriter text-sm text-muted-foreground">
        {t("library.emptyLog")}
      </p>
    </div>
  );
}
