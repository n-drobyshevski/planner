/**
 * A small, dependency-free password-strength heuristic for the set/change
 * dialog. Deliberately honest and coarse: it rewards length and character-class
 * variety, the two factors that actually move brute-force cost, and maps them to
 * three levels. It is guidance, not a gate — the only hard rule is the min-8
 * length enforced by the form schema.
 */

/** 0 = empty (no meter), 1 = weak, 2 = fair, 3 = strong. */
export type PasswordStrength = 0 | 1 | 2 | 3;

export const STRENGTH_LABEL = {
  1: "weak",
  2: "fair",
  3: "strong",
} as const;

export function scorePassword(password: string): PasswordStrength {
  if (!password) return 0;

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) =>
    re.test(password),
  ).length;

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (classes >= 3) score += 1;
  if (password.length >= 16 && classes >= 2) score += 1;

  // Anything entered but below the min reads as weak, never empty.
  return Math.max(1, Math.min(3, score)) as PasswordStrength;
}
