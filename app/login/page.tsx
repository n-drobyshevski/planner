import { CalendarDays } from "lucide-react";
import { LoginScreen } from "@/components/auth/login-screen";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 bg-background px-6 py-12">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
          <CalendarDays className="size-7" />
        </span>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Welcome to Planner
        </h1>
        <p className="max-w-sm text-muted-foreground">
          A shared calendar for the two of you. Sign in with your name and PIN to
          continue.
        </p>
      </div>
      <LoginScreen />
    </main>
  );
}
