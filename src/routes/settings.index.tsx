import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Brand } from "@/components/layout/brand";
import { type Theme, useTheme } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import * as anim from "@/lib/anim";
import { useResetSetup, useSettings, useUpdateSettings } from "@/lib/queries";
import * as dialog from "@/lib/tauri/dialog";
import type { Patch } from "@/types/settings";

export const Route = createFileRoute("/settings/")({
  component: SettingsRoute,
});

interface PathsDraft {
  steamcmd_path: string;
  game_path: string;
  default_jvm_args: string;
}

function SettingsRoute() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-3">
        <h1 className="font-display text-lg font-bold">{t("settings.title")}</h1>
      </div>

      <div className="flex-1 overflow-auto p-5">
        <div className="mx-auto max-w-2xl space-y-4">
          <Section title={t("settings.appearance")}>
            <Row label={t("settings.theme")}>
              <Select
                value={theme}
                onChange={(v) => setTheme(v as Theme)}
                options={[
                  { value: "dark", label: t("theme.dark") },
                  { value: "light", label: t("theme.light") },
                  { value: "system", label: t("theme.system") },
                ]}
              />
            </Row>
            <Row label={t("settings.locale")}>
              <Select
                value={i18n.language.startsWith("es") ? "es-CL" : "en"}
                onChange={(v) => void i18n.changeLanguage(v)}
                options={[
                  { value: "es-CL", label: "Español (Chile)" },
                  { value: "en", label: "English" },
                ]}
              />
            </Row>
          </Section>

          <PathsSection />

          <Section title={t("settings.about")}>
            <div className="flex items-center justify-between">
              <Brand />
              <span className="font-mono text-xs text-muted-foreground">
                {t("settings.version")}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t("settings.tagline")}</p>
          </Section>

          <DangerSection />
        </div>
      </div>
    </div>
  );
}

function PathsSection() {
  const { t } = useTranslation();
  const settings = useSettings();
  const update = useUpdateSettings();

  const [draft, setDraft] = useState<PathsDraft | null>(null);

  // Seed/refresh the editable draft whenever the persisted settings change.
  useEffect(() => {
    if (settings.data) {
      setDraft({
        steamcmd_path: settings.data.steamcmd_path ?? "",
        game_path: settings.data.game_path ?? "",
        default_jvm_args: settings.data.default_jvm_args.join(" "),
      });
    }
  }, [settings.data]);

  const dirty =
    draft != null &&
    settings.data != null &&
    (draft.steamcmd_path !== (settings.data.steamcmd_path ?? "") ||
      draft.game_path !== (settings.data.game_path ?? "") ||
      draft.default_jvm_args !== settings.data.default_jvm_args.join(" "));

  function onSave() {
    if (!draft) return;
    const patch: Patch = {
      steamcmd_path: draft.steamcmd_path.trim() === "" ? null : draft.steamcmd_path.trim(),
      game_path: draft.game_path.trim() === "" ? null : draft.game_path.trim(),
      default_jvm_args: draft.default_jvm_args
        .split(" ")
        .map((a) => a.trim())
        .filter((a) => a.length > 0),
    };
    update.mutate(patch);
  }

  async function browseSteamcmd() {
    const picked = await dialog.pickFile();
    if (picked != null) setDraft((d) => (d ? { ...d, steamcmd_path: picked } : d));
  }

  async function browseGamePath() {
    const picked = await dialog.pickDirectory();
    if (picked != null) setDraft((d) => (d ? { ...d, game_path: picked } : d));
  }

  if (settings.isPending) {
    return (
      <Section title={t("settings.paths")}>
        <p className="text-xs text-muted-foreground">{t("settings.loading")}</p>
      </Section>
    );
  }

  if (settings.isError || !draft) {
    return (
      <Section title={t("settings.paths")}>
        <p className="text-xs text-destructive">{t("settings.loadError")}</p>
      </Section>
    );
  }

  return (
    <Section title={t("settings.paths")}>
      <Row label={t("settings.steamcmd")}>
        <div className="flex w-full max-w-sm gap-2">
          <Input
            value={draft.steamcmd_path}
            onChange={(e) => setDraft({ ...draft, steamcmd_path: e.target.value })}
            placeholder="tools/steamcmd/steamcmd.exe"
            className="h-8 rounded-lg font-mono text-xs"
          />
          <Button variant="outline" size="sm" onClick={() => void browseSteamcmd()}>
            {t("settings.browse")}
          </Button>
        </div>
      </Row>
      <Row label={t("settings.gamePath")}>
        <div className="flex w-full max-w-sm gap-2">
          <Input
            value={draft.game_path}
            onChange={(e) => setDraft({ ...draft, game_path: e.target.value })}
            placeholder="C:\\…\\steamapps\\common\\ProjectZomboid"
            className="h-8 rounded-lg font-mono text-xs"
          />
          <Button variant="outline" size="sm" onClick={() => void browseGamePath()}>
            {t("settings.browse")}
          </Button>
        </div>
      </Row>
      <Row label={t("settings.defaultArgs")}>
        <Input
          value={draft.default_jvm_args}
          onChange={(e) => setDraft({ ...draft, default_jvm_args: e.target.value })}
          placeholder="-Xms2g -Xmx4g"
          className="h-8 max-w-sm rounded-lg font-mono text-xs"
        />
      </Row>
      <div className="flex items-center justify-end gap-3 pt-1">
        {update.isError && (
          <span className="text-xs text-destructive">{t("settings.saveError")}</span>
        )}
        <Button size="sm" onClick={onSave} disabled={!dirty || update.isPending}>
          {update.isPending ? t("settings.saving") : t("settings.save")}
        </Button>
      </div>
    </Section>
  );
}

/** Destructive: wipe app config and bounce back to first-run onboarding. */
function DangerSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const reset = useResetSetup();
  const [confirming, setConfirming] = useState(false);

  function doReset() {
    reset.mutate(undefined, {
      onSuccess: () => {
        setConfirming(false);
        void navigate({ to: "/onboarding" });
      },
      onError: () => toast({ title: t("settings.saveError"), variant: "destructive" }),
    });
  }

  return (
    <section className="rounded-md border border-destructive/40 bg-card p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-destructive">
        {t("settings.dangerZone")}
      </h2>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-sm text-xs text-muted-foreground">{t("settings.resetAppDesc")}</p>
        <AnimatePresence mode="wait" initial={false}>
          {confirming ? (
            <motion.div
              key="confirm"
              layout
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={anim.snappy}
              className="flex items-center gap-2"
            >
              <Button
                variant="ghost"
                size="sm"
                disabled={reset.isPending}
                onClick={() => setConfirming(false)}
              >
                {t("settings.resetCancel")}
              </Button>
              <Button variant="destructive" size="sm" disabled={reset.isPending} onClick={doReset}>
                {reset.isPending ? t("settings.resetting") : t("settings.resetConfirm")}
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              layout
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={anim.snappy}
            >
              <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
                {t("settings.resetApp")}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-card p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-[13px] font-medium">{label}</span>
      {children}
    </div>
  );
}
