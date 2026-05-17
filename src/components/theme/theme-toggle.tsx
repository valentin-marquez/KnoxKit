import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { type Theme, useTheme } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";
import { Monitor, Moon, Sun } from "@/components/ui/icons";

const ORDER: Theme[] = ["light", "dark", "system"];

const ICON: Record<Theme, ComponentType<{ size?: number }>> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

/** Cycles light → dark → system. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();
  const Icon = ICON[theme];

  const next = () => {
    const idx = ORDER.indexOf(theme);
    const nextTheme = ORDER[(idx + 1) % ORDER.length] ?? "system";
    setTheme(nextTheme);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={next}
      aria-label={t(`theme.${theme}`)}
      title={t(`theme.${theme}`)}
      className="h-8 w-8"
    >
      <Icon size={17} />
    </Button>
  );
}
