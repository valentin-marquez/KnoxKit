import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/App";

export const Route = createFileRoute("/instances/")({
  component: InstancesRoute,
});

function InstancesRoute() {
  const { t } = useTranslation();
  return <EmptyState title={t("route.instances.title")} />;
}
