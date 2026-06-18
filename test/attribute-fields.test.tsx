import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "./test-utils";
import { AttributeFields } from "@/components/shared/attribute-fields";
import { ATTRIBUTE_META, type ItemAttributes } from "@/lib/attributes/schema";

describe("AttributeFields", () => {
  it("renders one labelled group per attribute", () => {
    render(<AttributeFields value={{}} onChange={vi.fn()} idPrefix="t" />);
    for (const meta of ATTRIBUTE_META) {
      expect(screen.getByRole("group", { name: meta.label })).toBeInTheDocument();
    }
  });

  it("selecting an option emits the typed value", () => {
    const onChange = vi.fn();
    render(<AttributeFields value={{}} onChange={onChange} idPrefix="t" />);
    fireEvent.click(screen.getByRole("radio", { name: "Deep" }));
    expect(onChange).toHaveBeenCalledWith({ focus: "deep" });

    onChange.mockClear();
    fireEvent.click(screen.getByRole("radio", { name: "3 High" }));
    expect(onChange).toHaveBeenCalledWith({ energy: 3 });
  });

  it("clicking the active option clears the key entirely", () => {
    const onChange = vi.fn();
    render(
      <AttributeFields value={{ focus: "deep" }} onChange={onChange} idPrefix="t" />,
    );
    const deep = screen.getByRole("radio", { name: "Deep" });
    expect(deep).toHaveAttribute("aria-checked", "true");
    fireEvent.click(deep);
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as ItemAttributes;
    expect(next).toEqual({});
    expect("focus" in next).toBe(false);
  });

  it("preserves unknown keys through onChange", () => {
    const onChange = vi.fn();
    render(
      <AttributeFields
        value={{ mood: "calm" } as ItemAttributes}
        onChange={onChange}
        idPrefix="t"
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "4 Great" }));
    expect(onChange).toHaveBeenCalledWith({ mood: "calm", satisfaction: 4 });
  });
});
