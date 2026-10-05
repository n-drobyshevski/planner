import { describe, expect, it } from "vitest";
import { render, screen } from "../test-utils";

import { StagesSection, stageNights } from "@/components/insights/sleep/stages-section";
import type { SleepLog } from "@/lib/types";

function log(date: string, over: Partial<SleepLog> = {}): SleepLog {
  return {
    id: date,
    workspaceId: "w1",
    memberId: "m1",
    date,
    bedtimeAt: null,
    wokeAt: null,
    quality: null,
    fatigue: null,
    note: null,
    timesSource: "health_connect",
    asleepMin: 420,
    deepMin: 60,
    lightMin: 270,
    remMin: 90,
    awakeMin: 30,
    createdAt: 0,
    ...over,
  };
}

describe("stageNights", () => {
  it("keeps nights with stages, newest first, capped", () => {
    const logs = [
      log("2026-10-01"),
      log("2026-10-03"),
      log("2026-10-02", { deepMin: null, lightMin: null, remMin: null }),
    ];
    expect(stageNights(logs).map((n) => n.date)).toEqual(["2026-10-03", "2026-10-01"]);
    expect(stageNights(logs, 1)).toHaveLength(1);
  });
});

describe("StagesSection", () => {
  it("renders nothing without stages", () => {
    const { container } = render(
      <StagesSection logs={[log("2026-10-01", { deepMin: null, lightMin: null, remMin: null })]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("draws one proportional segment per stage, with a text summary", () => {
    const { container } = render(<StagesSection logs={[log("2026-10-05")]} />);
    const deep = container.querySelector<HTMLElement>('[data-stage="deep"]');
    // 60 of 450 minutes.
    expect(deep?.style.width).toBe(`${(60 / 450) * 100}%`);
    expect(container.querySelectorAll("[data-stage]")).toHaveLength(4);
    expect(screen.getByText("7h asleep")).toBeInTheDocument();
    expect(screen.getByText(/deep 1h, light 4h 30m, REM 1h 30m, awake 30m/)).toBeInTheDocument();
    expect(screen.getByText(/from Health Connect/)).toBeInTheDocument();
  });
});
