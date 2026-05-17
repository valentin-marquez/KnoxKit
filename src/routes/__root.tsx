import { createRootRoute, Outlet } from "@tanstack/react-router";
import { RootLayout } from "@/components/layout/root-layout";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootLayout>
      <Outlet />
    </RootLayout>
  );
}
