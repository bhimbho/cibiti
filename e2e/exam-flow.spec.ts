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

test("exam officer builds and publishes an exam that candidates can see", async ({ page, browser }) => {
  const title = `E2E Mock Examination ${Date.now()}`;
  await signIn(page, "officer@cibiti.dev");
  await page.getByRole("link", { name: "Exams" }).click();
  await expect(page).toHaveURL(/\/exams$/);
  await page.getByRole("link", { name: "Create exam" }).click();
  await expect(page).toHaveURL(/\/exams\/new$/);

  await page.getByLabel("Exam title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Create exam" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.locator(".checks-panel")).toContainText("Add at least one question.");

  // A fixed question from the bank.
  await page.getByRole("button", { name: "Add questions" }).click();
  await page.getByRole("textbox", { name: "Search question text" }).fill("CPU stand for");
  await page.locator(".picker-row", { hasText: "What does CPU stand for?" }).locator("input").check();
  await page.getByRole("button", { name: "Add 1 question" }).click();
  await expect(page.locator(".builder-item", { hasText: "What does CPU stand for?" })).toBeVisible();

  // A random draw of two networking questions.
  await page.getByRole("button", { name: "Add random draw" }).click();
  const rule = page.locator(".rule-form");
  await rule.getByLabel("Questions to draw").fill("2");
  await rule.getByLabel("Subject").selectOption({ label: "Computer Science" });
  await rule.getByLabel("Topic").selectOption({ label: "Networking" });
  await rule.getByRole("button", { name: "Add draw" }).click();
  await expect(page.locator(".builder-item.rule")).toContainText("Draw 2 random questions");

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Exam published.")).toBeVisible();
  await expect(page.locator(".authoring-header .status-pill")).toHaveText("Published");

  const candidateContext = await browser.newContext();
  const candidatePage = await candidateContext.newPage();
  await signIn(candidatePage, "CSC/2026/001");
  await expect(candidatePage.locator(".exam-row", { hasText: title })).toContainText("3 questions");
  await candidateContext.close();
});

test("staff open an attempt report with its integrity timeline", async ({ page }) => {
  await signIn(page, "officer@cibiti.dev");
  await page.getByRole("link", { name: "Results" }).click();
  await expect(page).toHaveURL(/\/results$/);

  await page.locator(".dt-menu summary", { hasText: "Exam" }).click();
  await page.getByRole("checkbox", { name: "General Studies Practice Quiz" }).check();
  await expect(page).toHaveURL(/exam=/);

  const firstCandidate = page.locator(".dt tbody tr").first().locator("a.dt-link");
  await expect(firstCandidate).toBeVisible();
  await firstCandidate.click();

  await expect(page).toHaveURL(/\/results\/[^/?]+$/);
  // exact: Next's route announcer also contains "Attempt report".
  await expect(page.getByText("ATTEMPT REPORT", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".timeline")).toContainText("Started the exam");
  await expect(page.locator(".review-item").first()).toBeVisible();
});

test("candidate reviews their own released result", async ({ page }) => {
  await signIn(page, candidate);
  await page.getByRole("link", { name: "Results" }).click();
  await expect(page.getByRole("heading", { name: "My results" })).toBeVisible();

  await page.locator(".activity-item", { hasText: "General Studies Practice Quiz" }).first().getByRole("link").click();
  await expect(page.getByText("YOUR RESULT")).toBeVisible();
  // The practice quiz releases the full review, including correct answers.
  await expect(page.locator(".review-item").first()).toBeVisible();
  await expect(page.locator(".timeline")).toHaveCount(0);
});

