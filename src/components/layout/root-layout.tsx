import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-grain relative flex h-full w-full overflow-hidden bg-background">
      <Sidebar />
      <div className="relative z-10 flex h-full flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
