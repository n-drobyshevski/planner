"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { signInAsMember } from "@/app/select-profile/actions";
import { PinGate } from "@/components/auth/pin-gate";

type Key = "A" | "B";
interface Profile {
  key: Key;
  name: string;
  color: string;
}

export function ProfileSwitcher({ profiles }: { profiles: Profile[] }) {
  const [pending, startTransition] = useTransition();
  const [pinFor, setPinFor] = useState<Profile | null>(null);
  const [activeKey, setActiveKey] = useState<Key | null>(null);

  function attempt(key: Key, pin?: string) {
    setActiveKey(key);
    startTransition(async () => {
      const res = await signInAsMember(key, pin);
      // On success the server action redirects; res is only set on failure.
      if (res && "error" in res) {
        if (res.needsPin) {
          setPinFor(profiles.find((p) => p.key === key) ?? null);
        } else {
          toast.error(res.error);
        }
      }
    });
  }

  if (pinFor) {
    return (
      <PinGate
        name={pinFor.name}
        pending={pending}
        onSubmit={(pin) => attempt(pinFor.key, pin)}
        onCancel={() => setPinFor(null)}
      />
    );
  }

  return (
    <div className="grid w-full max-w-md grid-cols-1 gap-4 sm:grid-cols-2">
      {profiles.map((p) => (
        <Card
          key={p.key}
          className="shadow-soft transition-shadow hover:shadow-soft-lg"
        >
          <CardContent className="flex flex-col items-center gap-4 p-6">
            <Avatar className="size-16">
              <AvatarFallback
                style={{ backgroundColor: p.color, color: "#fff" }}
                className="text-xl font-semibold"
              >
                {p.name.slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <p className="font-heading text-lg font-semibold">{p.name}</p>
            <Button
              className="w-full"
              disabled={pending}
              onClick={() => attempt(p.key)}
            >
              {pending && activeKey === p.key
                ? "Signing in…"
                : `Continue as ${p.name}`}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
