import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProfileSettings } from "@/components/settings/profile-settings";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { TimezoneSettings } from "@/components/settings/timezone-settings";
import { SleepSettings } from "@/components/settings/sleep-settings";

export const metadata: Metadata = {
  title: "Settings · Planner",
};

export default function SettingsPage() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
        <Button asChild variant="ghost" size="icon" aria-label="Back to calendar">
          <Link href="/calendar">
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="font-heading text-lg font-medium">Settings</h1>
      </header>
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <ProfileSettings />
        <AppearanceSettings />
        <TimezoneSettings />
        <SleepSettings />
      </main>
    </div>
  );
}
