import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { useStore } from "@/stores/ui-store";

export function Topbar() {
  const toggleSidebar = useStore((s) => s.toggleSidebar);

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
      <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label="Toggle sidebar">
        <span aria-hidden="true">☰</span>
      </Button>
      <div className="flex items-center gap-1">
        <ThemeToggle />
      </div>
    </header>
  );
}
