import { useEffect, useRef } from "react";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
} from "planner";
import { Pencil, Copy, Lock, Trash2 } from "lucide-react";

// Radix ContextMenu has no open/defaultOpen prop — it only opens on a real
// right-click. To show the open menu in static capture, dispatch a genuine
// `contextmenu` event on the trigger after mount (this drives the real Radix
// open state, not a hand-built lookalike).
export function TaskContextMenu() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: Math.round(r.left + r.width / 2),
        clientY: Math.round(r.top + r.height / 2),
      }),
    );
  }, []);

  return (
    <ContextMenu>
      <ContextMenuTrigger
        ref={ref}
        className="flex h-16 w-72 items-center rounded-2xl border border-dashed border-border px-4 text-sm text-muted-foreground"
      >
        Buy groceries for the weekend
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>Task</ContextMenuLabel>
        <ContextMenuItem>
          <Pencil /> Edit
          <ContextMenuShortcut>⌘E</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem>
          <Copy /> Duplicate
        </ContextMenuItem>
        <ContextMenuItem>
          <Lock /> Make private
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive">
          <Trash2 /> Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
