import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    attributes: {},
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

describe("EventBlock — privacy / sharing glyphs (non-colour signals)", () => {
  function glyphs(over: Partial<Occurrence>) {
    const { container } = render(
      <EventBlock occ={occ(over)} color="#ffffff" selected={false} style={{}} />,
    );
    return {
      lock: container.querySelector('[aria-label="Private"]'),
      shared: container.querySelector('[aria-label="Shared"]'),
    };
  }
  it("shows a lock on a private event", () => {
    const { lock, shared } = glyphs({ isPrivate: true });
    expect(lock).not.toBeNull();
    expect(shared).toBeNull();
  });
  it("shows the partners icon on a shared event", () => {
    const { lock, shared } = glyphs({ isShared: true });
    expect(shared).not.toBeNull();
    expect(lock).toBeNull();
  });
  it("shows neither on a plain visible event", () => {
    const { lock, shared } = glyphs({});
    expect(lock).toBeNull();
    expect(shared).toBeNull();
  });
});

describe("EventBlock — keyboard activation", () => {
  it("is a roving button (tabindex -1) that opens on Enter and Space", async () => {
    const onActivate = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <EventBlock
        occ={occ()}
        color="#ffffff"
        selected={false}
        style={{}}
        onActivate={onActivate}
      />,
    );
    const el = container.querySelector("[data-occ-key]") as HTMLElement;
    expect(el).toHaveAttribute("role", "button");
    // Roving tabindex: reachable via the grid container + arrow keys, so the
    // block itself is programmatically focusable (-1), not its own Tab stop.
    expect(el).toHaveAttribute("tabindex", "-1");
    el.focus(); // tabindex -1 is still programmatically focusable
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onActivate).toHaveBeenCalledTimes(2);
  });
});

describe("EventBlock — height-aware compact rendering", () => {
  // The time range is the only digits in the block (title is "Test").
  const showsTime = (height: number) => {
    const { container } = render(
      <EventBlock occ={occ()} color="#ffffff" selected={false} style={{ height }} />,
    );
    return /\d{1,2}:\d{2}/.test(container.textContent || "");
  };
  it("shows the time range when the block is tall enough", () => {
    expect(showsTime(60)).toBe(true);
  });
  it("drops the time range on a short block so the title isn't clipped", () => {
    expect(showsTime(24)).toBe(false);
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
