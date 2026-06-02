"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
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
  const [showPin, setShowPin] = useState(false);
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
            <div className="flex w-full items-center justify-between">
              <span className="text-sm font-medium">PIN</span>
              <button
                type="button"
                onClick={() => setShowPin((s) => !s)}
                className="flex items-center gap-1 rounded text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={showPin ? "Hide PIN" : "Show PIN"}
                aria-pressed={showPin}
              >
                {showPin ? (
                  <EyeOff className="size-4" aria-hidden />
                ) : (
                  <Eye className="size-4" aria-hidden />
                )}
                {showPin ? "Hide" : "Show"}
              </button>
            </div>
            <InputOTP
              maxLength={8}
              value={pin}
              onChange={setPin}
              disabled={pending}
              containerClassName="self-start"
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} mask={!showPin} />
                <InputOTPSlot index={1} mask={!showPin} />
                <InputOTPSlot index={2} mask={!showPin} />
                <InputOTPSlot index={3} mask={!showPin} />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                <InputOTPSlot index={4} mask={!showPin} />
                <InputOTPSlot index={5} mask={!showPin} />
                <InputOTPSlot index={6} mask={!showPin} />
                <InputOTPSlot index={7} mask={!showPin} />
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
