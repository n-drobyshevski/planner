import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/health/google", () => ({
  refreshAccessToken: vi.fn(),
  fetchDay: vi.fn(),
  GoogleOAuthError: class GoogleOAuthError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));
vi.mock("@/lib/health/crypto", () => ({
  decryptToken: vi.fn(() => "plain-refresh-token"),
  encryptToken: vi.fn(() => Buffer.from("encrypted")),
  bufferToPgBytea: vi.fn(() => "\\xdeadbeef"),
  pgByteaToBuffer: vi.fn(() => Buffer.from("cipher")),
}));

import { syncMember, resolveSleepAutoFill } from "@/lib/health/sync";
import * as google from "@/lib/health/google";

type Row = Record<string, unknown>;

/** A tiny in-memory stand-in for the admin Supabase client, matching only the
 * query shapes lib/health/sync.ts actually issues (select().eq()[.eq()].maybeSingle(),
 * update().eq(), upsert()). */
class FakeAdmin {
  tables: Record<string, Map<string, Row>> = {
    health_connections: new Map(),
    health_daily: new Map(),
    sleep_logs: new Map(),
  };

  seed(table: string, rows: Row[], keyOf: (r: Row) => string) {
    for (const row of rows) this.tables[table].set(keyOf(row), { ...row });
  }

