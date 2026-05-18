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
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/components/ui/toast";
import { VersionInput } from "@/components/ui/version-input";
import * as anim from "@/lib/anim";
import { useBranches, useCreateInstance, useInstances, useSystemRam } from "@/lib/queries";
import { assetUrl } from "@/lib/tauri/asset";
import { pickFile } from "@/lib/tauri/dialog";
import type { Branch, Instance } from "@/types/instance";

/**
 * One `layoutId` per trigger so the dialog morphs out of the button the user
 * actually clicked. The header button and the empty-state CTA can both be
 * mounted at once (empty library), so they must NOT share an id — the panel
 * picks the matching one via `origin`.
 */
const MORPH_HEADER = "create-instance-morph-header";
const MORPH_EMPTY = "create-instance-morph-empty";

type Origin = "header" | "empty";

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
  // Which button opened the dialog — drives which `layoutId` the panel morphs
  // out of (and back into on close).
  const [origin, setOrigin] = useState<Origin>("header");

  const openFrom = (from: Origin) => {
    setOrigin(from);
    setDialog(true);
  };

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
          <MorphTrigger
            morphId={MORPH_HEADER}
            open={dialog}
            onOpen={() => openFrom("header")}
            label={t("library.new")}
          />
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
                <MorphTrigger
                  morphId={MORPH_EMPTY}
                  open={dialog}
                  onOpen={() => openFrom("empty")}
                  label={t("library.new")}
                />
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

        <CreateDialog
          open={dialog}
          morphId={origin === "empty" ? MORPH_EMPTY : MORPH_HEADER}
          onClose={() => setDialog(false)}
        />
      </div>
    </LayoutGroup>
  );
}

/**
 * The "New instance" trigger. It carries its own `layoutId` (`morphId`) so
 * that, when `open` flips, `motion` morphs this compact button into the dialog
 * panel (which adopts the clicked trigger's id via `origin`). While open the
 * trigger is unmounted so the single shared element is the panel — that is
 * what produces the morph.
 */
