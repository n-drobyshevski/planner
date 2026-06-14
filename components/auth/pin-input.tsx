"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";

/**
 * The 8-digit PIN field with a show/hide toggle, shared by the login screen and
 * the account-switch dialog. Renders the label row + OTP only; callers own the
 * surrounding layout and any hint/error copy so the field drops into either a
 * TanStack form field or a plain controlled form.
 */
export function PinInput({
  value,
  onChange,
  disabled,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const t = useTranslations("auth");
  const [showPin, setShowPin] = useState(false);
  return (
    <>
      <div className="flex w-full items-center justify-between">
        <span className="text-sm font-medium">{t("pinLabel")}</span>
        <button
          type="button"
          onClick={() => setShowPin((s) => !s)}
          className="flex items-center gap-1 rounded text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={showPin ? t("hidePinLabel") : t("showPinLabel")}
          aria-pressed={showPin}
        >
          {showPin ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
          {showPin ? t("hidePin") : t("showPin")}
        </button>
      </div>
      <InputOTP
        maxLength={8}
        value={value}
        onChange={onChange}
        disabled={disabled}
        autoFocus={autoFocus}
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
    </>
  );
}
