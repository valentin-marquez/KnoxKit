import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Folder } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  useDetectGamePath,
  useInstallSteamcmd,
  useSetGamePath,
  useSetupStatus,
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

/** A small "step complete" check badge. */
function DoneBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
      <span aria-hidden>✓</span>
      {label}
    </span>
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
      <div className="w-full max-w-lg space-y-5">
        <header className="space-y-2 text-center">
          <div className="flex justify-center">
            <Brand />
          </div>
          <h1 className="font-display text-xl font-bold">{t("onboarding.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("onboarding.subtitle")}</p>
        </header>

        <GameStep done={gameDone} />
        <SteamcmdStep done={steamcmdDone} />

        <div className="flex justify-end pt-1">
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
        </div>
      </div>
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
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Folder size={18} />
          {t("onboarding.step1Title")}
        </CardTitle>
        {done ? <DoneBadge label={t("onboarding.stepDone")} /> : null}
      </CardHeader>
      <CardContent className="space-y-3">
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
      </CardContent>
    </Card>
  );
}

/** Step 2 — detected-or-Install SteamCMD. Streamed progress is out of scope. */
function SteamcmdStep({ done }: { done: boolean }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const install = useInstallSteamcmd();

  // TODO(review): real streamed install progress is out of scope; the
  // worker/parser already model SteamCMD progress events but wiring the
  // install download itself to emit them is deferred.

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Download size={18} />
          {t("onboarding.step2Title")}
        </CardTitle>
        {done ? <DoneBadge label={t("onboarding.stepDone")} /> : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("onboarding.step2Desc")}</p>
        <p className="text-xs text-muted-foreground">
          {done ? t("onboarding.steamcmdFound") : t("onboarding.steamcmdMissing")}
        </p>

        {done ? null : (
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
        )}
      </CardContent>
    </Card>
  );
}
