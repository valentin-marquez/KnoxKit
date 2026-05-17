import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ImportPreview } from "@/components/modpack/import-preview";
import { Button } from "@/components/ui/button";
import { Download } from "@/components/ui/icons";
import { validateModpack } from "@/lib/tauri/commands";

interface ImportSearch {
  file: string;
}

export const Route = createFileRoute("/modpack/import")({
  validateSearch: (search: Record<string, unknown>): ImportSearch => ({
    file: typeof search.file === "string" ? search.file : "",
  }),
  component: ModpackImportRoute,
});

function Shell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-3xl px-7 py-7">
      <h1 className="font-display text-2xl font-bold tracking-tight">
        {t("modpack.import.title")}
      </h1>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function ModpackImportRoute() {
  const { t } = useTranslation();
  const { file } = Route.useSearch();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["validateModpack", file],
    queryFn: () => validateModpack(file),
    enabled: file.length > 0,
  });

  if (!file) {
    return (
      <Shell>
        <div className="grid place-items-center rounded-xl border border-dashed border-border py-20 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Download size={24} />
          </div>
          <p className="mt-4 max-w-sm font-typewriter text-sm text-muted-foreground">
            {t("modpack.import.hint")}
          </p>
        </div>
      </Shell>
    );
  }

  if (isLoading) {
    return (
      <Shell>
        <p className="font-typewriter text-sm text-muted-foreground">
          {"// "}
          validando {file}…
        </p>
      </Shell>
    );
  }

  if (isError || !data) {
    return (
      <Shell>
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 font-mono text-xs text-destructive">
          {error instanceof Error ? error.message : "Failed to validate modpack."}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <ImportPreview manifest={data} />
      <div className="mt-4 flex justify-end">
        {/* TODO(review): wire import_modpack */}
        <Button disabled className="gap-2">
          <Download size={16} />
          {t("modpack.import.button")}
        </Button>
      </div>
    </Shell>
  );
}
