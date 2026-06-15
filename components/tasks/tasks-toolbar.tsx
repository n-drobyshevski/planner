"use client";

import { Plus, MoreVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { ToolbarSlot } from "@/components/toolbar-slots";
import { MobileAccountSection } from "@/components/mobile-account-section";
import { CollectionSwitcher } from "./collection-switcher";
import type { Member } from "@/lib/types";

export type TasksView = "board" | "list" | "flows";

/**
 * Tasks controls, portaled into the shared surface header (SurfaceChrome owns
 * the <header>, AppNav, swipe, and the desktop user menu). The collection
 * switcher sits in the center slot — right of the AppNav mode switcher,
 * mirroring how Insights places its period selector — and stays put across
 * breakpoints; below `md` the view toggle collapses into the `⋯` menu so the row
 * never overflows a phone.
 */
export function TasksToolbar({
  view,
  onViewChange,
  onNewTask,
  currentMember,
  activeCollectionId,
  onCollectionChange,
  taskCountByCollection,
  collectionCount,
}: {
  view: TasksView;
  onViewChange: (v: TasksView) => void;
  onNewTask: () => void;
  currentMember: Member | null;
  activeCollectionId: string | null;
  onCollectionChange: (collectionId: string) => void;
  taskCountByCollection: Map<string, number>;
  /** Number of collections — drives whether the switcher shows. */
  collectionCount: number;
}) {
  const t = useTranslations("tasks");
  // The in-view breadcrumb owns collection switching/managing in every view, so
  // the toolbar switcher would be a redundant second control — hide it. The lone
  // exception is the no-collections empty state, where the switcher is the only
  // "New collection" entry point (the breadcrumb needs an active collection to
  // render).
  const showSwitcher = collectionCount === 0;
  return (
    <>
      <ToolbarSlot name="center">
        {showSwitcher && (
          <CollectionSwitcher
            activeCollectionId={activeCollectionId}
            onActiveCollectionChange={onCollectionChange}
            taskCountByCollection={taskCountByCollection}
          />
        )}
      </ToolbarSlot>
      <ToolbarSlot name="trailing">
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => v && onViewChange(v as TasksView)}
          variant="outline"
          size="sm"
          className="hidden md:flex"
        >
          <ToggleGroupItem value="board">{t("toolbar.board")}</ToggleGroupItem>
          <ToggleGroupItem value="list">{t("toolbar.list")}</ToggleGroupItem>
          <ToggleGroupItem value="flows">{t("toolbar.flows")}</ToggleGroupItem>
        </ToggleGroup>
        {/* New task: a labelled button on desktop, a square icon button below md.
            An icon-only button needs its own aria-label — a CSS-hidden label is
            dropped from the accessible name. Mirrors the calendar toolbar. */}
        <Button size="sm" onClick={onNewTask} className="hidden md:inline-flex">
          <Plus data-icon="inline-start" />
          {t("toolbar.newTask")}
        </Button>
        <Button
          size="icon"
          aria-label={t("toolbar.newTask")}
          onClick={onNewTask}
          className="md:hidden"
        >
          <Plus />
        </Button>
        <TasksMobileMenu
          view={view}
          onViewChange={onViewChange}
          current={currentMember}
        />
      </ToolbarSlot>
    </>
  );
}

/** Phone-only overflow menu: the view toggle plus profile / settings / sign-out. */
function TasksMobileMenu({
  view,
  onViewChange,
  current,
}: {
  view: TasksView;
  onViewChange: (v: TasksView) => void;
  current: Member | null;
}) {
  const t = useTranslations("tasks");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("toolbar.moreOptions")}
          className="md:hidden"
        >
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("toolbar.view")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={view}
          onValueChange={(v) => v && onViewChange(v as TasksView)}
        >
          <DropdownMenuRadioItem value="board">{t("toolbar.board")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="list">{t("toolbar.list")}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <MobileAccountSection current={current} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
