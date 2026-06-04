import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ViewSwitcher } from "@/components/calendar/view-switcher";

describe("ViewSwitcher", () => {
  it("offers four primary views in zoom order; 3-day is demoted to the menu", () => {
    render(<ViewSwitcher view="week" onViewChange={() => {}} />);
    for (const label of ["Agenda", "Day", "Week", "Month"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // Over the ≤4 cognitive-load limit before; "3 Day" now lives only in the
    // mobile menu (and ?view=3day), not the desktop bar.
    expect(screen.queryByText("3 Day")).not.toBeInTheDocument();
  });
});
