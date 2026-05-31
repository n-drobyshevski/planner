import "server-only";

export type MemberKey = "A" | "B";

/** Client-safe subset (no credentials) describing each member for the picker. */
export interface MemberProfile {
  key: MemberKey;
  name: string;
  color: string;
}

export function getMemberProfiles(): MemberProfile[] {
  return [
    { key: "A", name: process.env.MEMBER_A_NAME ?? "Member A", color: "#c0492a" },
    { key: "B", name: process.env.MEMBER_B_NAME ?? "Member B", color: "#0f766e" },
  ];
}

export function getMemberCredentials(key: MemberKey): {
  email: string;
  password: string;
} {
  return key === "A"
    ? {
        email: process.env.MEMBER_A_EMAIL!,
        password: process.env.MEMBER_A_PASSWORD!,
      }
    : {
        email: process.env.MEMBER_B_EMAIL!,
        password: process.env.MEMBER_B_PASSWORD!,
      };
}
