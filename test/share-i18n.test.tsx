import { describe, it, expect, vi } from "vitest";
import { render as rtlRender } from "@testing-library/react";
import { render, screen } from "./test-utils";
import { CalendarCanvas } from "@/components/calendar/calendar-canvas";

/**
 * Regression guard for the public share page (app/share/[token]).
 *
 * That route lives OUTSIDE the `[locale]` segment, so it gets no
 * `NextIntlClientProvider` from a layout. The calendar leaves it reuses
 * (TimeGrid / MonthGrid / EventBlock …) call `useTranslations` / `useLocale`,
 * so the share page must mount its own provider — otherwise the whole page
 * crashes to Next's default error screen (this regressed once when the i18n
 * migration added `useTranslations` to the calendar after the share view shipped).
 *
 * `render` (from ./test-utils) wraps children in the SAME provider the share page
 * mounts — `<NextIntlClientProvider locale="en" messages={...} timeZone="UTC">` —
 * so this asserts that exact wiring keeps the calendar renderable. The negative
 * case proves the dependency is real.
 */

const CANVAS_PROPS = {
  view: "month" as const,
  days: [],
  occurrences: [],
  focusedMs: 0,
  colorOf: () => "#57534e",
  selectedKey: null,
  onSelect: vi.fn(),
  onPickDay: vi.fn(),
  onCreateRange: vi.fn(),
  onCreateDay: vi.fn(),
  onReschedule: vi.fn(),
  onChangeColor: vi.fn(),
  onDeleteEvent: vi.fn(),
  loading: false,
  error: false,
};

describe("public share i18n wiring", () => {
  it("renders the calendar inside the share page's next-intl provider", () => {
    // Same provider config the share page mounts — must not throw.
    render(<CalendarCanvas {...CANVAS_PROPS} />);
    // A weekday header from the `calendar` namespace proves the catalog resolved.
    expect(screen.getAllByText(/mon/i).length).toBeGreaterThan(0);
  });

  it("crashes without an intl provider (the bug this guards against)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => rtlRender(<CalendarCanvas {...CANVAS_PROPS} />)).toThrow(
      /intl context/i,
    );
    spy.mockRestore();
  });
});
