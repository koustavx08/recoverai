import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { ShieldCheck } from "lucide-react";
import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMO_USERS, DEMO_USER_PASSWORD } from "@/lib/auth-seed";

interface LoginPageProps {
  readonly searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}

const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  CredentialsSignin: "Incorrect email or password.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { callbackUrl, error } = await searchParams;

  async function login(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/dashboard",
      });
    } catch (signInError) {
      if (signInError instanceof AuthError) {
        redirect(`/login?error=${signInError.type}`);
      }
      throw signInError;
    }
  }

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="flex items-center justify-center gap-2">
          <ShieldCheck className="h-6 w-6 text-accent" strokeWidth={1.75} />
          <span className="text-lg font-semibold tracking-tight text-foreground">RecoverAI</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Every login is scoped to one merchant&apos;s data.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {error ? (
              <p className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {ERROR_MESSAGES[error] ?? "Sign-in failed. Please try again."}
              </p>
            ) : null}

            <form action={login} className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="email" className="text-xs font-medium text-muted-foreground">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="aurora@recoverai.dev"
                  className="h-9 w-full rounded border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="password" className="text-xs font-medium text-muted-foreground">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="h-9 w-full rounded border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
              </div>
              <Button type="submit" className="w-full">
                Sign in
              </Button>
            </form>

            <div className="space-y-1 rounded border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Demo credentials</p>
              {DEMO_USERS.map((demo) => (
                <p key={demo.email}>
                  <code>{demo.email}</code> — merchant <code>{demo.merchantId}</code>
                </p>
              ))}
              <p>
                Password for both: <code>{DEMO_USER_PASSWORD}</code>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
