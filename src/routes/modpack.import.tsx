import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/App";
import { ImportPreview } from "@/components/modpack/import-preview";
import { Button } from "@/components/ui/button";
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
      <EmptyState title={t("modpack.import.title")} description="No modpack file specified." />
    );
  }

  if (isLoading) {
    return <EmptyState title={t("modpack.import.title")} description="Validating…" />;
  }

  if (isError || !data) {
    return (
      <EmptyState
        title={t("modpack.import.title")}
        description={error instanceof Error ? error.message : "Failed to validate modpack."}
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight">{t("modpack.import.title")}</h1>
      <ImportPreview manifest={data} />
      <div className="flex justify-end">
        {/* TODO(review): wire import_modpack */}
        <Button disabled>{t("modpack.import.button")}</Button>
      </div>
    </div>
  );
}
