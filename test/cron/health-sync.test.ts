import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/health/sync", () => ({ syncMember: vi.fn() }));
vi.mock("@/lib/health/lock", () => ({
  withHealthSyncLock: vi.fn((_id: string, fn: () => unknown) => fn()),
}));

import { GET } from "@/app/api/cron/health-sync/route";
import { createAdminClient } from "@/lib/supabase/admin";

const ORIGINAL_SECRET = process.env.CRON_SECRET;

function req(headers: Record<string, string> = {}) {
  return new Request("https://planr.page/api/cron/health-sync", { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-cron-secret";
});
afterEach(() => {
  process.env.CRON_SECRET = ORIGINAL_SECRET;
});

describe("GET /api/cron/health-sync", () => {
  it("rejects a request with no Authorization header", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong bearer token", async () => {
    const res = await GET(req({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects every request when CRON_SECRET isn't configured at all", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("runs the sync when the bearer token matches CRON_SECRET", async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: [{ member_id: "m1" }, { member_id: "m2" }],
              error: null,
            }),
        }),
      }),
    } as never);

    const res = await GET(req({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { members: number; synced: number; failed: number };
    expect(body).toEqual({ members: 2, synced: 2, failed: 0 });
  });
});
