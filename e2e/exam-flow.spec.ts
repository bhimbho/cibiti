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
    if (i < total - 1) await page.getByRole("button", { name: "Next", exact: true }).click();
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

test("marker clears a flagged answer and the candidate's result appears", async ({ page, browser }) => {
  const title = `E2E Marking ${Date.now()}`;
  const answer = "It shares the computer between programs.";

  // An exam holding the one seeded question a scorer cannot judge.
  await signIn(page, "officer@cibiti.dev");
  await page.goto("/exams/new");
  await page.getByLabel("Exam title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Create exam" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  await page.getByRole("button", { name: "Add questions" }).click();
  await page.getByRole("textbox", { name: "Search question text" }).fill("operating system does");
  await page.locator(".picker-row", { hasText: "explain what an operating system does" }).locator("input").check();
  await page.getByRole("button", { name: "Add 1 question" }).click();
  await expect(page.locator(".builder-item", { hasText: "operating system does" })).toBeVisible();

  // Release as soon as marking finishes, so the candidate's score is what proves
  // the attempt was totalled and closed. Saving remounts the form, so the value
  // surviving that is the confirmation.
  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByLabel("Release results").selectOption("IMMEDIATE");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByLabel("Release results")).toHaveValue("IMMEDIATE", { timeout: 15_000 });

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Exam published.")).toBeVisible();

  // The candidate answers in their own words: nothing the scorer can match.
  const candidateContext = await browser.newContext();
  const candidatePage = await candidateContext.newPage();
  await signIn(candidatePage, "CSC/2026/002");
  await candidatePage.locator(".exam-row", { hasText: title }).getByRole("link", { name: /Begin/ }).click();
  await candidatePage.getByRole("button", { name: "Start exam" }).click();
  await candidatePage.locator("[data-question] input.take-text-input").fill(answer);
  await expect(candidatePage.getByRole("status").filter({ hasText: "All answers saved" })).toBeVisible({ timeout: 15_000 });
  await candidatePage.getByRole("button", { name: "Review & submit" }).click();
  await candidatePage.getByRole("button", { name: "Submit exam" }).click();
  await candidatePage.getByRole("button", { name: "Submit now" }).click();
  await expect(candidatePage.getByText("EXAM SUBMITTED")).toBeVisible();

  // It waits in the marking queue rather than being scored wrong.
  await page.getByRole("link", { name: "Marking" }).click();
  await expect(page).toHaveURL(/\/grading$/);
  const queueRow = page.locator(".activity-item", { hasText: "operating system does" });
  await expect(queueRow).toBeVisible();
  await queueRow.getByRole("link", { name: /Mark \d+/ }).click();

  const card = page.locator(".grading-answer", { hasText: answer });
  await expect(card).toBeVisible();
  // Anonymous by default: the candidate's name is not on the script.
  await expect(card).toContainText("Anonymous");
  await expect(card).toContainText("Answer key:");
  await card.getByRole("button", { name: "Full marks" }).click();
  await card.getByRole("button", { name: "Save mark" }).click();
  // The marked answer leaves the unmarked list, so the confirmation is the proof.
  await expect(page.getByText("1 mark saved.")).toBeVisible();
  await expect(page.getByText("Nothing left to mark for this question.")).toBeVisible();

  // Marking the last answer totals the attempt, and IMMEDIATE publishes it.
  await candidatePage.goto("/results");
  const resultRow = candidatePage.locator(".activity-item", { hasText: title });
  await expect(resultRow).toBeVisible();
  await expect(resultRow.getByRole("link", { name: /100% · View/ })).toBeVisible();

  await candidateContext.close();
});

