import { Link } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Box, Download, Gear, Grid } from "@/components/ui/icons";

interface NavItem {
  to: string;
  labelKey: string;
  Icon: ComponentType<{ size?: number }>;
}

const ITEMS: NavItem[] = [
  { to: "/instances", labelKey: "nav.instances", Icon: Grid },
  { to: "/mods", labelKey: "nav.mods", Icon: Box },
  { to: "/modpack/import", labelKey: "nav.import", Icon: Download },
  { to: "/settings", labelKey: "nav.settings", Icon: Gear },
];

export function Sidebar() {
  const { t } = useTranslation();

  return (
    <aside className="relative z-10 flex h-full w-[68px] flex-col items-center border-r border-border bg-card/60 py-4 backdrop-blur">
      <Link to="/instances" aria-label="KnoxKit">
        <Brand compact />
      </Link>

      <nav className="mt-7 flex flex-1 flex-col items-center gap-1.5">
        {ITEMS.map(({ to, labelKey, Icon }) => (
          <Link
            key={to}
            to={to}
            className="group relative grid h-11 w-11 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            activeProps={{ className: "is-active bg-primary/15 text-primary" }}
          >
            <span className="absolute left-0 h-0 w-[3px] rounded-r-full bg-primary transition-all duration-200 group-[.is-active]:h-6" />
            <Icon size={20} />
            <span className="pointer-events-none absolute left-[120%] z-50 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
              {t(labelKey)}
            </span>
          </Link>
        ))}
      </nav>

      <div className="flex flex-col items-center gap-2">
        <ThemeToggle />
        <button
          type="button"
          aria-label="Perfil"
          className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground ring-1 ring-border transition-colors hover:bg-accent"
        >
          V
        </button>
      </div>
    </aside>
  );
}