function MorphTrigger({
  morphId,
  open,
  onOpen,
  label,
}: {
  morphId: string;
  open: boolean;
  onOpen: () => void;
  label: string;
}) {
  if (open) return null;
  return (
    <motion.button
      layoutId={morphId}
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

/**
 * Localized fallback label for a {@link Branch} — used when Steam supplies no
 * branch description (e.g. `public`). `Other(name)` shows the raw name.
 */
function branchLabelFor(b: Branch, t: (k: string) => string): string {
  if (typeof b === "object") return b.Other;
  switch (b) {
    case "Stable":
      return t("create.branchStable");
    case "Unstable":
      return t("create.branchUnstable");
    case "OutdatedUnstable":
      return t("create.branchOutdated");
  }
}

function CreateDialog({
  open,
  morphId,
  onClose,
}: {
  open: boolean;
  morphId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const create = useCreateInstance();
  const { data: ram } = useSystemRam();
  // Dynamic branch list. The backend always resolves this to a non-empty
  // list (static fallback on any SteamCMD failure), so it never blocks the
  // dialog; while it loads we render the static three locally.
  const { data: branchData } = useBranches();
  const branches: { steam_name: string; branch: Branch; description: string | null }[] =
    branchData && branchData.length > 0
      ? branchData
      : [
          { steam_name: "public", branch: "Stable", description: null },
          { steam_name: "unstable", branch: "Unstable", description: null },
          { steam_name: "outdatedunstable", branch: "OutdatedUnstable", description: null },
        ];
  const [name, setName] = useState("");
  // The selected branch is keyed by its raw Steam name (`public`/`unstable`/…)
  // so it survives the static→dynamic swap and round-trips `Other(name)`.
  const [branchKey, setBranchKey] = useState("public");
  // `null` ⇒ the user has not moved the slider yet; submit then sends the
  // backend default (`max_ram_mb` omitted). Once dragged it holds MB.
  const [ramMb, setRamMb] = useState<number | null>(null);
  // Absolute path to the chosen icon source (copied into the instance on
  // create); empty until the user picks one.
  const [iconPath, setIconPath] = useState("");
  const [description, setDescription] = useState("");
  // `null`/`""` ⇒ pack version not set; the segmented input emits "x.y.z".
  const [packVersion, setPackVersion] = useState<string | null>(null);
  const nameId = useId();
  const descId = useId();

  // Effective slider position in MB: the user's pick, else the machine
  // recommended default, else a safe floor until the snapshot arrives.
  const sliderMb = ramMb ?? ram?.default_mb ?? ram?.min_mb ?? 2048;
  const totalMb = ram?.total_mb ?? sliderMb;
  const ratio = totalMb > 0 ? sliderMb / totalMb : 0;
  const tone: "normal" | "warn" | "danger" =
    ratio > 0.85 ? "danger" : ratio > 0.7 ? "warn" : "normal";
  // The `create.ramOf` locale key formats GB ("{{value}} of {{total}} GB").
  const ramValueText = t("create.ramOf", {
    value: (sliderMb / 1024).toFixed(1).replace(/\.0$/, ""),
    total: (totalMb / 1024).toFixed(1).replace(/\.0$/, ""),
  });

  // The structured `Branch` for the current selection — taken from the loaded
  // list (falls back to `Stable` if the key ever disappears mid-session).
  const selectedBranch: Branch =
    branches.find((b) => b.steam_name === branchKey)?.branch ?? "Stable";

  const reset = () => {
    setName("");
    setBranchKey("public");
    setRamMb(null);
    setIconPath("");
    setDescription("");
    setPackVersion(null);
  };

  const onPickIcon = async () => {
    const picked = await pickFile();
    if (picked) setIconPath(picked);
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
    const trimmedDesc = description.trim();
    const trimmedPackVer = packVersion?.trim() ?? "";
    create.mutate(
      {
        name: trimmedName,
        // `build` is runtime-discovered, not user-authored — always `null`
        // from the create dialog (the field was removed by decision).
        game_version: { branch: selectedBranch, build: null },
        // Only send an explicit cap when the user actually chose one;
        // otherwise the backend applies its machine default (and clamps).
        max_ram_mb: ramMb,
        // Optional modpack identity (P3). Empty ⇒ omit so the backend keeps
        // its defaults. `author` is intentionally NOT collected here — the
        // backend always sets it to the profile username.
        icon_source_path: iconPath === "" ? null : iconPath,
        description: trimmedDesc === "" ? null : trimmedDesc,
        pack_version: trimmedPackVer === "" ? null : trimmedPackVer,
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
            layoutId={morphId}
            role="dialog"
            aria-modal="true"
            aria-label={t("library.new")}
            // Layout (size/radius) rides the spring; the blur runs as a short
            // tween so the button→panel deformation is smeared out and never
            // reads as a stretch, then resolves fully sharp.
            initial={{ filter: "blur(14px)" }}
            animate={{ filter: "blur(0px)" }}
            exit={{ filter: "blur(14px)" }}
            transition={{ ...anim.spring, filter: { duration: 0.26, ease: "easeOut" } }}
            style={{ borderRadius: 12 }}
            className="relative w-full max-w-lg overflow-hidden border border-border bg-card p-5 text-card-foreground shadow-2xl"
          >
            <motion.div
              initial={{ opacity: 0, filter: "blur(8px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: "blur(8px)" }}
              transition={{ ...anim.snappy, filter: { duration: 0.26, ease: "easeOut" } }}
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
                    value={branchKey}
                    onChange={(v) => setBranchKey(v)}
                    options={branches.map((b) => ({
                      value: b.steam_name,
                      // Prefer Valve's own description (e.g. "Latest Build
                      // 42 - UNSTABLE - BACKUP FIRST"); fall back to the
                      // localized branch label when absent (e.g. public).
                      label: b.description ?? branchLabelFor(b.branch, t),
                    }))}
                    className="w-full"
                  />
                  <p className="text-[11px] text-muted-foreground">{t("create.branchHint")}</p>
                </div>
                <div className="space-y-1">
                  <span className="block text-xs font-medium text-muted-foreground">
                    {t("create.icon")}
                  </span>
                  <div className="flex items-center gap-3">
                    {iconPath ? (
                      // `convertFileSrc` preview is allowed in this wrapper
                      // layer pattern (assetUrl is the tiny @/lib/tauri
                      // wrapper). It only renders if the asset-protocol scope
                      // covers the picked path; the filename below is the
                      // guaranteed fallback. See NOTES.md.
                      <img
                        src={assetUrl(iconPath)}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-[0.6rem] border border-border object-cover"
                      />
                    ) : (
                      <div
                        aria-hidden="true"
                        className="grid h-12 w-12 shrink-0 place-items-center rounded-[0.6rem] border border-dashed border-border text-muted-foreground"
                      >
                        <Plus size={16} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <Button type="button" variant="outline" size="sm" onClick={onPickIcon}>
                        {t("create.pickIcon")}
                      </Button>
                      {iconPath ? (
                        <p className="mt-1 truncate text-[11px] text-muted-foreground">
                          {iconPath.split(/[/\\]/).pop()}
                        </p>
                      ) : (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {t("create.iconHint")}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor={descId}
                    className="block text-xs font-medium text-muted-foreground"
                  >
                    {t("create.description")}
                  </label>
                  <Input
                    id={descId}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t("create.descriptionPlaceholder")}
                  />
                </div>
                <div className="space-y-1">
                  <VersionInput
                    label={t("create.packVersion")}
                    value={packVersion}
                    onChange={setPackVersion}
                  />
                  <p className="text-[11px] text-muted-foreground">{t("create.packVersionHint")}</p>
                </div>
                <div className="space-y-1">
                  <Slider
                    label={t("create.ram")}
                    valueText={ramValueText}
                    value={sliderMb}
                    min={ram?.min_mb ?? 2048}
                    max={totalMb}
                    step={512}
                    tone={tone}
                    disabled={!ram}
                    onChange={setRamMb}
                  />
                  <p className="text-[11px] text-muted-foreground">{t("create.ramHint")}</p>
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
