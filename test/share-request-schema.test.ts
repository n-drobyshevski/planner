import { describe, expect, it } from "vitest";
import { bodySchema } from "@/app/api/share/[token]/request/schema";

const validStart = Date.UTC(2026, 6, 10, 9);
const validEnd = Date.UTC(2026, 6, 10, 10);

describe("share request body schema", () => {
  it("accepts a sane in-range slot", () => {
    expect(bodySchema.safeParse({ start: validStart, end: validEnd }).success).toBe(
      true,
    );
  });

  it("rejects timestamps beyond the JS Date range (previously an uncaught 500)", () => {
    expect(bodySchema.safeParse({ start: 9e15, end: 9e15 + 1 }).success).toBe(false);
  });

  it("rejects timestamps before the epoch floor", () => {
    expect(bodySchema.safeParse({ start: -1, end: validEnd }).success).toBe(false);
  });

  it("rejects an inverted or empty range", () => {
    expect(bodySchema.safeParse({ start: validEnd, end: validStart }).success).toBe(
      false,
    );
    expect(bodySchema.safeParse({ start: validStart, end: validStart }).success).toBe(
      false,
    );
  });
});
