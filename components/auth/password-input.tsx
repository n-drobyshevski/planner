"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * A masked password field with a Show/Hide toggle, shared by the login screen,
 * the account-switch dialog, and the profile settings. Renders the label row +
 * input only; callers own the surrounding layout and any hint/error copy so the
 * field drops into either a TanStack form field or a plain controlled form.
 *
 * The toggle sits in the label row (rather than inline in the 32px-tall field)
 * so it can carry text and a full 44px hit area without crowding the input.
 */
export function PasswordInput({
  label,
  value,
  onChange,
  disabled,
  autoFocus,
  autoComplete,
  id,
  name,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  /** "current-password" on sign-in/switch, "new-password" when setting one. */
  autoComplete: "current-password" | "new-password";
  id?: string;
  name?: string;
}) {
  const t = useTranslations("auth");
  const reactId = useId();
  const inputId = id ?? reactId;
  const [show, setShow] = useState(false);
  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="text-sm font-medium">
          {label}
        </label>
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="-my-1 flex items-center gap-1 rounded px-1 py-1 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={show ? t("hidePasswordLabel") : t("showPasswordLabel")}
          aria-pressed={show}
        >
          {show ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
          {show ? t("hide") : t("show")}
        </button>
      </div>
      <Input
        id={inputId}
        name={name}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
    </div>
  );
}
