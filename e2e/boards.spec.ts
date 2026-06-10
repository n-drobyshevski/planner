import { test, expect, type Page } from "@playwright/test";

async function signInToTasks(page: Page, name: "Alex" | "Sam") {
  await page.goto("/login");
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/calendar**");
  await page.goto("/tasks");
  await expect(page.getByRole("heading", { name: "To Do" })).toBeVisible({
    timeout: 25_000,
  });
}

async function createTask(page: Page, title: string) {
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByPlaceholder("What needs doing?").fill(title);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 15_000 });
}

/** Delete the currently-open task via the edit dialog + confirm dialog. */
async function deleteOpenTask(page: Page) {
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByText("Delete this task?").waitFor();
  await page.getByRole("button", { name: "Delete" }).last().click();
}

async function deleteTaskByTitle(page: Page, title: string) {
  await page.getByText(title).first().click();
  await page.getByText("Edit task").waitFor();
  await deleteOpenTask(page);
  await expect(page.getByText(title)).toHaveCount(0, { timeout: 15_000 });
}

test("boards: create, filter by board, guard non-empty delete, delete", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await signInToTasks(page, "Alex");
  const boardName = `B-${testInfo.testId}`;
  const taskTitle = `BT-${testInfo.testId}`;

  // Create a board via the switcher; creation switches the view to it.
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await page.getByRole("menuitem", { name: "New board" }).click();
  await page.getByLabel("Board name").fill(boardName);
  await page.getByRole("button", { name: "Add board" }).click();
  await expect(
    page.getByRole("button", { name: boardName, exact: true }),
  ).toBeVisible({ timeout: 15_000 });

  // A task created here is filed under the new board…
  await createTask(page, taskTitle);

  // …and is not visible on the original board.
  await page.getByRole("button", { name: boardName, exact: true }).click();
  await page.getByRole("menuitem", { name: "Tasks" }).click();
  await expect(page.getByText(taskTitle)).toHaveCount(0);

  // Back on the new board it's there again.
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await page.getByRole("menuitem", { name: boardName }).click();
  await expect(page.getByText(taskTitle).first()).toBeVisible();

  // Deleting a non-empty board is blocked with an explanation.
  await page.getByRole("button", { name: boardName, exact: true }).click();
  await page.getByRole("menuitem", { name: `Delete “${boardName}”` }).click();
  await expect(page.getByText("Board isn’t empty")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  // Empty it, then the delete goes through and the view falls back.
  await deleteTaskByTitle(page, taskTitle);
  await page.getByRole("button", { name: boardName, exact: true }).click();
  await page.getByRole("menuitem", { name: `Delete “${boardName}”` }).click();
  await page.getByText(`Delete “${boardName}”?`).waitFor();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(
    page.getByRole("button", { name: "Tasks", exact: true }),
  ).toBeVisible({ timeout: 15_000 });
});

test("board: drag a card from To Do to In Progress", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await signInToTasks(page, "Alex");
  const title = `Drag-${testInfo.testId}`;
  await createTask(page, title);

  const card = page.getByText(title).first();
  const target = page.getByRole("list", { name: /In Progress/ });
  const from = await card.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("missing bounding boxes for drag");

  // dnd-kit's MouseSensor needs a >5px move after mousedown before it
  // activates, so script the drag as raw stepped mouse events.
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 12, {
    steps: 5,
  });
  await page.mouse.move(to.x + to.width / 2, to.y + Math.min(to.height / 2, 80), {
    steps: 15,
  });
  await page.mouse.up();

  // The card lands in the In Progress column and the move persists.
  await expect(target.getByText(title)).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "To Do" })).toBeVisible({
    timeout: 25_000,
  });
  await expect(
    page.getByRole("list", { name: /In Progress/ }).getByText(title),
  ).toBeVisible({ timeout: 15_000 });

  await deleteTaskByTitle(page, title);
});

test("undo: the create toast's Undo removes the task", async ({ page }, testInfo) => {
  await signInToTasks(page, "Alex");
  const title = `Undo-${testInfo.testId}`;
  await createTask(page, title);

  // The success toast carries an Undo action that pops the history entry.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText(title)).toHaveCount(0, { timeout: 15_000 });
});
