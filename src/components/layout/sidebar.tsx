import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { type ComponentType, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Brand } from "@/components/layout/brand";
import { ProfileField } from "@/components/profile/profile-field";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Box, Download, Gear, Grid } from "@/components/ui/icons";
import * as anim from "@/lib/anim";
import { useSettings } from "@/lib/queries";

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
        <ProfileButton />
      </div>
    </aside>
  );
}

/**
 * Avatar/initial button under the theme toggle. Opens a small inline popover
 * anchored to the rail holding the editable multiplayer username.
 */
function ProfileButton() {
  const { t } = useTranslation();
  const settings = useSettings();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const username = settings.data?.profile_username?.trim() ?? "";
  const initial = username !== "" ? username[0]?.toUpperCase() : null;

  // Dismiss on outside click / Escape while the popover is open.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label={t("profile.title")}
        title={username !== "" ? username : t("profile.title")}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground hover:bg-accent"
      >
        {initial ?? <span className="text-muted-foreground">·</span>}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="profile-popover"
            role="dialog"
            aria-label={t("profile.title")}
            initial={{ opacity: 0, scale: 0.94, x: -6 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.94, x: -6 }}
            transition={anim.snappy}
            className="absolute bottom-0 left-[125%] z-50 w-64 origin-bottom-left rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-xl"
          >
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("profile.title")}
            </p>
            <ProfileField />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
