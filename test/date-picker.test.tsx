import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DatePicker } from "@/components/ui/date-picker";

describe("DatePicker", () => {
  it("shows the ISO value as dd/MM/yyyy", () => {
    render(<DatePicker value="2026-06-01" onChange={vi.fn()} aria-label="Start date" />);
    expect(screen.getByRole("button", { name: "Start date" })).toHaveTextContent("01/06/2026");
  });
  it("shows the placeholder when empty", () => {
    render(<DatePicker value="" onChange={vi.fn()} aria-label="Due date" />);
    expect(screen.getByRole("button", { name: "Due date" })).toHaveTextContent("dd/mm/yyyy");
  });
});
