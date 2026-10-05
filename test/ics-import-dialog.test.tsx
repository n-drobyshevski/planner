import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "./test-utils";
import { IcsImportDialog } from "@/components/calendar/ics-import-dialog";
import { localTimeZone } from "@/lib/datetime/local";
import type { ImportItem } from "@/lib/hooks/use-event-mutations";
import type { Category } from "@/lib/types";

const { importEvents, fetchImportDuplicates } = vi.hoisted(() => ({
  importEvents: vi.fn<(items: ImportItem[]) => Promise<boolean>>(async () => true),
  fetchImportDuplicates: vi.fn(),
}));

vi.mock("@/lib/hooks/use-event-mutations", () => ({
  useEventMutations: () => ({ importEvents }),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/supabase/queries", () => ({ fetchImportDuplicates }));

// The responsive dialog subscribes to a media query; jsdom has none.
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
    }) as MediaQueryList;
}
// Radix ScrollArea measures its viewport.
if (!("ResizeObserver" in window)) {
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const ICS = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT", "UID:sync@x", "SUMMARY:Team sync", "DTSTART:20261007T090000Z", "DTEND:20261007T100000Z", "END:VEVENT",
  "BEGIN:VEVENT", "UID:dentist@x", "SUMMARY:Dentist", "DTSTART;VALUE=DATE:20261008", "DTEND;VALUE=DATE:20261009", "END:VEVENT",
  "BEGIN:VEVENT", "UID:old@x", "SUMMARY:Old meeting", "DTSTART:20260901T090000Z", "DTEND:20260901T100000Z", "END:VEVENT",
  "BEGIN:VEVENT", "UID:retro@x", "SUMMARY:Team retro", "DTSTART:20261009T100000Z", "DTEND:20261009T110000Z", "END:VEVENT",
  "BEGIN:VEVENT", "SUMMARY:No start", "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const categories: Category[] = [];

function renderDialog() {
  const file = new File([ICS], "work.ics", { type: "text/calendar" });
  return render(
    <IcsImportDialog
      open
      onOpenChange={vi.fn()}
      file={file}
      workspaceId="ws"
      currentMemberId="me"
      categories={categories}
    />,
  );
}

const rowCheckbox = (title: string) => screen.getByRole("checkbox", { name: `Import ${title}` });

describe("IcsImportDialog", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T12:00:00Z"));
  });
  afterAll(() => vi.useRealTimers());
  beforeEach(() => {
    importEvents.mockClear();
    fetchImportDuplicates.mockReset();
    fetchImportDuplicates.mockResolvedValue([
      // Already imported once: matched by UID.
      { icalUid: "retro@x", title: "Retro", start: 0, end: 0 },
    ]);
  });

  it("lists the file's events from today, marking duplicates and unticking them", async () => {
    renderDialog();
    expect(await screen.findByText("Team sync")).toBeInTheDocument();
    expect(screen.getByText("Dentist")).toBeInTheDocument();
    expect(screen.getByText("Team retro")).toBeInTheDocument();
    // From defaults to today, so the past event is filtered out.
    expect(screen.queryByText("Old meeting")).toBeNull();
    expect(screen.getByText("Already in Planr")).toBeInTheDocument();
    expect(rowCheckbox("Team sync")).toBeChecked();
    expect(rowCheckbox("Dentist")).toBeChecked();
    expect(rowCheckbox("Team retro")).not.toBeChecked();
    // The VEVENT without DTSTART is reported, not listed.
    expect(screen.getByText("1 event in the file couldn't be read.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import 2 events" })).toBeEnabled();

    expect(fetchImportDuplicates).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        workspaceId: "ws",
        ownerId: "me",
        uids: expect.arrayContaining(["sync@x", "dentist@x", "old@x", "retro@x"]),
        minStart: Date.UTC(2026, 8, 1, 9),
        maxEnd: Date.UTC(2026, 9, 9, 11),
      }),
    );
  });

  it("filters by name, flags an invalid regex, and selects only what's shown", async () => {
    renderDialog();
    await screen.findByText("Team sync");
    const name = screen.getByRole("textbox", { name: "Name" });

    fireEvent.change(name, { target: { value: "team*" } });
    expect(screen.queryByText("Dentist")).toBeNull();
    expect(screen.getByText("Team sync")).toBeInTheDocument();
    expect(screen.getByText("Team retro")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select none" }));
    expect(rowCheckbox("Team sync")).not.toBeChecked();
    // Dentist was hidden, so it keeps its tick.
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(rowCheckbox("Team sync")).toBeChecked();
    expect(rowCheckbox("Team retro")).toBeChecked();
    expect(screen.getByRole("button", { name: "Import 2 events" })).toBeEnabled();

    fireEvent.change(name, { target: { value: "/[oops/" } });
    expect(screen.getByText("That regular expression isn't valid.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Import/ })).toBeDisabled();

    fireEvent.change(name, { target: { value: "" } });
    expect(rowCheckbox("Dentist")).toBeChecked();
    expect(screen.getByRole("button", { name: "Import 3 events" })).toBeEnabled();
  });

  it("edits a row inline and imports the ticked, filtered rows", async () => {
    renderDialog();
    await screen.findByText("Team sync");

    fireEvent.click(screen.getByRole("button", { name: "Edit Team sync" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
      target: { value: "Team sync (moved)" },
    });
    const row = screen.getByText("Team sync (moved)").closest("li")!;
    expect(within(row).getByText("Edited")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Import 2 events" }));
    await waitFor(() => expect(importEvents).toHaveBeenCalledTimes(1));

    const zone = localTimeZone();
    expect(importEvents.mock.calls[0][0]).toEqual([
      {
        input: {
          workspaceId: "ws",
          ownerId: "me",
          kind: "event",
          categoryId: null,
          isPrivate: false,
          isShared: false,
          title: "Team sync (moved)",
          description: null,
          location: null,
          allDay: false,
          status: "confirmed",
          start: Date.UTC(2026, 9, 7, 9),
          end: Date.UTC(2026, 9, 7, 10),
          timeZone: zone,
          rrule: null,
          recurrenceEndsAt: null,
          attributes: { icalUid: "sync@x" },
        },
        exdates: [],
      },
      {
        input: expect.objectContaining({
          title: "Dentist",
          allDay: true,
          start: Date.UTC(2026, 9, 8),
          end: Date.UTC(2026, 9, 9),
          attributes: { icalUid: "dentist@x" },
        }),
        exdates: [],
      },
    ]);
  });

  it("files the import as private when chosen", async () => {
    renderDialog();
    await screen.findByText("Team sync");
    fireEvent.click(screen.getByRole("radio", { name: "Private" }));
    fireEvent.click(screen.getByRole("button", { name: "Import 2 events" }));
    await waitFor(() => expect(importEvents).toHaveBeenCalledTimes(1));
    for (const item of importEvents.mock.calls[0][0]) {
      expect(item.input).toMatchObject({ isPrivate: true, isShared: false });
    }
  });

  it("says so when the file has no events", async () => {
    const file = new File(["BEGIN:VCALENDAR\r\nEND:VCALENDAR"], "empty.ics");
    render(
      <IcsImportDialog
        open
        onOpenChange={vi.fn()}
        file={file}
        workspaceId="ws"
        currentMemberId="me"
        categories={categories}
      />,
    );
    expect(await screen.findByText("There are no events in this file.")).toBeInTheDocument();
    expect(fetchImportDuplicates).not.toHaveBeenCalled();
  });
});
