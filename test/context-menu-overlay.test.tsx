import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItemContextMenu } from "@/components/shared/item-context-menu";
import { Pencil, Trash2 } from "lucide-react";

// useIsMobile reads matchMedia; stub it so the desktop (Radix ContextMenu)
// branch renders under jsdom.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// Regression: the desktop right-click menu must be NON-modal. A modal Radix
// ContextMenu locks `pointer-events: none` on <body> while open and holds a
// focus guard as it tears down — when an item opens a dialog (Edit → details,
// Delete → recurrence prompt) that lock/guard freezes or dismisses the dialog,
// so the items look inert ("inactive"). Non-modal leaves the body interactive.
describe("ItemContextMenu — desktop right-click menu", () => {
  it("does not lock body pointer-events while open (non-modal)", async () => {
    const user = userEvent.setup();
    render(
      <ItemContextMenu
        title="Test"
        actions={[{ label: "Edit", icon: Pencil, onSelect: vi.fn() }]}
      >
        <div data-testid="leaf">leaf</div>
      </ItemContextMenu>,
    );

    await user.pointer({ keys: "[MouseRight]", target: screen.getByTestId("leaf") });
    await screen.findByText("Edit");
    // A modal menu would set this to "none"; non-modal must leave it interactive.
    expect(document.body.style.pointerEvents).not.toBe("none");
  });

  it("fires Edit and Delete handlers", async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(
      <ItemContextMenu
        title="Test"
        actions={[
          { label: "Edit", icon: Pencil, onSelect: onEdit },
          { label: "Delete", icon: Trash2, destructive: true, onSelect: onDelete },
        ]}
      >
        <div data-testid="leaf">leaf</div>
      </ItemContextMenu>,
    );

    await user.pointer({ keys: "[MouseRight]", target: screen.getByTestId("leaf") });
    await user.click(await screen.findByText("Edit"));
    await waitFor(() => expect(onEdit).toHaveBeenCalledTimes(1));

    await user.pointer({ keys: "[MouseRight]", target: screen.getByTestId("leaf") });
    await user.click(await screen.findByText("Delete"));
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });
});
