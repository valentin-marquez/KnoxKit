import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { InstanceCard } from "@/components/instances/instance-card";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Plus, Search } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import * as anim from "@/lib/anim";
import { useCreateInstance, useInstances } from "@/lib/queries";
import type { Branch, Instance } from "@/types/instance";

/** The `layoutId` shared between the trigger button and the dialog panel. */
const MORPH_ID = "create-instance-morph";

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
    <LayoutGroup>
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
          <MorphTrigger open={dialog} onOpen={() => setDialog(true)} label={t("library.new")} />
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
    </LayoutGroup>
  );
}

/**
 * The "New instance" trigger. It carries the shared `layoutId` so that, when
 * `open` flips, `motion` morphs this compact button into the dialog panel
 * (which carries the same id). While open the trigger is unmounted so the
 * single shared element is the panel — that is what produces the morph.
 */
function MorphTrigger({
  open,
  onOpen,
  label,
}: {
  open: boolean;
  onOpen: () => void;
  label: string;
}) {
  if (open) return null;
  return (
    <motion.button
      layoutId={MORPH_ID}
      type="button"
      onClick={onOpen}
      transition={anim.spring}
      style={{ borderRadius: 8 }}
      className="btn btn-primary h-8 gap-1.5 px-3 text-xs"
    >
      <motion.span layout="position" className="flex items-center gap-1.5">
        <Plus size={15} />
        {label}
      </motion.span>
    </motion.button>
  );
}

/** Instances never played sort last. */
function playedRank(i: Instance): number {
  return i.last_played ? new Date(i.last_played).getTime() : 0;
}

/** The three branches the creation dialog offers (P1 — no `Other`). */
type BranchChoice = "Stable" | "Unstable" | "OutdatedUnstable";

function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const create = useCreateInstance();
  const [name, setName] = useState("");
  const [branch, setBranch] = useState<BranchChoice>("Stable");
  const [build, setBuild] = useState("");
  const nameId = useId();
  const buildId = useId();

  const reset = () => {
    setName("");
    setBranch("Stable");
    setBuild("");
  };

  // Close on Escape and lock background scroll while the panel is mounted.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const trimmedBuild = build.trim();
    // `branch` is a string-union that is exactly a unit `Branch` arm; the
    // wire shape is the bare PascalCase string (see src/types/instance.ts).
    const wireBranch: Branch = branch;
    create.mutate(
      {
        name: trimmedName,
        game_version: { branch: wireBranch, build: trimmedBuild === "" ? null : trimmedBuild },
      },
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

  const canSubmit = name.trim() !== "" && !create.isPending;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.button
            type="button"
            aria-label={t("common.cancel")}
            tabIndex={-1}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={anim.snappy}
            className="absolute inset-0 cursor-default bg-black/50"
            onClick={onClose}
          />
          <motion.div
            layoutId={MORPH_ID}
            role="dialog"
            aria-modal="true"
            aria-label={t("library.new")}
            transition={anim.spring}
            style={{ borderRadius: 12 }}
            className="relative w-full max-w-lg overflow-hidden border border-border bg-card p-5 text-card-foreground shadow-2xl"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={anim.snappy}
            >
              <h2 className="text-lg font-semibold leading-none tracking-tight">
                {t("library.new")}
              </h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
                className="mt-4 space-y-3"
              >
                <div className="space-y-1">
                  <label
                    htmlFor={nameId}
                    className="block text-xs font-medium text-muted-foreground"
                  >
                    {t("library.sort.name")}
                  </label>
                  <Input
                    id={nameId}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Hardcore Apocalipsis"
                    autoFocus
                  />
                </div>
                <div className="space-y-1">
                  <span className="block text-xs font-medium text-muted-foreground">
                    {t("create.branch")}
                  </span>
                  <Select
                    label={t("create.branch")}
                    value={branch}
                    onChange={(v) => setBranch(v as BranchChoice)}
                    options={[
                      { value: "Stable", label: t("create.branchStable") },
                      { value: "Unstable", label: t("create.branchUnstable") },
                      { value: "OutdatedUnstable", label: t("create.branchOutdated") },
                    ]}
                    className="w-full"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor={buildId}
                    className="block text-xs font-medium text-muted-foreground"
                  >
                    {t("create.build")}
                  </label>
                  <Input
                    id={buildId}
                    value={build}
                    onChange={(e) => setBuild(e.target.value)}
                    placeholder="41.78.16"
                  />
                  <p className="text-[11px] text-muted-foreground">{t("create.buildHint")}</p>
                </div>
                {/* TODO(review): show a detected-branch-vs-intended warning
                    here once an appmanifest_108600.acf reader exists (no
                    branch detection ships in the backend yet — see
                    docs/instance-redesign.md §1, deferred from P1). */}
                <DialogFooter>
                  <Button variant="outline" size="sm" type="button" onClick={onClose}>
                    {t("common.cancel")}
                  </Button>
                  <Button size="sm" type="submit" disabled={!canSubmit}>
                    {create.isPending ? t("create.creating") : t("common.create")}
                  </Button>
                </DialogFooter>
              </form>
            </motion.div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
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