test("staff read exam statistics and item analysis", async ({ page }) => {
  await signIn(page, "officer@cibiti.dev");
  await page.goto("/results");

  // The practice quiz is the exam the suite's candidates have actually sat.
  await page.locator(".dt-menu summary", { hasText: "Exam" }).click();
  await page.getByRole("checkbox", { name: "General Studies Practice Quiz" }).check();
  // The filter writes the exam id into the URL asynchronously.
  await expect(page).toHaveURL(/exam=/);
  const examId = new URL(page.url()).searchParams.get("exam");
  expect(examId).toBeTruthy();

  await page.goto(`/exams/${examId}/stats`);
  await expect(page.getByText("STATISTICS", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "General Studies Practice Quiz" })).toBeVisible();

  // A cohort summary, a distribution, and one row per question with a reading.
  await expect(page.getByText("Pass rate at")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Score bands" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What moving the pass mark would cost" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Question by question" })).toBeVisible();

  const itemRows = page.locator(".panel", { hasText: "Question by question" }).locator("tbody tr");
  await expect(itemRows.first()).toBeVisible();
  // Difficulty is a proportion, so every row carries a number or an em dash.
  await expect(itemRows.first().locator("td").nth(2)).toHaveText(/^(\d(\.\d+)?|—)$/);
});

