import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/App";

export const Route = createFileRoute("/instances/$id")({
  component: InstanceDetailRoute,
});

function InstanceDetailRoute() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  return <EmptyState title={t("route.instances.title")} description={`Instance ${id}`} />;
}
