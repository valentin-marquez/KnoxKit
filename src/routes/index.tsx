import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/App";

export const Route = createFileRoute("/")({
  component: DashboardRoute,
});

function DashboardRoute() {
  const { t } = useTranslation();
  return (
    <EmptyState
      title={t("route.dashboard.title")}
      description="Your Project Zomboid instances at a glance."
    />
  );
}
