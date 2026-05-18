import { createRootRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { RootLayout } from "@/components/layout/root-layout";
import { useSetupStatus } from "@/lib/queries";

export const Route = createRootRoute({
  component: RootComponent,
});

/**
 * Hard gate: while first-run setup is incomplete (`needs_onboarding`), every
 * route except `/onboarding` redirects there, so the rest of the app is
 * unreachable until Project Zomboid + SteamCMD are configured. The status is
 * read through TanStack Query (never fetched in render); the guard is a small
 * typed effect rather than a `beforeLoad`, because the router has no
 * queryClient in context.
 */
function RootComponent() {
  const setup = useSetupStatus();
  const location = useLocation();
  const navigate = useNavigate();

  const onOnboarding = location.pathname.startsWith("/onboarding");
  const needsOnboarding = setup.data?.needs_onboarding === true;

  useEffect(() => {
    if (needsOnboarding && !onOnboarding) {
      void navigate({ to: "/onboarding" });
    }
  }, [needsOnboarding, onOnboarding, navigate]);

  // Don't paint the app chrome (sidebar/topbar/status bar) until first-run
  // setup is done: while the status is still loading, on the onboarding
  // screen, or in the brief window before the redirect effect fires.
  if (setup.isPending || onOnboarding || needsOnboarding) {
    return <Outlet />;
  }

  return (
    <RootLayout>
      <Outlet />
    </RootLayout>
  );
}
