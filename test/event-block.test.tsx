import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { EventBlock } from "@/components/calendar/event-block";
import { ContextBackdrop } from "@/components/calendar/context-backdrop";
import type { Occurrence } from "@/lib/types";

function occ(over: Partial<Occurrence> = {}): Occurrence {
  return {
    key: "e:1",
    eventId: "e",
    occurrenceDate: 0,
    start: 0,
    end: 3_600_000,
    allDay: false,
    inactive: false,
    status: "confirmed",
    title: "Test",
    description: null,
    location: null,
    categoryId: null,
    color: null,
    kind: "event",
    ownerId: "m",
    isPrivate: false,
    isShared: false,
    taskId: null,
    isRecurring: false,
    isException: false,
    ...over,
  };
}

// Regression: on desktop these leaves are wrapped in a Radix `<ContextMenuTrigger
// asChild>`, whose Slot MERGES the trigger's `className` ("select-none") onto the
// leaf. The leaf must compose that incoming className with its own classes — if a
// trailing `{...rest}` clobbers them, the block loses `position: absolute` and
// falls out of its time-grid placement (renders below the grid, "snapped off time").
describe("EventBlock — composes an injected className (asChild)", () => {
  it("keeps its own positioning classes when a className is injected", () => {
    const { container } = render(
      <EventBlock
        occ={occ()}
        color="#ffffff"
        selected={false}
        style={{ top: 5, height: 10 }}
        className="injected-by-slot"
      />,
    );
    const el = container.querySelector("[data-occ-key]")!;
    expect(el).toHaveClass("absolute"); // own positioning class must survive
    expect(el).toHaveClass("injected-by-slot"); // injected class also applied
  });
});

describe("ContextBackdrop — composes an injected className (asChild)", () => {
  it("keeps its own positioning classes when a className is injected", () => {
    const { container } = render(
      <ContextBackdrop
        occ={occ({ kind: "context" })}
        color="#ffffff"
        selected={false}
        style={{ top: 5, height: 10 }}
        className="injected-by-slot"
      />,
    );
    const el = container.querySelector("[data-occ-key]")!;
    expect(el).toHaveClass("absolute");
    expect(el).toHaveClass("injected-by-slot");
  });
});
