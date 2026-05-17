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
    <aside className="flex h-full w-14 flex-col items-center border-r border-border bg-card">
      <Link
        to="/instances"
        aria-label="KnoxKit"
        className="grid h-14 w-14 place-items-center border-b border-border"
      >
        <Brand compact />
      </Link>

      <nav className="flex flex-1 flex-col items-center gap-1 py-2">
        {ITEMS.map(({ to, labelKey, Icon }) => (
          <Link
            key={to}
            to={to}
            className="group relative grid h-10 w-10 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            activeProps={{ className: "is-active bg-accent text-primary" }}
          >
            <span className="absolute left-0 top-1/2 h-0 w-0.5 -translate-y-1/2 bg-primary group-[.is-active]:h-5" />
            <Icon size={19} />
            <span className="pointer-events-none absolute left-[115%] z-50 whitespace-nowrap rounded border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground opacity-0 shadow-md group-hover:opacity-100">
              {t(labelKey)}
            </span>
          </Link>
        ))}
      </nav>

      <div className="flex flex-col items-center gap-1 border-t border-border py-2">
        <ThemeToggle />
        <button
          type="button"
          aria-label="Perfil"
          className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground hover:bg-accent"
        >
          V
        </button>
      </div>
    </aside>
  );
}