test("exam officer adds a candidate and imports more from CSV", async ({ page, browser }) => {
  const stamp = Date.now();
  await signIn(page, "officer@cibiti.dev");
  await page.getByRole("link", { name: "People" }).click();
  await expect(page).toHaveURL(/\/people$/);

  await page.getByRole("link", { name: "Add person" }).click();
  await expect(page).toHaveURL(/\/people\/new$/);
  await page.getByLabel("Full name").fill("Ngozi Eze");
  await page.getByLabel("Matric / registration number").fill(`E2E/${stamp}/1`);
  await page.getByLabel("Department").selectOption({ label: "CSC · Computer Science" });
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("ACCOUNT CREATED")).toBeVisible();
  await expect(page.locator(".credential .mono")).toHaveText(/^[a-z2-9]{10}$/);

  await page.goto("/people/import");
  const csv = [
    "name,matric_number,department,level,courses,password",
    `Ifeanyi Obi,E2E/${stamp}/2,CSC,100L,CSC101,import123`,
    `Halima Sani,E2E/${stamp}/3,CSC,100L,CSC101,`,
    `Broken Row,E2E/${stamp}/4,XYZ,100L,,`,
  ].join("\n");
  await page.getByLabel("Or paste CSV").fill(csv);
  await page.getByRole("button", { name: "Check file" }).click();
  await expect(page.locator(".import-counts")).toContainText("2 ready");
  await expect(page.locator(".row-error")).toContainText('Unknown department "XYZ"');

  await page.getByRole("button", { name: "Import 2 people" }).click();
  // Three rows in the file: two created, the broken one skipped and explained.
  await expect(page.getByText("2 of 3 accounts created")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".import-panel .take-warning")).toContainText("1 row was skipped");
  await expect(page.locator(".import-panel .take-warning")).toContainText("Line 4");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download passwords" }).click();
  expect((await download).suggestedFilename()).toBe("imported-passwords.csv");
  await expect(page.getByText("Passwords downloaded and removed from the server.")).toBeVisible();

  // The imported candidate can sign in with the password from the file.
  const context = await browser.newContext();
  const candidatePage = await context.newPage();
  await candidatePage.goto("/sign-in");
  await candidatePage.getByLabel("Email or matric number").fill(`E2E/${stamp}/2`);
  await candidatePage.getByLabel("Password").fill("import123");
  await candidatePage.getByRole("button", { name: "Sign in" }).click();
  await expect(candidatePage.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  // Enrolled on CSC101 by the import, so the course's exam is listed.
  await expect(candidatePage.locator(".exam-row", { hasText: "CSC101 Continuous Assessment 1" })).toBeVisible();
  await context.close();
});

test("exam officer sets up academic structure and registers a candidate on a course", async ({ page }) => {
  const stamp = String(Date.now()).slice(-6);
  await signIn(page, "officer@cibiti.dev");
  await page.getByRole("link", { name: "Academics" }).click();
  await expect(page).toHaveURL(/\/academics$/);

  await page.getByLabel("Department code").fill(`E${stamp}`);
  await page.getByLabel("Department name").fill(`Engineering ${stamp}`);
  await page.getByRole("button", { name: "Add department" }).click();
  await expect(page.locator(".structure-list .code-chip", { hasText: `E${stamp}` })).toBeVisible();

  await page.getByLabel("Venue name").fill(`ICT Centre ${stamp}`);
  await page.getByRole("button", { name: "Add venue" }).click();
  // exact: "Seats in new lab for …" also contains "New lab for …".
  await page.getByLabel(`New lab for ICT Centre ${stamp}`, { exact: true }).fill("Lab 1");
  await page.getByLabel(`Seats in new lab for ICT Centre ${stamp}`, { exact: true }).fill("120");
  await page.getByRole("button", { name: `Add lab to ICT Centre ${stamp}` }).click();
  await expect(page.getByLabel("Rename Lab 1").first()).toBeVisible();

  await page.getByRole("link", { name: "Courses" }).click();
  await expect(page).toHaveURL(/\/academics\/courses$/);
  // exact: the table's "Search code or title" box also contains "Code".
  await page.getByLabel("Code", { exact: true }).fill(`ENG${stamp}`);
  // By role: the table's Columns menu also has a checkbox labelled "Title".
  await page.getByRole("textbox", { name: "Title", exact: true }).fill("Engineering Drawing");
  await page.getByRole("button", { name: "Add course" }).click();
  await expect(page.getByText(`ENG${stamp} added.`)).toBeVisible();

  await page.getByRole("textbox", { name: "Search code or title" }).fill(`ENG${stamp}`);
  await page.getByRole("link", { name: `ENG${stamp}` }).click();
  await expect(page.getByRole("heading", { name: `ENG${stamp} · Engineering Drawing` })).toBeVisible();

  await page.getByLabel("Register by matric number").fill("CSC/2026/001\nNOT/A/REAL/1");
  await page.getByRole("button", { name: "Register candidates" }).click();
  await expect(page.getByText("Registered 1 candidate; 1 not found.")).toBeVisible();
  await expect(page.locator(".member-row", { hasText: "Demo Student" })).toBeVisible();
});

