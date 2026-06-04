import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ShortcutsDialog } from "@/components/calendar/shortcuts-dialog";

describe("ShortcutsDialog", () => {
  it("surfaces the otherwise-invisible power gestures when open", () => {
    render(<ShortcutsDialog open onOpenChange={() => {}} />);
    expect(screen.getByText(/keyboard & gestures/i)).toBeInTheDocument();
    // One representative shortcut from each group.
    expect(screen.getByText("Duplicate")).toBeInTheDocument();
    expect(screen.getByText("Whole recurring series")).toBeInTheDocument();
    expect(screen.getByText("Add events to a selection")).toBeInTheDocument();
    expect(screen.getByText("Zoom the timeline")).toBeInTheDocument();
    expect(screen.getByText("Show this list")).toBeInTheDocument(); // documents `?` itself
  });

  it("renders nothing when closed", () => {
    render(<ShortcutsDialog open={false} onOpenChange={() => {}} />);
    expect(screen.queryByText(/keyboard & gestures/i)).not.toBeInTheDocument();
  });
});
