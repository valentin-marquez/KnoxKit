import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useStore } from "@/stores/ui-store";

interface NavItem {
  to: string;
  labelKey: string;
  glyph: string;
}

const ITEMS: NavItem[] = [
  { to: "/", labelKey: "nav.dashboard", glyph: "▣" },
  { to: "/instances", labelKey: "nav.instances", glyph: "▤" },
  { to: "/mods", labelKey: "nav.mods", glyph: "◈" },
  { to: "/settings", labelKey: "nav.settings", glyph: "⚙" },
];

export function Sidebar() {
  const { t } = useTranslation();
  const collapsed = useStore((s) => s.sidebarCollapsed);

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-border bg-card transition-[width]",
        collapsed ? "w-14" : "w-56",
      )}
    >
      <div className="flex h-14 items-center px-4">
        <span className="text-sm font-semibold tracking-tight">{collapsed ? "K" : "KnoxKit"}</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-2">
        {ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            activeProps={{
              className:
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm bg-accent text-accent-foreground font-medium",
            }}
            activeOptions={{ exact: item.to === "/" }}
          >
            <span aria-hidden="true">{item.glyph}</span>
            {collapsed ? null : <span>{t(item.labelKey)}</span>}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
