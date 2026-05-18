import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "@/components/ui/icons";
import { useInstances } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { Instance } from "@/types/instance";

interface Crumb {
  label: string;
  to?: string;
}

export function Topbar() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data } = useInstances();

  const crumbs = buildCrumbs(pathname, t, data ?? []);
  // Running-state isn't tracked on disk yet — always report none.
  const running = false;

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card pl-2 pr-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => router.history.back()}
            aria-label="Atrás"
            className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => router.history.forward()}
            aria-label="Adelante"
            className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <nav className="flex items-center gap-1.5 text-[13px]">
          {crumbs.map((c, i) => (
            <span key={c.label} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-border">/</span>}
              {c.to && i < crumbs.length - 1 ? (
                <Link to={c.to} className="text-muted-foreground hover:text-foreground">
                  {c.label}
                </Link>
              ) : (
                <span
                  className={cn(
                    i === crumbs.length - 1
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {c.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            running ? "bg-success" : "bg-muted-foreground/40",
          )}
        />
        {t("topbar.none")}
      </div>
    </header>
  );
}

function buildCrumbs(pathname: string, t: (k: string) => string, instances: Instance[]): Crumb[] {
  const root: Crumb = { label: "KnoxKit", to: "/instances" };

  if (pathname.startsWith("/instances")) {
    const rest = pathname.slice("/instances".length).replace(/^\//, "");
    const crumbs: Crumb[] = [root, { label: t("library.title"), to: "/instances" }];
    if (rest) {
      const found = instances.find((i) => i.id === rest);
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
