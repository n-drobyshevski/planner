import { describe, it, expect } from "vitest";
import { render, screen } from "./test-utils";
import { ViewSwitcher } from "@/components/calendar/view-switcher";

describe("ViewSwitcher", () => {
  it("offers every view in zoom order, including 3-day", () => {
    render(<ViewSwitcher view="week" onViewChange={() => {}} />);
    for (const label of ["Agenda", "Day", "3 days", "Week", "Month"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
