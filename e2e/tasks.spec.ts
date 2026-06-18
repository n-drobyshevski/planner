import { test, expect, type Page } from "@playwright/test";

async function signInToTasks(page: Page, name: "Alex" | "Sam") {
  await page.goto("/login");
  const nameField = page.getByLabel("Name");
  const signIn = page.getByRole("button", { name: "Sign in" });
  await nameField.click();
  // Re-fill until the controlled form state catches up (a fill that lands before
  // hydration leaves the Sign-in button disabled).
  await expect(async () => {
    if (!(await signIn.isEnabled())) {
      await nameField.fill("");
      await nameField.fill(name);
    }
    await expect(signIn).toBeEnabled();
  }).toPass({ timeout: 15_000 });
  await signIn.click();
  await page.waitForURL("**/calendar**");
  await page.goto("/tasks");
  await expect(page.getByRole("heading", { name: "To Do" })).toBeVisible({
    timeout: 25_000,
  });
}

/** Delete the currently-open task via the edit dialog + confirm dialog. */
async function deleteOpenTask(page: Page) {
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByText("Delete this task?").waitFor();
  await page.getByRole("button", { name: "Delete" }).last().click();
}

test("board: create then delete a task", async ({ page }, testInfo) => {
  await signInToTasks(page, "Alex");
  const title = `T-${testInfo.testId}`;

  await page.getByRole("button", { name: "New task" }).click();
  await page.getByPlaceholder("What needs doing?").fill(title);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 15_000 });

  await page.getByText(title).first().click();
  await page.getByText("Edit task").waitFor();
  await deleteOpenTask(page);
  await expect(page.getByText(title)).toHaveCount(0, { timeout: 15_000 });
});

test("privacy: Alex cannot see Sam's private task", async ({ page }) => {
  await signInToTasks(page, "Alex");
  await expect(page.getByText("Performance review prep")).toHaveCount(0);
});

test("privacy: Sam can see their own private task", async ({ page }) => {
  await signInToTasks(page, "Sam");
  await expect(page.getByText("Performance review prep").first()).toBeVisible();
});

test("subtasks: a sequential subtask is blocked", async ({ page }) => {
  await signInToTasks(page, "Alex");
  await page.getByText("Plan spring garden").first().click();
  await page.getByText("Edit task").waitFor();
  // Subtask titles render in inputs; "Clear the beds" done, "Buy seeds" actionable,
  // "Plant" blocked (sequential) -> a "Blocked" badge is shown.
  await expect(page.locator('input[value="Buy seeds"]')).toBeVisible();
  await expect(page.getByText("Blocked").first()).toBeVisible();
});

test("realtime: a shared task created by one member appears for the other", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const title = `RT-${testInfo.testId}`;

  try {
    await signInToTasks(a, "Alex");
    await signInToTasks(b, "Sam");

    await a.getByRole("button", { name: "New task" }).click();
    await a.getByPlaceholder("What needs doing?").fill(title);
    await a.getByRole("button", { name: "Create" }).click();
    await expect(a.getByText(title).first()).toBeVisible({ timeout: 15_000 });

    // B receives it live (shared collection, not private) without reloading.
    await expect(b.getByText(title).first()).toBeVisible({ timeout: 20_000 });

    // cleanup
    await a.getByText(title).first().click();
    await a.getByText("Edit task").waitFor();
    await deleteOpenTask(a);
    await expect(a.getByText(title)).toHaveCount(0, { timeout: 15_000 });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});

test("subtasks: nest beyond two levels (deep nesting)", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await signInToTasks(page, "Alex");
  const title = `DN-${testInfo.testId}`;

  await page.getByRole("button", { name: "New task" }).click();
  await page.getByPlaceholder("What needs doing?").fill(title);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 15_000 });

  await page.getByText(title).first().click();
  await page.getByText("Edit task").waitFor();

  // Add a direct child via the bottom add-row.
  await page.getByPlaceholder("Add a subtask").fill("Child one");
  await page.keyboard.press("Enter");
  await expect(page.locator('input[value="Child one"]')).toBeVisible({ timeout: 10_000 });

  // Add a grandchild under "Child one" — impossible under the old 2-level cap.
  const childRow = page.locator("div.group", {
    has: page.locator('input[value="Child one"]'),
  });
  await childRow.getByRole("button", { name: "Add subtask" }).click();
  await page.keyboard.type("Grandchild");
  await page.keyboard.press("Enter");
  await expect(page.locator('input[value="Grandchild"]')).toBeVisible({ timeout: 10_000 });

  await deleteOpenTask(page);
  await expect(page.getByText(title)).toHaveCount(0, { timeout: 15_000 });
});

test("dependencies: add a blocker via Blocked by", async ({ page }, testInfo) => {
  await signInToTasks(page, "Alex");
  const blocker = `Blk-${testInfo.testId}`;
  const blocked = `Bd-${testInfo.testId}`;

  for (const t of [blocker, blocked]) {
    await page.getByRole("button", { name: "New task" }).click();
    await page.getByPlaceholder("What needs doing?").fill(t);
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(t).first()).toBeVisible({ timeout: 15_000 });
  }

  // Open the blocked task and add the blocker through the "Blocked by" picker.
  await page.getByText(blocked).first().click();
  await page.getByText("Edit task").waitFor();
  await page.getByRole("combobox", { name: "Add a blocker" }).click();
  await page.getByRole("option", { name: blocker }).click();
  // The blocker shows as a removable chip in the Blocked-by list.
  await expect(page.getByText(blocker).first()).toBeVisible({ timeout: 10_000 });

  // Cleanup both tasks (the dependency edge cascade-deletes with them).
  await deleteOpenTask(page);
  await expect(page.getByText(blocked)).toHaveCount(0, { timeout: 15_000 });
  await page.getByText(blocker).first().click();
  await page.getByText("Edit task").waitFor();
  await deleteOpenTask(page);
  await expect(page.getByText(blocker)).toHaveCount(0, { timeout: 15_000 });
});

test("schedule a task onto the calendar", async ({ page }, testInfo) => {
  await signInToTasks(page, "Alex");
  const title = `Sched-${testInfo.testId}`;

  await page.getByRole("button", { name: "New task" }).click();
  await page.getByPlaceholder("What needs doing?").fill(title);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 15_000 });

  // Open it, choose Add to calendar -> schedule one block.
  await page.getByText(title).first().click();
  await page.getByText("Edit task").waitFor();
  await page.getByRole("button", { name: "Add to calendar" }).click();
  await page.getByRole("radio", { name: "One block" }).waitFor(); // schedule dialog
  await page.getByRole("button", { name: "Add to calendar" }).click();

  // The block shows on the calendar.
  await page.goto("/calendar?view=week");
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 15_000 });

  // Cleanup: deleting the task cascades its calendar block.
  await page.goto("/tasks");
  await page.getByText(title).first().click();
  await page.getByText("Edit task").waitFor();
  await deleteOpenTask(page);
  await expect(page.getByText(title)).toHaveCount(0, { timeout: 15_000 });
});
