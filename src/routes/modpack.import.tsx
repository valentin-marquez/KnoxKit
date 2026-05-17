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
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-3">
        <h1 className="font-display text-lg font-bold">{t("modpack.import.title")}</h1>
      </div>
      <div className="flex-1 overflow-auto p-5">
        <div className="mx-auto max-w-3xl">{children}</div>
      </div>
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
        <div className="grid place-items-center rounded-md border border-dashed border-border py-16 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-md border border-border text-muted-foreground">
            <Download size={20} />
          </div>
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">{t("modpack.import.hint")}</p>
        </div>
      </Shell>
    );
  }

  if (isLoading) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">{file}…</p>
      </Shell>
    );
  }

  if (isError || !data) {
    return (
      <Shell>
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 font-mono text-xs text-destructive">
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
          <Download size={15} />
          {t("modpack.import.button")}
        </Button>
      </div>
    </Shell>
  );
}
