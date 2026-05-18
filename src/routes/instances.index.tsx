import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { InstanceCard } from "@/components/instances/instance-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useCreateInstance, useInstances } from "@/lib/queries";
import type { Instance } from "@/types/instance";

export const Route = createFileRoute("/instances/")({
  component: LibraryRoute,
});

// The old mock had `tag`/`favorite` filters; the backend tracks neither, so
// only search + sort survive. Sort options that have a real field: name and
// last-played. "created" maps to `created_at`.
type Sort = "name" | "played" | "created";

function LibraryRoute() {
  const { t } = useTranslation();
  const { data, isLoading, isError, error } = useInstances();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [dialog, setDialog] = useState(false);

  const all = data ?? [];
  const filtering = query.trim() !== "";

  const list = useMemo(() => {
    let out = all;
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter((i) => i.name.toLowerCase().includes(q));
    }
    return [...out].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "played") return playedRank(b) - playedRank(a);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [all, query, sort]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-lg font-bold">{t("library.title")}</h1>
          <span className="font-mono text-xs text-muted-foreground">
            {isLoading
              ? "…"
              : filtering
                ? t("library.results", { count: list.length, total: all.length })
                : t("library.count", { count: all.length })}
          </span>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setDialog(true)}>
          <Plus size={15} />
          {t("library.new")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-2.5">
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
      </div>

      <div className="flex-1 overflow-auto p-5">
        {isLoading ? (
          <Empty title="…" hint={t("library.searchPlaceholder")} />
        ) : isError ? (
          <Empty
            title={t("library.emptyTitle")}
            hint={error instanceof Error ? error.message : String(error)}
          />
        ) : all.length === 0 ? (
          <Empty
            title={t("library.emptyTitle")}
            hint={t("library.emptyHint")}
            action={
              <Button size="sm" onClick={() => setDialog(true)} className="gap-1.5">
                <Plus size={15} />
                {t("library.new")}
              </Button>
            }
          />
        ) : list.length === 0 ? (
          <Empty
            title={t("library.noResults")}
            hint={t("library.noResultsHint")}
            action={
              <Button size="sm" variant="outline" onClick={() => setQuery("")}>
                {t("library.clearFilters")}
              </Button>
            }
          />
        ) : (
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
            {list.map((d) => (
              <InstanceCard key={d.id} data={d} />
            ))}
          </div>
        )}
      </div>

      <CreateDialog open={dialog} onClose={() => setDialog(false)} />
    </div>
  );
}

/** Instances never played sort last. */
function playedRank(i: Instance): number {
  return i.last_played ? new Date(i.last_played).getTime() : 0;
}

function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const create = useCreateInstance();
  const [name, setName] = useState("");
  const [gameVersion, setGameVersion] = useState("");

  const reset = () => {
    setName("");
    setGameVersion("");
  };

  const submit = () => {
    const trimmedName = name.trim();
    const trimmedVersion = gameVersion.trim();
    if (!trimmedName || !trimmedVersion) return;
    create.mutate(
      { name: trimmedName, game_version: trimmedVersion },
      {
        onSuccess: (instance) => {
          toast({ title: t("library.new"), description: instance.name, variant: "success" });
          reset();
          onClose();
        },
        onError: (err) => {
          toast({
            title: t("library.new"),
            description: err instanceof Error ? err.message : String(err),
            variant: "destructive",
          });
        },
      },
    );
  };

  const canSubmit = name.trim() !== "" && gameVersion.trim() !== "" && !create.isPending;

  return (
    <Dialog open={open} onClose={onClose} title={t("library.new")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-3"
      >
        <div className="space-y-1">
          <label
            htmlFor="create-instance-name"
            className="block text-xs font-medium text-muted-foreground"
          >
            {t("library.sort.name")}
          </label>
          <Input
            id="create-instance-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Hardcore Apocalipsis"
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <label
            htmlFor="create-instance-version"
            className="block text-xs font-medium text-muted-foreground"
          >
            {t("instance.build")}
          </label>
          <Input
            id="create-instance-version"
            value={gameVersion}
            onChange={(e) => setGameVersion(e.target.value)}
            placeholder="41.78.16"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" type="button" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button size="sm" type="submit" disabled={!canSubmit}>
            {t("common.create")}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
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
