import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "@/messages/en";
import ru from "@/messages/ru";
import { InboxRow } from "@/components/inbox/inbox-row";
import { formatSleepPromptDate } from "@/lib/datetime/format";
import type { LogSleepItem } from "@/lib/inbox/derive";

// Wed 2026-10-07: the wake day the sleep prompt asks about.
const item: LogSleepItem = {
  id: "log-sleep:2026-10-07",
  kind: "log-sleep",
  severity: "info",
  sortMs: Date.UTC(2026, 9, 7, 12),
  dateKey: "2026-10-07",
};

function renderRow(locale: "en" | "ru") {
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "ru" ? ru : en} timeZone="UTC">
      <ul>
        <InboxRow
          item={item}
          timeZone="UTC"
          now={Date.UTC(2026, 9, 7, 15)}
          onRate={vi.fn()}
          onLogSleep={vi.fn()}
          onApprove={vi.fn()}
          onDecline={vi.fn()}
        />
      </ul>
    </NextIntlClientProvider>,
  );
}

describe("formatSleepPromptDate", () => {
  const wake = Date.UTC(2026, 9, 7);

  it("names the weekday in English", () => {
    expect(formatSleepPromptDate(wake, "UTC", "en")).toBe("Wednesday 7 Oct");
  });

  it("takes the genitive month and no weekday in Russian", () => {
    expect(formatSleepPromptDate(wake, "UTC", "ru")).toBe("7 октября");
  });
});

describe("InboxRow sleep prompt", () => {
  it("reads naturally in English", () => {
    renderRow("en");
    expect(screen.getByText("How did you sleep on Wednesday 7 Oct?")).toBeTruthy();
  });

  it("reads naturally in Russian (в ночь на 7 октября)", () => {
    renderRow("ru");
    expect(screen.getByText("Как спалось в ночь на 7 октября?")).toBeTruthy();
  });
});
