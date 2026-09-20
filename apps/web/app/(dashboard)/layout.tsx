import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";

/** Every authenticated dashboard route lives in this route group (URL paths are unaffected — `(dashboard)` is excluded from the path) so `/login` can render without the sidebar/topbar shell. */
export default function DashboardGroupLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
