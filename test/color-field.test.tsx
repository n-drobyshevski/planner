import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ColorField } from "@/components/shared/color-field";

describe("ColorField — trigger label", () => {
  it("shows 'Default' when no color is set", () => {
    render(<ColorField value={null} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Color: Default" })).toBeInTheDocument();
  });

  it("shows the swatch label for a known accent hex", () => {
    // #c0492a is the default-palette 'peach' swatch (see appearance ACCENTS).
    render(<ColorField value="#c0492a" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Color: Peach" })).toBeInTheDocument();
  });

  it("matches the hex case-insensitively", () => {
    render(<ColorField value="#C0492A" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Color: Peach" })).toBeInTheDocument();
  });
});
