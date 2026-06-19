import { describe, it, expect, vi } from "vitest";
import { render } from "./test-utils";
import { DayColumn } from "@/components/calendar/day-column";
import { HOUR_PX } from "@/lib/datetime/grid-math";

// A fixed day-start far from "now" so the now-line never renders. msToY is
// relative to dayStart, so the absolute value is otherwise irrelevant.
const DAY_START = 1_700_000_000_000;
const HOUR = 3_600_000;

const BASE = {
  dayStart: DAY_START,
  occurrences: [],
  isToday: false,
  colorOf: () => "#57534e",
  selectedKeys: new Set<string>(),
  onSelect: vi.fn(),
  onChangeColor: vi.fn(),
  onColorSelected: vi.fn(),
  onDeleteEvent: vi.fn(),
  canEdit: () => false,
};

describe("DayColumn — Unavailable bands", () => {
  it("renders a hatched, labelled band clipped to the day", () => {
    // A band from 1h BEFORE midnight to 2h after → clips to [dayStart, +2h].
    const { container, getByText } = render(
      <DayColumn
        {...BASE}
        unavailableBands={[{ start: DAY_START - HOUR, end: DAY_START + 2 * HOUR }]}
      />,
    );
    const band = container.querySelector(".evt-unavailable") as HTMLElement | null;
    expect(band).not.toBeNull();
    // Clipped: starts at the top (0) and is exactly 2h tall.
    expect(band!.style.top).toBe("0px");
    expect(band!.style.height).toBe(`${2 * HOUR_PX}px`);
    // Accessible + visible non-color signal.
    expect(band!.getAttribute("aria-label")).toBe("Unavailable");
    expect(getByText("Unavailable")).toBeInTheDocument();
    expect(band!.className).toContain("pointer-events-none");
  });

  it("renders nothing for a band entirely outside the day", () => {
    const { container } = render(
      <DayColumn
        {...BASE}
        unavailableBands={[{ start: DAY_START - 3 * HOUR, end: DAY_START - HOUR }]}
      />,
    );
    expect(container.querySelector(".evt-unavailable")).toBeNull();
  });

  it("renders no band layer when none are passed", () => {
    const { container } = render(<DayColumn {...BASE} />);
    expect(container.querySelector(".evt-unavailable")).toBeNull();
  });
});
