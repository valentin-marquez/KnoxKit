import { useTranslation } from "react-i18next";
import { instances, runningCount } from "@/lib/mock";

/** Prism-style bottom status strip — quiet, factual, software. */
export function StatusBar() {
  const { t } = useTranslation();

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between border-t border-border bg-card px-3 font-mono text-[11px] text-muted-foreground">
      <span>
        {runningCount > 0 ? t("topbar.running", { count: runningCount }) : t("topbar.none")}
      </span>
      <span className="flex items-center gap-3">
        <span>{t("library.count", { count: instances.length })}</span>
        <span className="text-border">·</span>
        <span>KnoxKit v2.0.0</span>
      </span>
    </footer>
  );
}
