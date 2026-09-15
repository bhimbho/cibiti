import { expect, test, type Page } from "@playwright/test";

// Requires a seeded database (npm run db:seed) and a running worker.
// Uses candidate E2E_CANDIDATE (default CSC/2026/003) on the General Studies practice quiz,
// which allows 3 attempts per fresh seed.
const candidate = process.env.E2E_CANDIDATE ?? "CSC/2026/003";

async function signIn(page: Page, identifier: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email or matric number").fill(identifier);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
}

async function answerCurrentQuestion(page: Page) {
  const card = page.locator("[data-question]");
  const text = card.locator("input.take-text-input");
  if (await text.count()) {
    await text.fill("36");
    return;
  }
  await card.locator("[data-option-index='0']").click();
}

test("candidate answers, survives a reload, and submits", async ({ page }) => {
  await signIn(page, candidate);

  const row = page.locator(".exam-row", { hasText: "General Studies Practice Quiz" });
  await row.getByRole("link", { name: /Begin|Continue/ }).click();

  await page.getByRole("button", { name: "Start exam" }).click();
  await expect(page.getByText(/Question 1 of \d+/)).toBeVisible();

  const total = Number((await page.getByText(/Question 1 of \d+/).textContent())?.match(/of (\d+)/)?.[1]);
  expect(total).toBeGreaterThan(0);

  for (let i = 0; i < total; i++) {
    await answerCurrentQuestion(page);
    if (i < total - 1) await page.getByRole("button", { name: "Next" }).click();
  }
  await expect(page.getByRole("status").filter({ hasText: "All answers saved" })).toBeVisible({ timeout: 15_000 });

  // Reloading resumes the same attempt with every answer intact.
  await page.reload();
  await expect(page.getByText(`${total} of ${total} answered`)).toBeVisible();

  await page.getByRole("button", { name: "Review & submit" }).click();
  await page.getByRole("button", { name: "Submit exam" }).click();
  await page.getByRole("button", { name: "Submit now" }).click();

  await expect(page.getByText("EXAM SUBMITTED")).toBeVisible();
  await expect(page.getByText(/\d+%|result will be released/)).toBeVisible();
});

test("staff search and filter the question bank", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email or matric number").fill("instructor@cibiti.dev");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Question bank" }).click();

  const rows = page.locator(".dt tbody tr");
  await expect(rows.first()).toBeVisible();
  const initialCount = await rows.count();
  expect(initialCount).toBeGreaterThan(5);

  await page.getByRole("textbox", { name: "Search question text" }).fill("independence");
  await expect(page).toHaveURL(/q=independence/);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Nigeria gain independence");

  await page.getByRole("button", { name: "Clear all" }).click();
  await page.locator(".dt-menu summary", { hasText: "Type" }).click();
  await page.getByRole("checkbox", { name: "True / False" }).check();
  await expect(page).toHaveURL(/type=true-false/);
  await expect(rows.first()).toContainText("True / False");
  expect(await rows.count()).toBeLessThan(initialCount);
});

test("instructor creates a question and finds it in the bank", async ({ page }) => {
  const stem = `Which layer of the OSI model handles routing? ${Date.now()}`;
  await signIn(page, "instructor@cibiti.dev");
  await page.goto("/questions/new");

  await page.getByLabel("Question", { exact: true }).fill(stem);
  const options = page.locator(".option-input");
  for (const [i, text] of ["Physical", "Network", "Session", "Application"].entries()) await options.nth(i).fill(text);
  await page.getByLabel("Mark option B correct").check();

  // The live preview scores the chosen answer with the real scorer.
  await page.locator(".editor-preview [data-option-index='1']").click();
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.locator(".preview-check")).toContainText("Correct");

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/questions\/[^/]+\?saved=1/);
  await expect(page.getByText("Question created.")).toBeVisible();

  await page.goto(`/questions?q=${encodeURIComponent("OSI model handles routing")}`);
  await expect(page.locator(".dt tbody tr", { hasText: stem })).toBeVisible();
});

test("health endpoint reports every dependency", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(await res.json()).toEqual({ status: "ok", database: "ok", queue: "ok", storage: "ok" });
});
