import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/App";

export const Route = createFileRoute("/settings/")({
  component: SettingsRoute,
});

function SettingsRoute() {
  const { t } = useTranslation();
  return <EmptyState title={t("route.settings.title")} />;
}
