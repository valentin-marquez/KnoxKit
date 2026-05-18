import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { CheckCircle, Download, Folder, Info } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import * as anim from "@/lib/anim";
import {
  useDetectGamePath,
  useInstallSteamcmd,
  useSetGamePath,
  useSettings,
  useSetupStatus,
  useUpdateSettings,
} from "@/lib/queries";
import * as dialog from "@/lib/tauri/dialog";

export const Route = createFileRoute("/onboarding")({
  component: OnboardingRoute,
});

/** A CSS-only spinner (no spinner icon is exported by the icon set). */
function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]"
    />
  );
}

/** Mount entrance: fade + rise with an elastic settle. */
const rise = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

/**
 * Shared step shell for the progressive stepper. A step is in exactly one of
 * three states:
 *
 * - `locked`  — a prior step is still open. The card is dimmed, dashed and
 *               collapsed (no form, no badge): the user sees what's coming but
 *               can't act on it yet. No step numbers — the dimming is the cue.
 * - active    — neither locked nor done: shows the interactive `children`.
 * - `done`    — collapses the form away and morphs to a compact confirmation
 *               line with an elastic "ready" badge, which unlocks the next
 *               card below.
 */
function StepCard({
  icon,
  title,
  doneLabel,
  done,
  locked = false,
  summary,
  children,
}: {
  icon: ReactNode;
  title: string;
  doneLabel: string;
  done: boolean;
  locked?: boolean;
  summary: ReactNode;
  children: ReactNode;
}) {
  return (
    <motion.div
      layout
      transition={anim.spring}
      variants={rise}
      aria-disabled={locked}
      animate={{ opacity: locked ? 0.5 : 1 }}
      className={`overflow-hidden rounded-xl bg-card text-card-foreground ${
        locked ? "border border-dashed border-border" : "border border-border"
      }`}
    >
      <motion.div layout="position" className="flex items-center justify-between gap-3 p-4">
        <div
          className={`flex items-center gap-2 text-base font-semibold ${
            locked ? "text-muted-foreground" : ""
          }`}
        >
          {icon}
          {title}
        </div>
        <AnimatePresence>
          {done && !locked && (
            <motion.span
              key="badge"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={anim.elastic}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
            >
              <CheckCircle size={14} />
              {doneLabel}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>

      {/*
       * `popLayout` (not `wait`): pop the exiting form out of flow so the
       * summary fades in while the parent `layout` spring drives the height
       * change as one continuous motion. `wait` collapsed the form to 0,
       * paused, then grew back for the summary — a double-bounce that read
       * as the form/step "snapping" in abruptly when a step turned done or
       * a locked step unlocked.
       */}
      <AnimatePresence initial={false} mode="popLayout">
        {locked ? null : done ? (
          <motion.div
            key="summary"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={anim.snappy}
            className="px-4 pb-4 text-xs text-muted-foreground"
          >
            {summary}
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={anim.spring}
            style={{ overflow: "hidden" }}
          >
            <div className="space-y-3 px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function OnboardingRoute() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const setup = useSetupStatus();

  const gameDone = setup.data?.game_path != null;
  const steamcmdDone = setup.data?.steamcmd_path != null;
  const complete = setup.data?.needs_onboarding === false;

  return (
    <div className="flex h-full items-center justify-center overflow-auto p-6">
      <motion.div
        initial="initial"
        animate="animate"
        transition={{ staggerChildren: 0.08 }}
        className="w-full max-w-lg"
      >
        <LayoutGroup>
          <motion.header variants={rise} className="space-y-2 pb-5 text-center">
            <div className="flex justify-center">
              <Brand />
            </div>
            <h1 className="font-display text-xl font-bold">{t("onboarding.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("onboarding.subtitle")}</p>
          </motion.header>

          <div className="space-y-5">
            <GameStep done={gameDone} />
            <SteamcmdStep done={steamcmdDone} locked={!gameDone} />
            <ProfileStep locked={!steamcmdDone} />

            <motion.div layout transition={anim.spring} className="flex justify-end pt-1">
              <Button
                size="lg"
                disabled={!complete}
                onClick={() => {
                  toast({ title: t("onboarding.done"), variant: "success" });
                  void navigate({ to: "/" });
                }}
              >
                {t("onboarding.continue")}
              </Button>
            </motion.div>
          </div>
        </LayoutGroup>
      </motion.div>
    </div>
  );
}

/** Step 1 — auto-detect the PZ install, with a manual Browse fallback. */
function GameStep({ done }: { done: boolean }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const detect = useDetectGamePath();
  const save = useSetGamePath();
  const [path, setPath] = useState("");

  // Auto-run detection once on mount while not yet configured.
  const detectMutate = detect.mutate;
  useEffect(() => {
    if (done) return;
    detectMutate(undefined, {
      onSuccess: (found) => {
        if (found) setPath(found);
      },
    });
  }, [done, detectMutate]);

  async function browse() {
    const picked = await dialog.pickDirectory();
    if (picked != null) setPath(picked);
  }

  function persist() {
    if (path.trim() === "") return;
    save.mutate(path.trim(), {
      onError: () => toast({ title: t("onboarding.errorGame"), variant: "destructive" }),
    });
  }

  return (
    <StepCard
      icon={<Folder size={18} />}
      title={t("onboarding.step1Title")}
      doneLabel={t("onboarding.stepDone")}
      done={done}
      summary={
        <span className="break-all font-mono">{save.variables ?? t("onboarding.detected")}</span>
      }
    >
      <p className="text-sm text-muted-foreground">{t("onboarding.step1Desc")}</p>

      <p className="text-xs text-muted-foreground">
        {detect.isPending
          ? t("onboarding.detecting")
          : detect.data
            ? t("onboarding.detected")
            : t("onboarding.notDetected")}
      </p>

      <div className="flex gap-2">
        <Input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder={t("onboarding.pathPlaceholder")}
          className="h-9 rounded-lg font-mono text-xs"
        />
        <Button variant="outline" size="sm" onClick={() => void browse()}>
          {t("onboarding.browse")}
        </Button>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={detect.isPending}
          onClick={() => detect.mutate(undefined, { onSuccess: (f) => f && setPath(f) })}
        >
          {t("onboarding.redetect")}
        </Button>
        <Button size="sm" disabled={path.trim() === "" || save.isPending} onClick={persist}>
          {save.isPending ? t("onboarding.saving") : t("onboarding.save")}
        </Button>
      </div>
    </StepCard>
  );
}

/** Step 2 — detected-or-Install SteamCMD. Streamed progress is out of scope. */
function SteamcmdStep({ done, locked }: { done: boolean; locked: boolean }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const install = useInstallSteamcmd();

  // TODO(review): real streamed install progress is out of scope; the
  // worker/parser already model SteamCMD progress events but wiring the
  // install download itself to emit them is deferred.

  return (
    <StepCard
      icon={<Download size={18} />}
      title={t("onboarding.step2Title")}
      doneLabel={t("onboarding.stepDone")}
      done={done}
      locked={locked}
      summary={t("onboarding.steamcmdFound")}
    >
      <p className="text-sm text-muted-foreground">{t("onboarding.step2Desc")}</p>
      <p className="text-xs text-muted-foreground">{t("onboarding.steamcmdMissing")}</p>

      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={install.isPending}
          onClick={() =>
            install.mutate(undefined, {
              onError: () =>
                toast({ title: t("onboarding.errorSteamcmd"), variant: "destructive" }),
            })
          }
        >
          {install.isPending ? (
            <span className="flex items-center gap-2">
              <Spinner />
              {t("onboarding.installing")}
            </span>
          ) : (
            t("onboarding.install")
          )}
        </Button>
      </div>
    </StepCard>
  );
}

/**
 * Required, gating profile step. The username feeds the onboarding gate:
 * `needs_onboarding` (and therefore `complete`) is backend-driven and now
 * stays true until a non-empty profile username is persisted, so this card
 * collapsing to "done" tracks the same condition the Continue button does — no
 * separate client gating logic. The name is the authoritative source for every
 * instance's author.
 */
function ProfileStep({ locked }: { locked: boolean }) {
  const { t } = useTranslation();
  const settings = useSettings();
  const update = useUpdateSettings();

  const stored = settings.data?.profile_username ?? "";
  const [name, setName] = useState("");

  // Reflect a previously-saved username (e.g. user came back after a reset).
  useEffect(() => {
    setName(settings.data?.profile_username ?? "");
  }, [settings.data?.profile_username]);

  // The step is satisfied once a non-empty username is persisted — the same
  // condition the backend gate keys off, so this collapse mirrors the gate.
  const done = stored.trim() !== "" && !update.isError;

  function persist() {
    const trimmed = name.trim();
    if (trimmed === "") return;
    update.mutate({ profile_username: trimmed });
  }

  return (
    <StepCard
      icon={<Info size={18} />}
      title={t("onboarding.profileTitle")}
      doneLabel={t("onboarding.stepDone")}
      done={done}
      locked={locked}
      summary={<span className="font-medium text-foreground">{stored}</span>}
    >
      <p className="text-sm text-muted-foreground">{t("onboarding.profileDesc")}</p>

      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") persist();
        }}
        placeholder={t("onboarding.profilePlaceholder")}
        className="h-9 rounded-lg text-sm"
        autoComplete="off"
      />

      <div className="flex justify-end">
        <Button size="sm" disabled={name.trim() === "" || update.isPending} onClick={persist}>
          {update.isPending ? t("onboarding.saving") : t("onboarding.save")}
        </Button>
      </div>
    </StepCard>
  );
}
