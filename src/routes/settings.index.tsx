import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Brand } from "@/components/layout/brand";
import { type Theme, useTheme } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export const Route = createFileRoute("/settings/")({
  component: SettingsRoute,
});

function SettingsRoute() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();

  return (
    <div className="mx-auto max-w-[760px] px-7 py-7">
      <h1 className="font-display text-2xl font-bold tracking-tight">{t("settings.title")}</h1>

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

      <Section title={t("settings.paths")}>
        <Row label={t("settings.steamcmd")}>
          <div className="flex w-full max-w-sm gap-2">
            <Input
              defaultValue="tools/steamcmd/steamcmd.exe"
              className="h-9 rounded-lg font-mono text-xs"
            />
            <Button variant="outline" size="md">
              {t("settings.browse")}
            </Button>
          </div>
        </Row>
        <Row label={t("settings.gamePath")}>
          <div className="flex w-full max-w-sm gap-2">
            <Input
              placeholder="C:\\…\\steamapps\\common\\ProjectZomboid"
              className="h-9 rounded-lg font-mono text-xs"
            />
            <Button variant="outline" size="md">
              {t("settings.browse")}
            </Button>
          </div>
        </Row>
        <Row label={t("settings.defaultArgs")}>
          <Input
            defaultValue="-Xms2g -Xmx4g"
            className="h-9 max-w-sm rounded-lg font-mono text-xs"
          />
        </Row>
      </Section>

      <Section title={t("settings.about")}>
        <div className="flex items-center justify-between">
          <Brand />
          <span className="font-mono text-xs text-muted-foreground">{t("settings.version")}</span>
        </div>
        <p className="mt-3 font-typewriter text-xs text-muted-foreground">
          {"// "}
          {t("settings.tagline")}
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5">
      <h2 className="font-typewriter text-xs uppercase tracking-widest text-muted-foreground">
        {title}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}