test("administrator edits the grading scale and results show the letter", async ({ page }) => {
  await signIn(page, "admin@cibiti.dev");
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Grading scale" })).toBeVisible();
  // Until it is saved, the default five-point scale is in use.
  await expect(page.getByText(/default five-point scale/i)).toBeVisible();

  // Narrow the top band, so an A needs 75 rather than 70.
  await page.getByLabel("Lowest percentage for grade A").fill("75");
  await page.getByRole("button", { name: "Save scale" }).click();
  await expect(page.getByText("Grading scale saved.")).toBeVisible();
  await expect(page.getByText(/default five-point scale/i)).toHaveCount(0);

  // A scale with a hole in it is refused before it can be saved.
  await page.getByLabel("Remove grade F").click();
  await expect(page.getByText(/add one starting at 0%/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save scale" })).toBeDisabled();

  await page.goto("/results");
  const gradeCells = page.locator(".dt tbody tr td").filter({ hasText: /^[A-F]$/ });
  await expect(gradeCells.first()).toBeVisible();
});

test("exam officer weights a course and files its broadsheet", async ({ page }) => {
  await signIn(page, "officer@cibiti.dev");
  await page.goto("/academics/courses");
  await page.getByRole("link", { name: "CSC101", exact: true }).click();

  // Split the course between a CA and the exam that already exists on it.
  await expect(page.getByRole("heading", { name: "Components" })).toBeVisible();
  await page.getByRole("button", { name: "Add component" }).click();
  await page.getByLabel("Component 1 name").fill("Continuous assessment");
  await page.getByLabel("Component 1 weight").fill("30");
  await page.getByRole("button", { name: "Add component" }).click();
  await page.getByLabel("Component 2 name").fill("Examination");
  await page.getByLabel("Component 2 weight").fill("70");
  await page.getByLabel("Component 2 exam").selectOption({ label: "CSC101 Continuous Assessment 1" });
  await page.getByRole("button", { name: "Save components" }).click();
  await expect(page.getByText("Components saved.")).toBeVisible();

  // Weights that do not add to 100 are refused before they can be saved.
  await page.getByLabel("Component 1 weight").fill("40");
  await expect(page.getByText(/add up to 110%/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save components" })).toBeDisabled();

  await page.getByRole("link", { name: "Broadsheet" }).click();
  await expect(page).toHaveURL(/\/broadsheet$/);
  await expect(page.getByText("BROADSHEET", { exact: true })).toBeVisible();
  // One column per component, carrying its weight, plus the totals.
  await expect(page.getByRole("columnheader", { name: /Continuous assessment/ })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /Examination/ })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Grade" })).toBeVisible();

  // The CSV download is the artefact a registry files.
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/CSC101-broadsheet\.csv/);
});

test("administrator allows restarts and an invigilator rescues a candidate", async ({ page, browser }) => {
  // Restarting is off by default, so the administrator turns it on first.
  await signIn(page, "admin@cibiti.dev");
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Recovery and extra time" })).toBeVisible();
  await expect(page.getByText(/exams cannot be restarted/i)).toBeVisible();

  // Each switch saves as it is changed; there is no Save button to forget.
  const allowRestart = page.getByRole("switch", { name: "Allow exams to be restarted" });
  const invigilatorRestart = page.getByRole("switch", { name: "Invigilators may restart" });
  // Meaningless until restarting is on, so it is unreachable rather than refused.
  await expect(invigilatorRestart).toBeDisabled();

  await allowRestart.click();
  await expect(allowRestart).toHaveAttribute("aria-checked", "true");
  await expect(invigilatorRestart).toBeEnabled();
  await invigilatorRestart.click();
  await expect(invigilatorRestart).toHaveAttribute("aria-checked", "true");

  // Saved, not just shown: a reload comes back with both on.
  await page.reload();
  await expect(page.getByRole("switch", { name: "Allow exams to be restarted" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("switch", { name: "Invigilators may restart" })).toHaveAttribute("aria-checked", "true");

  // A candidate starts the practice quiz and gets stuck.
  const candidateContext = await browser.newContext();
  const candidatePage = await candidateContext.newPage();
  await signIn(candidatePage, "CSC/2026/001");
  await candidatePage.locator(".exam-row", { hasText: "General Studies Practice Quiz" }).getByRole("link", { name: /Begin|Continue/ }).click();
  await candidatePage.getByRole("button", { name: "Start exam" }).click();
  await expect(candidatePage.getByText(/Question 1 of \d+/)).toBeVisible();

  // The invigilator restarts them from the console.
  const invigilatorContext = await browser.newContext();
  const invigilator = await invigilatorContext.newPage();
  await signIn(invigilator, "invigilator@cibiti.dev");
  await invigilator.getByRole("link", { name: "Invigilation" }).click();
  const row = invigilator.locator("tbody tr", { hasText: "CSC/2026/001" });
  await expect(row).toBeVisible();

  // Confirm, then a reason: the reason is what makes the decision reviewable.
  invigilator.on("dialog", (dialog) =>
    void dialog.accept(dialog.type() === "prompt" ? "Machine failed mid-paper" : ""),
  );
  await row.getByRole("button", { name: /Restart .*'s exam/ }).click();
  await expect(invigilator.getByText(/can start the exam again/i)).toBeVisible();
  // The voided attempt is no longer live, so it leaves the console.
  await expect(row).toHaveCount(0);

  // The candidate can sit the exam again, from the beginning.
  await candidatePage.goto("/");
  await expect(
    candidatePage.locator(".exam-row", { hasText: "General Studies Practice Quiz" }).getByRole("link", { name: "Begin" }),
  ).toBeVisible();

  await candidateContext.close();
  await invigilatorContext.close();
});

test("administrator views the app as a candidate, read-only, then stops", async ({ page }) => {
  await signIn(page, "admin@cibiti.dev");

  // Find the candidate and start viewing as them.
  await page.goto("/people");
  await page.getByRole("textbox", { name: "Search name, email or matric number" }).fill("CSC/2026/001");
  // Wait for the filtered row before clicking: the table fetches as you type.
  const candidateRow = page.locator(".dt tbody tr", { hasText: "CSC/2026/001" });
  await expect(candidateRow).toHaveCount(1);
  await candidateRow.getByRole("link", { name: "Demo Student" }).click();
  await expect(page.getByRole("heading", { name: "Demo Student" })).toBeVisible();

  page.on("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "View as this user" }).click();

  // The banner says whose view this is, and who is really signed in.
  const banner = page.getByRole("status").filter({ hasText: "Viewing as" });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("read-only");
  // The sidebar is the candidate's now, not the administrator's.
  await expect(page.locator(".sidebar")).toContainText("Candidate");
  await expect(page.getByRole("link", { name: "People" })).toHaveCount(0);

  // Writing is refused while looking, whatever the request.
  const refused = await page.request.put("/api/settings/flags", { data: { key: "proctoring", enabled: true } });
  expect(refused.status()).toBe(403);
  expect((await refused.json()).error).toMatch(/read-only/i);

  await banner.getByRole("button", { name: "Stop viewing as them" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Viewing as" })).toHaveCount(0);
  // Back to being the administrator, with the staff navigation returned.
  await expect(page.getByRole("link", { name: "People" })).toBeVisible();

  // Both ends are on the record.
  await page.goto("/settings/audit");
  await expect(page.locator(".dt tbody tr", { hasText: "impersonation.stop" }).first()).toBeVisible();
  await expect(page.locator(".dt tbody tr", { hasText: "impersonation.start" }).first()).toBeVisible();
});


test("editing while viewing as a user is a setting, and never covers sitting an exam", async ({ page }) => {
  await signIn(page, "admin@cibiti.dev");

  // Start from read-only whatever an earlier run left behind, so the test can be
  // repeated against the same database.
  await page.goto("/settings");
  const editSwitch = page.getByRole("switch", { name: "Allow editing while viewing as a user" });
  if ((await editSwitch.getAttribute("aria-checked")) === "true") {
    await editSwitch.click();
    await expect(page.getByText("Viewing is read-only again.")).toBeVisible();
  }
  await expect(editSwitch).toHaveAttribute("aria-checked", "false");

  // View as the exam officer, who can normally manage courses.
  await page.goto("/people");
  await page.getByRole("textbox", { name: "Search name, email or matric number" }).fill("officer@cibiti.dev");
  const officerRow = page.locator(".dt tbody tr", { hasText: "officer@cibiti.dev" });
  await expect(officerRow).toHaveCount(1);
  page.on("dialog", (dialog) => void dialog.accept());
  await officerRow.getByRole("link", { name: "Emeka Officer" }).click();
  await page.getByRole("button", { name: "View as this user" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Viewing as" })).toContainText("read-only");

  const course = { code: `VA${Date.now() % 100000}`, title: "View-as course", credits: 2 };
  const refused = await page.request.post("/api/courses", { data: course });
  expect(refused.status()).toBe(403);
  expect((await refused.json()).error).toMatch(/read-only/i);

  // Stop, turn editing on, and view again. Wait for the banner to go: the cookie is
  // cleared by the response, so navigating sooner arrives still viewing.
  await page.getByRole("button", { name: "Stop viewing as them" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Viewing as|Editing as/ })).toHaveCount(0);
  await page.goto("/settings");
  await page.getByRole("switch", { name: "Allow editing while viewing as a user" }).click();
  await expect(page.getByText("Editing allowed while viewing as a user.")).toBeVisible();

  await page.goto("/people");
  await page.getByRole("textbox", { name: "Search name, email or matric number" }).fill("officer@cibiti.dev");
  await page.locator(".dt tbody tr", { hasText: "officer@cibiti.dev" }).getByRole("link", { name: "Emeka Officer" }).click();
  await page.getByRole("button", { name: "View as this user" }).click();

  // The banner changes its tune, and the same write now lands.
  const editingBanner = page.getByRole("status").filter({ hasText: "Editing as" });
  await expect(editingBanner).toContainText("changes are saved to their account");
  const allowed = await page.request.post("/api/courses", { data: course });
  expect(allowed.ok()).toBe(true);

  // Sitting an exam stays impossible even so.
  // PUT is how answers are saved; the guard refuses before the handler is reached.
  const examWrite = await page.request.put("/api/attempts/any-attempt-id/responses", { data: { writes: [] } });
  expect(examWrite.status()).toBe(403);
  expect((await examWrite.json()).error).toMatch(/never permitted/i);

  // Put the setting back, so the rest of the suite sees the default.
  await editingBanner.getByRole("button", { name: "Stop viewing as them" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Viewing as|Editing as/ })).toHaveCount(0);
  await page.goto("/settings");
  await page.getByRole("switch", { name: "Allow editing while viewing as a user" }).click();
  await expect(page.getByText("Viewing is read-only again.")).toBeVisible();
});
