"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

export function PinGate({
  name,
  pending,
  onSubmit,
  onCancel,
}: {
  name: string;
  pending: boolean;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");

  return (
    <Card className="w-full max-w-sm shadow-soft">
      <CardHeader className="text-center">
        <CardTitle className="font-heading">{`Enter ${name}'s PIN`}</CardTitle>
        <CardDescription>4-digit PIN to continue</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-5">
        <InputOTP
          maxLength={4}
          value={pin}
          onChange={setPin}
          onComplete={(v) => onSubmit(v)}
          disabled={pending}
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
          </InputOTPGroup>
        </InputOTP>
        <div className="flex w-full gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onCancel}
            disabled={pending}
          >
            Back
          </Button>
          <Button
            className="flex-1"
            disabled={pending || pin.length < 4}
            onClick={() => onSubmit(pin)}
          >
            {pending ? "Checking…" : "Continue"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