  from(table: string) {
    const store = this.tables[table];
    if (!store) throw new Error(`unmocked table: ${table}`);
    return {
      select() {
        const filters: [string, unknown][] = [];
        const builder = {
          eq(col: string, val: unknown) {
            filters.push([col, val]);
            return builder;
          },
          maybeSingle: async () => {
            const rows = Array.from(store.values()).filter((r) =>
              filters.every(([c, v]) => r[c] === v),
            );
            return { data: rows[0] ?? null, error: null };
          },
        };
        return builder;
      },
      update(patch: Row) {
        const filters: [string, unknown][] = [];
        const builder = {
          eq(col: string, val: unknown) {
            filters.push([col, val]);
            for (const row of store.values()) {
              if (filters.every(([c, v]) => row[c] === v)) Object.assign(row, patch);
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
        return builder;
      },
      upsert(row: Row) {
        const key =
          table === "health_connections"
            ? String(row.member_id)
            : `${row.member_id}:${row.date}`;
        const existing = store.get(key) ?? {};
        store.set(key, { ...existing, ...row });
        return Promise.resolve({ data: null, error: null });
      },
      delete() {
        return { eq: () => Promise.resolve({ data: null, error: null }) };
      },
    };
  }
}

function connectionRow(memberId: string, overrides: Row = {}): Row {
  return {
    member_id: memberId,
    workspace_id: "w1",
    provider: "google_health",
    status: "active",
    refresh_token_enc: "\\xabc",
    last_synced_at: null,
    last_error: null,
    ...overrides,
  };
}

function sleepLogRow(memberId: string, date: string, overrides: Row = {}): Row {
  return {
    id: `sl-${memberId}-${date}`,
    workspace_id: "w1",
    member_id: memberId,
    date,
    bedtime_at: null,
    woke_at: null,
    quality: null,
    fatigue: null,
    note: null,
    source: "manual",
    created_at: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

const HEALTH_ENTRY = {
  date: "2026-06-02",
  sleepStart: "2026-06-01T22:00:00Z",
  sleepEnd: "2026-06-02T06:00:00Z",
  minutesAsleep: 460,
  minutesDeep: 90,
  minutesLight: 300,
  minutesRem: 70,
  minutesAwake: 0,
  efficiency: 98,
  hrvMs: 50,
  restingHr: 55,
  spo2Avg: 97,
  steps: 8000,
  activeZoneMinutes: 20,
  exerciseMinutes: 15,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(google.refreshAccessToken).mockResolvedValue({
    accessToken: "access-token",
    expiresIn: 3600,
  });
  vi.mocked(google.fetchDay).mockResolvedValue([HEALTH_ENTRY]);
});

describe("resolveSleepAutoFill", () => {
  it("writes when there's no existing row", () => {
    expect(resolveSleepAutoFill(null)).toEqual({ shouldWrite: true, source: "fitbit" });
  });

  it("writes when the existing row has no times yet, preserving a manual rating as 'fitbit+manual'", () => {
    const decision = resolveSleepAutoFill({
      bedtimeAt: null,
      wokeAt: null,
      quality: 5,
      fatigue: 3,
      note: "rough night",
      source: "manual",
    });
    expect(decision).toEqual({ shouldWrite: true, source: "fitbit+manual" });
  });

  it("never overwrites a manually-entered bedtime/wake", () => {
    const decision = resolveSleepAutoFill({
      bedtimeAt: 1000,
      wokeAt: 2000,
      quality: null,
      fatigue: null,
      note: null,
      source: "manual",
    });
    expect(decision.shouldWrite).toBe(false);
  });

  it("DOES overwrite times a PRIOR sync itself wrote (source fitbit/fitbit+manual)", () => {
    expect(
      resolveSleepAutoFill({
        bedtimeAt: 1000,
        wokeAt: 2000,
        quality: null,
        fatigue: null,
        note: null,
        source: "fitbit",
      }),
    ).toEqual({ shouldWrite: true, source: "fitbit" });
    expect(
      resolveSleepAutoFill({
        bedtimeAt: 1000,
        wokeAt: 2000,
        quality: 4,
        fatigue: null,
        note: null,
        source: "fitbit+manual",
      }),
    ).toEqual({ shouldWrite: true, source: "fitbit+manual" });
  });
});

describe("syncMember", () => {
  it("upserts health_daily and auto-fills sleep_logs only for the target member", async () => {
    const admin = new FakeAdmin();
    admin.seed(
      "health_connections",
      [connectionRow("mA"), connectionRow("mB")],
      (r) => String(r.member_id),
    );

    const result = await syncMember(admin as never, "mA", { days: 1 });

    expect(result).toEqual({ synced: true, daysSynced: 1 });
    expect(admin.tables.health_daily.has("mA:2026-06-02")).toBe(true);
    expect(admin.tables.health_daily.has("mB:2026-06-02")).toBe(false);
    expect(admin.tables.sleep_logs.has("mA:2026-06-02")).toBe(true);
    expect(admin.tables.sleep_logs.has("mB:2026-06-02")).toBe(false);

    const mAConn = admin.tables.health_connections.get("mA");
    const mBConn = admin.tables.health_connections.get("mB");
    expect(mAConn?.status).toBe("active");
    expect(mAConn?.last_synced_at).not.toBeNull();
    // The untouched member's connection is exactly as seeded.
    expect(mBConn?.last_synced_at).toBeNull();
  });

  it("never wipes an existing quality/fatigue/note when auto-filling times", async () => {
    const admin = new FakeAdmin();
    admin.seed("health_connections", [connectionRow("mA")], (r) => String(r.member_id));
    admin.seed(
      "sleep_logs",
      [
        sleepLogRow("mA", "2026-06-02", {
          quality: 6,
          fatigue: 2,
          note: "great night, felt rested",
        }),
      ],
      (r) => `${r.member_id}:${r.date}`,
    );

    await syncMember(admin as never, "mA", { days: 1 });

    const row = admin.tables.sleep_logs.get("mA:2026-06-02");
    expect(row?.quality).toBe(6);
    expect(row?.fatigue).toBe(2);
    expect(row?.note).toBe("great night, felt rested");
    // Times WERE filled (they were null) and the source reflects both.
    expect(row?.bedtime_at).not.toBeNull();
    expect(row?.woke_at).not.toBeNull();
    expect(row?.source).toBe("fitbit+manual");
  });

  it("never overwrites a manually-entered bedtime/wake even after a sync", async () => {
    const admin = new FakeAdmin();
    admin.seed("health_connections", [connectionRow("mA")], (r) => String(r.member_id));
    const manualBedtime = "2026-06-01T21:00:00.000Z";
    const manualWoke = "2026-06-02T05:00:00.000Z";
    admin.seed(
      "sleep_logs",
      [
        sleepLogRow("mA", "2026-06-02", {
          bedtime_at: manualBedtime,
          woke_at: manualWoke,
          source: "manual",
        }),
      ],
      (r) => `${r.member_id}:${r.date}`,
    );

    await syncMember(admin as never, "mA", { days: 1 });

    const row = admin.tables.sleep_logs.get("mA:2026-06-02");
    expect(row?.bedtime_at).toBe(manualBedtime);
    expect(row?.woke_at).toBe(manualWoke);
    expect(row?.source).toBe("manual");
  });

  it("returns not_connected without calling Google when there's no connection row", async () => {
    const admin = new FakeAdmin();
    const result = await syncMember(admin as never, "mA", { days: 1 });
    expect(result).toEqual({ synced: false, reason: "not_connected" });
    expect(google.refreshAccessToken).not.toHaveBeenCalled();
  });

  it("marks the connection revoked on invalid_grant and stops without throwing", async () => {
    const admin = new FakeAdmin();
    admin.seed("health_connections", [connectionRow("mA")], (r) => String(r.member_id));
    vi.mocked(google.refreshAccessToken).mockRejectedValue(
      new google.GoogleOAuthError("invalid_grant", "revoked"),
    );

    const result = await syncMember(admin as never, "mA", { days: 1 });
    expect(result).toEqual({ synced: false, reason: "revoked" });
    expect(admin.tables.health_connections.get("mA")?.status).toBe("revoked");
  });
});
