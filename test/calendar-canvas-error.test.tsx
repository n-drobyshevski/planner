import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CalendarCanvas, type CanvasProps } from "@/components/calendar/calendar-canvas";

// Minimal props to reach the error branch (it returns before the views render).
const baseProps: CanvasProps = {
  view: "week",
  days: [0],
  occurrences: [],
  focusedMs: 0,
  colorOf: () => "#ffffff",
  selectedKey: null,
  onSelect: () => {},
  onPickDay: () => {},
  onCreateRange: () => {},
  onCreateDay: () => {},
  onReschedule: () => {},
  onChangeColor: () => {},
  onDeleteEvent: () => {},
  loading: false,
  error: true,
};

describe("CalendarCanvas — error state", () => {
  it("shows plain, recoverable copy without developer jargon (outside dev)", () => {
    render(<CalendarCanvas {...baseProps} onRetry={() => {}} />);
    expect(screen.getByText(/load your calendar/i)).toBeInTheDocument();
    // NODE_ENV is "test" here, so the dev-only schema/seed hint must NOT render.
    expect(screen.queryByText(/schema/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/seed/i)).not.toBeInTheDocument();
  });

  it("announces the failure to assistive tech (role=alert)", () => {
    render(<CalendarCanvas {...baseProps} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("the Try again button re-runs the load", () => {
    const onRetry = vi.fn();
    render(<CalendarCanvas {...baseProps} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("omits the Retry button on display-only panes (no onRetry)", () => {
    render(<CalendarCanvas {...baseProps} />);
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });
});
