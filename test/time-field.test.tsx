import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "./test-utils";
import { TimeField, normalizeTime } from "@/components/ui/time-field";

describe("normalizeTime", () => {
  it("normalizes loose input to HH:mm", () => {
    expect(normalizeTime("9")).toBe("09:00");
    expect(normalizeTime("0")).toBe("00:00");
    expect(normalizeTime("9:5")).toBe("09:05");
    expect(normalizeTime("900")).toBe("09:00");
    expect(normalizeTime("0900")).toBe("09:00");
    expect(normalizeTime("23:59")).toBe("23:59");
    expect(normalizeTime(" 7:30 ")).toBe("07:30");
  });
  it("rejects invalid input", () => {
    expect(normalizeTime("24:00")).toBeNull();
    expect(normalizeTime("12:60")).toBeNull();
    expect(normalizeTime("abc")).toBeNull();
    expect(normalizeTime("")).toBeNull();
  });
});

describe("TimeField", () => {
  it("renders a native time input showing the 24-hour value", () => {
    render(<TimeField value="09:00" onChange={vi.fn()} aria-label="Start time" />);
    const input = screen.getByLabelText("Start time");
    expect(input).toHaveAttribute("type", "time");
    expect(input).toHaveValue("09:00");
  });
  it("emits the picked HH:mm value on change", () => {
    const onChange = vi.fn();
    render(<TimeField value="08:00" onChange={onChange} aria-label="t" />);
    const input = screen.getByLabelText("t");
    fireEvent.change(input, { target: { value: "09:30" } });
    expect(onChange).toHaveBeenCalledWith("09:30");
  });
  it("emits an empty string when cleared", () => {
    const onChange = vi.fn();
    render(<TimeField value="09:00" onChange={onChange} aria-label="t" />);
    const input = screen.getByLabelText("t");
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith("");
  });
  it("can be disabled", () => {
    render(<TimeField value="09:00" onChange={vi.fn()} aria-label="t" disabled />);
    expect(screen.getByLabelText("t")).toBeDisabled();
  });
});
