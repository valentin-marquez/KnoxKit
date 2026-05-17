import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "@/components/ui/icons";
import { findInstance, runningCount } from "@/lib/mock";
import { cn } from "@/lib/utils";

interface Crumb {
  label: string;
  to?: string;
}

export function Topbar() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const crumbs = buildCrumbs(pathname, t);
  const running = runningCount > 0;

  return (
    <header className="relative z-10 flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/40 px-4 backdrop-blur">
      <div className="flex items-center gap-1">
        <div className="mr-1 flex items-center">
          <button
            type="button"
            onClick={() => router.history.back()}
            aria-label="Atrás"
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => router.history.forward()}
            aria-label="Adelante"
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <nav className="flex items-center gap-1.5 text-sm">
          {crumbs.map((c, i) => (
            <span key={c.label} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-muted-foreground/50">/</span>}
              {c.to && i < crumbs.length - 1 ? (
                <Link
                  to={c.to}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {c.label}
                </Link>
              ) : (
                <span
                  className={cn(
                    i === 0 ? "font-display font-semibold" : "font-medium",
                    i === crumbs.length - 1 ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {c.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1.5">
        <span className="relative flex h-2 w-2">
          {running && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
          )}
          <span
            className={cn(
              "relative inline-flex h-2 w-2 rounded-full",
              running ? "bg-primary" : "bg-muted-foreground/40",
            )}
          />
        </span>
        <span className="text-xs text-muted-foreground">
          {running ? t("topbar.running", { count: runningCount }) : t("topbar.none")}
        </span>
      </div>
    </header>
  );
}

function buildCrumbs(pathname: string, t: (k: string) => string): Crumb[] {
  const root: Crumb = { label: "KnoxKit", to: "/instances" };

  if (pathname.startsWith("/instances")) {
    const rest = pathname.slice("/instances".length).replace(/^\//, "");
    const crumbs: Crumb[] = [root, { label: t("library.title"), to: "/instances" }];
    if (rest) {
      const found = findInstance(rest);
      crumbs.push({ label: found ? found.name : rest });
    }
    return crumbs;
  }
  if (pathname.startsWith("/mods")) {
    return [root, { label: t("mods.title") }];
  }
  if (pathname.startsWith("/modpack/import")) {
    return [root, { label: t("modpack.import.title") }];
  }
  if (pathname.startsWith("/settings")) {
    return [root, { label: t("settings.title") }];
  }
  return [root];
}
