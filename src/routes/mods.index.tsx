import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/App";

export const Route = createFileRoute("/mods/")({
  component: ModsRoute,
});

function ModsRoute() {
  const { t } = useTranslation();
  return <EmptyState title={t("route.mods.title")} />;
}
