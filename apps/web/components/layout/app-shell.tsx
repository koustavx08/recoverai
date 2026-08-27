import type { ReactNode } from "react";
import { MobileNavProvider } from "./mobile-nav-context";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <MobileNavProvider>
      <div className="flex h-dvh w-full bg-background">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </MobileNavProvider>
  );
}
