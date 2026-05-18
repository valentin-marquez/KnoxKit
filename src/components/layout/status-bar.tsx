import { useTranslation } from "react-i18next";
import { useInstances } from "@/lib/queries";

/** Prism-style bottom status strip — quiet, factual, software. */
export function StatusBar() {
  const { t } = useTranslation();
  const { data } = useInstances();
  const count = data?.length ?? 0;
  // Running-state isn't tracked on disk yet — report none until it is.
  const running = 0;

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between border-t border-border bg-card px-3 font-mono text-[11px] text-muted-foreground">
      <span>{running > 0 ? t("topbar.running", { count: running }) : t("topbar.none")}</span>
      <span className="flex items-center gap-3">
        <span>{t("library.count", { count })}</span>
        <span className="text-border">·</span>
        <span>KnoxKit v2.0.0</span>
      </span>
    </footer>
  );
}
