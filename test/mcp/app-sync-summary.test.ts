import { describe, expect, it } from "vitest";

import type { SyncBoardOut } from "@/lib/mcp/echo-sync";
import { STRINGS, syncSummary } from "@/lib/mcp/app/view-model";

const zero: Omit<SyncBoardOut, "outcome"> = {
  cards_added: 0, cards_changed: 0, cards_tagged: 0, cards_removed: 0,
  tasks_created: 0, tasks_changed: 0, tasks_untagged: 0, paired: 0, conflicts: 0,
  skipped: 0, waiting: 0, held: 0, subs_added: 0, subs_changed: 0, subs_removed: 0,
  subs_created: 0, subs_detached: 0, deps_changed: 0, subs_paired: 0,
};
const board = (extra: Partial<SyncBoardOut> = {}): SyncBoardOut => ({ outcome: "ok", ...zero, ...extra });
const done = (...boards: SyncBoardOut[]) => ({ status: "done" as const, outcome: "ok", boards });

describe("syncSummary", () => {
  it("sums the boards into one short line", () => {
    const result = done(board({ cards_changed: 2, cards_added: 1, tasks_created: 1 }), board({ cards_tagged: 4 }));
    expect(syncSummary(result, STRINGS.en)).toBe("Synced: 3 cards changed, 1 task created.");
    expect(syncSummary(result, STRINGS.ru)).toBe("Готово: изменено 3 карточки, создана 1 задача.");
  });

  it("says when there was nothing to do (ids given to cards do not count)", () => {
    expect(syncSummary(done(board({ cards_tagged: 2 })), STRINGS.en)).toBe("Synced: nothing to change.");
    expect(syncSummary(done(), STRINGS.ru)).toBe("Готово: менять нечего.");
  });

  it("names subtasks, links, conflicts and held removals", () => {
    const result = done(board({ subs_added: 1, subs_detached: 1, deps_changed: 1, conflicts: 2, held: 5, tasks_untagged: 1 }));
    expect(syncSummary(result, STRINGS.en)).toBe(
      "Synced: 1 task changed, 2 subtasks changed, 1 link changed, 2 conflicts (the planner won), " +
        "5 removals held back, one side looks almost empty (if that is right, send /boards now to Echo).",
    );
    expect(syncSummary(done(board({ tasks_changed: 5, conflicts: 1 })), STRINGS.ru)).toBe(
      "Готово: изменено 5 задач, 1 конфликт (победил планер).",
    );
  });

  it("leaves out a board that changed under the pass, and says so", () => {
    const result = done(board({ cards_changed: 1 }), board({ outcome: "changed", cards_changed: 9 }));
    expect(syncSummary(result, STRINGS.en)).toBe(
      "Synced: 1 card changed, a board changed during the sync and waits for the next one.",
    );
    expect(syncSummary(done(board({ outcome: "missing" })), STRINGS.en)).toBe("Synced: a board could not be read.");
  });

  it("explains a pass that stopped", () => {
    expect(syncSummary({ status: "done", outcome: "planner_unavailable", boards: [] }, STRINGS.en)).toBe(
      "Echo could not reach the planner.",
    );
    expect(syncSummary({ status: "done", outcome: "no_boards", boards: [] }, STRINGS.ru)).toBe("Echo не нашёл досок задач.");
    expect(syncSummary({ status: "done", outcome: "weird", boards: [] }, STRINGS.en)).toBe(
      "The sync stopped before it was done.",
    );
  });

  it("covers the answers without counts", () => {
    expect(syncSummary({ status: "queued" }, STRINGS.en)).toBe("Echo is still syncing; refresh in a moment.");
    expect(syncSummary({ status: "already_queued" }, STRINGS.en)).toBe("A sync is already on its way; refresh in a moment.");
    expect(syncSummary({ status: "failed" }, STRINGS.ru)).toBe("Echo не смог закончить синхронизацию.");
  });

  it("has both locales' labels", () => {
    expect(STRINGS.en.sync).toBe("Sync with Obsidian");
    expect(STRINGS.ru.sync).toBe("Синхронизировать с Obsidian");
    expect(STRINGS.en.syncing).toBe("Syncing…");
    expect(STRINGS.ru.syncing).toBe("Синхронизирую…");
  });
});
