import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
  it("shows the 24-hour value", () => {
    render(<TimeField value="09:00" onChange={vi.fn()} aria-label="Start time" />);
    expect(screen.getByLabelText("Start time")).toHaveValue("09:00");
  });
  it("normalizes and emits on blur when the value changes", () => {
    const onChange = vi.fn();
    render(<TimeField value="08:00" onChange={onChange} aria-label="t" />);
    const input = screen.getByLabelText("t");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "0900" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("09:00");
  });
  it("does not emit when the normalized value is unchanged", () => {
    const onChange = vi.fn();
    render(<TimeField value="09:00" onChange={onChange} aria-label="t" />);
    const input = screen.getByLabelText("t");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "0900" } }); // normalizes to 09:00 == value
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });
  it("reverts invalid input on blur without calling onChange", () => {
    const onChange = vi.fn();
    render(<TimeField value="09:00" onChange={onChange} aria-label="t" />);
    const input = screen.getByLabelText("t");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "99:99" } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("09:00");
  });
});
