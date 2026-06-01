"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { signIn } from "@/app/login/actions";

/**
 * Nickname + PIN sign-in. The member is found by name; their PIN (when set) is
 * verified server-side before the session is established. On success the action
 * redirects, so a returned value only ever signals failure.
 */
export function LoginScreen() {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const trimmed = name.trim();
    if (!trimmed || pending) return;
    startTransition(async () => {
      const res = await signIn(trimmed, pin);
      if (res && "error" in res) toast.error(res.error);
    });
  }

  return (
    <Card className="w-full max-w-sm shadow-soft">
      <CardContent className="p-6">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="login-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoFocus
              autoComplete="username"
              aria-label="Name"
            />
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <span className="self-start text-sm font-medium">PIN</span>
            <InputOTP
              maxLength={4}
              value={pin}
              onChange={setPin}
              disabled={pending}
              containerClassName="self-start"
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
              </InputOTPGroup>
            </InputOTP>
            <span className="self-start text-xs text-muted-foreground">
              Leave blank if you haven&apos;t set a PIN.
            </span>
          </div>

          <Button type="submit" disabled={pending || !name.trim()}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
