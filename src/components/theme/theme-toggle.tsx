import { useTranslation } from "react-i18next";
import { type Theme, useTheme } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";

const ORDER: Theme[] = ["light", "dark", "system"];

const GLYPH: Record<Theme, string> = {
  light: "☀",
  dark: "☾",
  system: "🖥",
};

/** Cycles light → dark → system. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

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
    >
      <span aria-hidden="true">{GLYPH[theme]}</span>
    </Button>
  );
}
