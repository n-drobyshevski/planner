import { describe, it, expect, vi } from "vitest";
import { render, screen } from "./test-utils";
import { RecurrenceEditor } from "@/components/event/recurrence-editor";
import type { RecurrenceForm } from "@/lib/recurrence/rrule-build";

const START = Date.UTC(2026, 5, 1, 9, 0, 0); // a Monday

describe("RecurrenceEditor — daily weekday filter", () => {
  it("daily with no days selected shows the interval input and weekday toggles", () => {
    const daily: RecurrenceForm = {
      freq: "DAILY",
      interval: 1,
      byWeekday: [],
      end: { type: "never" },
    };
    render(<RecurrenceEditor value={daily} onChange={vi.fn()} startMs={START} />);
    // "Every N day(s)" is a number input (implicit role spinbutton).
    expect(screen.getByRole("spinbutton")).toBeInTheDocument();
    // Weekday toggles are offered so the user can restrict days.
    expect(screen.getByRole("button", { name: "Mo" })).toBeInTheDocument();
  });

  it("daily with a weekday selected hides the interval input", () => {
    const dailyWithDays: RecurrenceForm = {
      freq: "DAILY",
      interval: 1,
      byWeekday: [0],
      end: { type: "never" },
    };
    render(<RecurrenceEditor value={dailyWithDays} onChange={vi.fn()} startMs={START} />);
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.getByRole("button", { name: "Mo" })).toBeInTheDocument();
  });

  it("weekly with days selected still shows the interval input", () => {
    const weekly: RecurrenceForm = {
      freq: "WEEKLY",
      interval: 2,
      byWeekday: [0, 2],
      end: { type: "never" },
    };
    render(<RecurrenceEditor value={weekly} onChange={vi.fn()} startMs={START} />);
    expect(screen.getByRole("spinbutton")).toBeInTheDocument();
  });
});
