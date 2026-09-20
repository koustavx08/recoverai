import { LogOut } from "lucide-react";
import { auth, signOut } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { MobileNavToggle } from "./mobile-nav-toggle";

interface TopbarProps {
  readonly title: string;
  readonly description?: string;
}

export async function Topbar({ title, description }: TopbarProps) {
  const session = await auth();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNavToggle />
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-foreground">{title}</h1>
          {description ? (
            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Badge variant="accent" className="shrink-0">
          Simulator mode
        </Badge>
        {session?.user ? (
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <div className="hidden items-center gap-2 sm:flex">
              <span className="max-w-[12rem] truncate text-xs text-muted-foreground">
                {session.user.email}
              </span>
            </div>
            <button
              type="submit"
              aria-label="Sign out"
              title={session.user.email ?? "Sign out"}
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground sm:ml-1"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </form>
        ) : null}
      </div>
    </header>
  );
}