test("invigilator adds time and submits a live attempt", async ({ page, browser }) => {
  // A fresh candidate so the one-attempt CSC101 exam is always available.
  const stamp = Date.now();
  await signIn(page, "officer@cibiti.dev");
  await page.goto("/people/new");
  await page.getByLabel("Full name").fill("Live Candidate");
  await page.getByLabel("Matric / registration number").fill(`LIVE/${stamp}`);
  // The label also carries the hint "Leave blank to generate one".
  await page.getByLabel(/^Password/).fill("live12345");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("ACCOUNT CREATED")).toBeVisible();
  await page.goto("/academics/courses");
  await page.getByRole("textbox", { name: "Search code or title" }).fill("CSC101");
  await page.getByRole("link", { name: "CSC101", exact: true }).click();
  await page.getByLabel("Register by matric number").fill(`LIVE/${stamp}`);
  await page.getByRole("button", { name: "Register candidates" }).click();
  await expect(page.getByText("Registered 1 candidate.")).toBeVisible();

  const candidateContext = await browser.newContext();
  const candidatePage = await candidateContext.newPage();
  await candidatePage.goto("/sign-in");
  await candidatePage.getByLabel("Email or matric number").fill(`LIVE/${stamp}`);
  await candidatePage.getByLabel("Password").fill("live12345");
  await candidatePage.getByRole("button", { name: "Sign in" }).click();
  await candidatePage.locator(".exam-row", { hasText: "CSC101 Continuous Assessment 1" }).getByRole("link", { name: "Begin" }).click();
  await candidatePage.getByRole("button", { name: "Start exam" }).click();
  await expect(candidatePage.getByText(/Question 1 of \d+/)).toBeVisible();

  const invigilatorContext = await browser.newContext();
  const invigilator = await invigilatorContext.newPage();
  await signIn(invigilator, "invigilator@cibiti.dev");
  await invigilator.getByRole("link", { name: "Invigilation" }).click();
  const row = invigilator.locator("tbody tr", { hasText: `LIVE/${stamp}` });
  await expect(row).toBeVisible();

  let prompts = 0;
  invigilator.on("dialog", (dialog) => {
    prompts++;
    void dialog.accept(dialog.message().startsWith("Add how many") ? "10" : dialog.message().startsWith("Reason") ? "Power outage" : "Left the hall");
  });
  await row.getByRole("button", { name: "Add time for Live Candidate" }).click();
  await expect(invigilator.getByText("Added 10 minutes for Live Candidate.")).toBeVisible();
  await expect(row).toContainText("+10m");

  await row.getByRole("button", { name: "Submit Live Candidate's exam now" }).click();
  await expect(invigilator.getByText("Live Candidate's exam was submitted.")).toBeVisible();
  await expect(row).toHaveCount(0);
  expect(prompts).toBe(3);

  await candidateContext.close();
  await invigilatorContext.close();
});

test("administrator toggles a feature flag and it is audited", async ({ page }) => {
  await signIn(page, "admin@cibiti.dev");
  await page.getByRole("link", { name: "Settings" }).click();
  page.on("dialog", (dialog) => void dialog.accept());

  const toggle = page.getByRole("switch", { name: "AI assist (Claude)" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  await page.getByRole("link", { name: "Audit log" }).first().click();
  await expect(page.locator(".dt tbody tr", { hasText: "flag.set" }).first()).toBeVisible();
});

test("health endpoint reports every dependency", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(await res.json()).toEqual({ status: "ok", database: "ok", queue: "ok", storage: "ok" });
});
