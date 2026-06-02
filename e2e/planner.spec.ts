import { test, expect, type Page } from "@playwright/test";

async function signIn(page: Page, name: "Alex" | "Sam") {
  await page.goto("/login");
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/calendar**");
  await expect(page.getByText("Coffee together").first()).toBeVisible({ timeout: 25_000 });
}

test("privacy: Alex cannot see Sam's private event", async ({ page }) => {
  await signIn(page, "Alex");
  await expect(page.getByText("Standup")).toHaveCount(0);
});

test("privacy: Sam can see their own private event", async ({ page }) => {
  await signIn(page, "Sam");
  await expect(page.getByText("Standup").first()).toBeVisible();
});

test("create then delete an event", async ({ page }, testInfo) => {
  await signIn(page, "Alex");
  const title = `E2E-${testInfo.testId}`;

  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByText("New event").waitFor();
  await page.locator("#ev-title").fill(title);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 15_000 });

  await page.getByText(title).first().click();
  await page.getByText("Edit event").waitFor();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(title)).toHaveCount(0, { timeout: 15_000 });
});

// Regression: the right-click quick menu's items must actually fire. The menu
// is a Radix portal (rendered into <body>) but a React child of the time grid,
// so its pointer events bubble to the grid's onPointerDown. That handler must
// NOT setPointerCapture for them — capture retargets the item's own
// pointerup/click to the grid, leaving Edit/Delete inert. See time-grid.tsx.
test("right-click context menu Delete removes the event", async ({ page }, testInfo) => {
  await signIn(page, "Alex");
  const title = `E2E-CTX-${testInfo.testId}`;

  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByText("New event").waitFor();
  await page.locator("#ev-title").fill(title);
  await page.getByRole("button", { name: "Create" }).click();
  const block = page.getByText(title).first();
  await expect(block).toBeVisible({ timeout: 15_000 });

  await block.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByText(title)).toHaveCount(0, { timeout: 15_000 });
});

test("category toggle hides and shows events", async ({ page }) => {
  await signIn(page, "Alex");
  await page.getByRole("button", { name: "Social" }).click();
  await expect(page.getByText("Coffee together")).toHaveCount(0);
  await page.getByRole("button", { name: "Social" }).click();
  await expect(page.getByText("Coffee together").first()).toBeVisible();
});

test("realtime: a shared event created by one member appears for the other", async ({
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const title = `RT-${testInfo.testId}`;

  try {
    await signIn(a, "Alex");
    await signIn(b, "Sam");

    await a.getByRole("button", { name: "New", exact: true }).click();
    await a.getByText("New event").waitFor();
    await a.locator("#ev-title").fill(title);
    await a.getByRole("button", { name: "Create" }).click();
    await expect(a.getByText(title).first()).toBeVisible({ timeout: 15_000 });

    // B should receive it live (shared scope) without reloading.
    await expect(b.getByText(title).first()).toBeVisible({ timeout: 20_000 });

    // cleanup
    await a.getByText(title).first().click();
    await a.getByText("Edit event").waitFor();
    await a.getByRole("button", { name: "Delete" }).click();
    await expect(a.getByText(title)).toHaveCount(0, { timeout: 15_000 });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
