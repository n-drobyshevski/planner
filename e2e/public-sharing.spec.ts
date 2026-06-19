import { test, expect, type Page } from "@playwright/test";

// Phase 4 — public calendar sharing. Requires the seeded test DB (pnpm seed),
// which creates three fixed-token shares ("e2e-details-token", "e2e-busy-token",
// "e2e-context-token"), a "Coffee together" public event, a "Work hours" context
// window, a private "Standup", a hidden-from-public "Hidden lunch", and a pending
// request.
//
// NOTE on ordering: the request endpoint is rate-limited per IP (and per share in
// the DB). The tests that must succeed run BEFORE the rate-limit test, which
// deliberately exhausts the budget and therefore runs LAST.

const DETAILS = "/share/e2e-details-token";
const BUSY = "/share/e2e-busy-token";
const CONTEXT = "/share/e2e-context-token";

async function signIn(page: Page, name: "Alex" | "Sam") {
  await page.goto("/login");
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/calendar**");
}

function slot(daysAhead: number): { start: number; end: number } {
  const start = Date.now() + daysAhead * 86_400_000;
  return { start, end: start + 3_600_000 };
}

test.describe("public share — read path", () => {
  test("details link shows public events but NEVER private or hidden ones", async ({ page }) => {
    await page.goto(DETAILS);
    await expect(page.getByText("Read-only")).toBeVisible();
    await expect(page.getByText("Coffee together").first()).toBeVisible({ timeout: 25_000 });
    // STRICT: a private event (RLS) and a hidden-from-public event must never leak
    // through the anonymous path, under any token.
    await expect(page.getByText("Standup")).toHaveCount(0);
    await expect(page.getByText("Hidden lunch")).toHaveCount(0);
  });

  test("busy link redacts every title to 'Busy' — including context names", async ({ page }) => {
    await page.goto(BUSY);
    await expect(page.getByText("Read-only")).toBeVisible();
    await expect(page.getByText("Busy").first()).toBeVisible({ timeout: 25_000 });
    // No real titles in busy mode — neither events NOR the context window's name.
    await expect(page.getByText("Coffee together")).toHaveCount(0);
    await expect(page.getByText("Standup")).toHaveCount(0);
    await expect(page.getByText("Work hours")).toHaveCount(0);
  });

  test("context link discloses context-window names while events stay 'Busy'", async ({ page }) => {
    await page.goto(CONTEXT);
    await expect(page.getByText("Read-only")).toBeVisible();
    // The named context band IS disclosed (the "shape of the day")...
    await expect(page.getByText("Work hours").first()).toBeVisible({ timeout: 25_000 });
    // ...but individual event titles are still redacted to "Busy".
    await expect(page.getByText("Busy").first()).toBeVisible();
    await expect(page.getByText("Coffee together")).toHaveCount(0);
    await expect(page.getByText("Standup")).toHaveCount(0);
  });

  test("an unknown token renders the calm inactive state", async ({ page }) => {
    await page.goto("/share/this-token-does-not-exist");
    await expect(page.getByText("no longer active")).toBeVisible();
  });
});

test.describe("public share — request → inbox", () => {
  test("a posted timeslot request reaches the owner's inbox", async ({ page, request }) => {
    const res = await request.post(`/api/share/e2e-details-token/request`, {
      data: { name: "E2E Requester", message: "Can we meet?", ...slot(3) },
    });
    expect(res.status()).toBe(201);

    await signIn(page, "Alex");
    await page.goto("/inbox");
    await expect(
      page.getByText("E2E Requester requested a time"),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("posting to an unknown token is rejected (410)", async ({ request }) => {
    const res = await request.post(`/api/share/nope-not-real/request`, {
      data: slot(1),
    });
    expect(res.status()).toBe(410);
  });

  // LAST: deliberately exhausts the per-IP / per-share budget.
  test("rapid requests are rate-limited (429)", async ({ request }) => {
    const body = slot(2);
    let saw429 = false;
    for (let i = 0; i < 8; i++) {
      const res = await request.post(`/api/share/e2e-details-token/request`, { data: body });
      if (res.status() === 429) {
        saw429 = true;
        break;
      }
    }
    expect(saw429).toBe(true);
  });
});
