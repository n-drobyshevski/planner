import { describe, expect, it } from "vitest";
import {
  loginBlocked,
  MAX_FAILURES_PER_IP,
  MAX_FAILURES_PER_MEMBER,
} from "@/lib/rate-limit/login-attempts";

describe("loginBlocked — durable login failure budget", () => {
  it("allows while both axes are under budget", () => {
    expect(loginBlocked(0, 0)).toBe(false);
    expect(loginBlocked(MAX_FAILURES_PER_IP - 1, MAX_FAILURES_PER_MEMBER - 1)).toBe(
      false,
    );
  });

  it("blocks when the IP axis reaches its budget, regardless of member axis", () => {
    expect(loginBlocked(MAX_FAILURES_PER_IP, 0)).toBe(true);
  });

  it("blocks when the member axis reaches its budget, regardless of IP axis", () => {
    expect(loginBlocked(0, MAX_FAILURES_PER_MEMBER)).toBe(true);
  });
});
