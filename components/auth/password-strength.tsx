"use client";

import { useTranslations } from "next-intl";
import {
  scorePassword,
  STRENGTH_LABEL,
  type PasswordStrength,
} from "@/lib/auth/password-strength";

/** Filled-segment color per level — neutral for weak, then the semantic warm/green. */
const FILL: Record<Exclude<PasswordStrength, 0>, string> = {
  1: "bg-muted-foreground/60",
  2: "bg-[#b45309]", // shared-amber
  3: "bg-[#15803d]", // category green
};

/**
 * A quiet three-segment strength meter for the set/change password dialog. The
 * text label is always present so meaning never rests on color alone (AAA), and
 * the whole thing only renders once something is typed. Guidance, not a gate.
 */
export function PasswordStrength({ value }: { value: string }) {
  const t = useTranslations("settings");
  const level = scorePassword(value);
  if (level === 0) return null;

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3].map((seg) => (
          <span
            key={seg}
            className={`h-1 flex-1 rounded-full motion-safe:transition-colors ${
              seg <= level ? FILL[level] : "bg-border"
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {t("profile.password.strength.label")}:{" "}
        <span className="font-medium text-foreground">
          {t(`profile.password.strength.${STRENGTH_LABEL[level]}`)}
        </span>
      </p>
    </div>
  );
}
