import { describe, it, expect } from "vitest";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { render, screen } from "../test-utils";
import { TagField } from "@/components/tasks/tag-field";
import { MAX_TAGS } from "@/lib/tasks/tags";

function Harness({ initial = [], suggestions = [] }: { initial?: string[]; suggestions?: string[] }) {
  const [tags, setTags] = useState<string[]>(initial);
  return (
    <>
      <span id="lbl">Tags</span>
      <TagField id="tags" labelId="lbl" value={tags} onChange={setTags} suggestions={suggestions} />
      <output data-testid="value">{JSON.stringify(tags)}</output>
    </>
  );
}

const value = () => JSON.parse(screen.getByTestId("value").textContent ?? "[]");

describe("TagField", () => {
  it("is a labelled combobox", () => {
    render(<Harness />);
    expect(screen.getByRole("combobox", { name: "Tags" })).toBeInTheDocument();
  });

  it("commits on Enter and on comma, normalized", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole("combobox");
    await user.type(input, "#Deep Work{Enter}");
    await user.type(input, "Home,");
    expect(value()).toEqual(["deep-work", "home"]);
    expect(input).toHaveValue("");
  });

  it("drops duplicates and removes the last tag on Backspace", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["home", "work"]} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "HOME{Enter}");
    expect(value()).toEqual(["home", "work"]);
    await user.type(input, "{Backspace}");
    expect(value()).toEqual(["home"]);
  });

  it("removes a tag from its labelled button", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["home", "work"]} />);
    await user.click(screen.getByRole("button", { name: "Remove tag home" }));
    expect(value()).toEqual(["work"]);
  });

  it("offers tags in use and picks one with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<Harness suggestions={["admin", "thesis", "home"]} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "ad");
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["#admin", "Add “ad”"]);
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", options[0].id);
    await user.keyboard("{Enter}");
    expect(value()).toEqual(["admin"]);
  });

  it("commits a typed tag on blur", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole("combobox"), "garden");
    await user.tab();
    expect(value()).toEqual(["garden"]);
  });

  it("stops at MAX_TAGS", () => {
    const full = Array.from({ length: MAX_TAGS }, (_, i) => `t${i}`);
    render(<Harness initial={full} />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
