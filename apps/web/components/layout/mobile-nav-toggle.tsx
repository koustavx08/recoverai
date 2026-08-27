"use client";

import { Menu } from "lucide-react";
import { useMobileNav } from "./mobile-nav-context";

export function MobileNavToggle() {
  const { toggle } = useMobileNav();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Open navigation"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
    >
      <Menu className="h-5 w-5" strokeWidth={1.75} />
    </button>
  );
}
