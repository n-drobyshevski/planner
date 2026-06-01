import { getMemberProfiles } from "@/lib/auth/profiles";
import { ProfileSwitcher } from "@/components/auth/profile-switcher";
import { CalendarDays } from "lucide-react";

export default function SelectProfilePage() {
  const profiles = getMemberProfiles();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 bg-background px-6 py-12">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
          <CalendarDays className="size-7" />
        </span>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Planner</h1>
        <p className="max-w-sm text-muted-foreground">
          A shared calendar for the two of you. Pick your profile to continue.
        </p>
      </div>
      <ProfileSwitcher profiles={profiles} />
    </main>
  );
}
