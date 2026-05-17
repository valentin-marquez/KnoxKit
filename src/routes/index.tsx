import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * KnoxKit has no separate dashboard yet — the instances library is the home
 * screen, so `/` redirects there.
 */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/instances" });
  },
});
