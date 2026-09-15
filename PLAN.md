# Cibiti v2 — Product & Engineering Plan

> **Goal:** turn Cibiti from a working CBT demo into a serious assessment platform for **universities, CBT centres, and schools**, running **mainly on a local network (LAN)**. It should handle a university semester exam, a 500-seat CBT centre, or a school's end-of-term tests, with authoring that is fast, delivery that doesn't lose answers, integrity tooling that holds up in a review, and analytics that tell you whether the exam itself was any good.
>
> **Confirmed decisions (2026-09-15):** markets = universities, CBT centres, schools · deployment = LAN-first · proctoring = fully built but **off by default** behind feature flags · AI = **Claude** · schema reset = approved. See §16.

This plan replaces the original PLAN.md (still in git history). It is based on a review of the current codebase and research into Learnosity, TAO/QTI 3.0, Inspera, ExamSoft, Moodle, Honorlock/Proctorio, Safe Exam Browser, and Nigerian CBT-centre software (sources at the end).

---

## 0. Where we are today (honest audit)

The current app is about 4.2k lines. It has good bones: Next.js 16, Prisma/Postgres, Auth.js, courses, departments, exams, attempts, and a certificate view. The problems below are why it doesn't *feel* advanced, and several of them are correctness issues, not just missing features.

| Area | Current state | Problem |
|---|---|---|
| Attempt lifecycle | `POST /api/attempts` creates a new attempt on every page load | **Refreshing the exam uses up an attempt** and loses all answers |
| Saving answers | Answers live only in React state until submit | A network drop, crash, or closed tab loses the entire exam |
| Timer | Countdown runs only in the browser | Submit route never checks the deadline, so the time limit can be bypassed |
| Lockdown | `useExamLockdown` shows a warning | Violations are **never persisted**, so there's nothing for anyone to review |
| Question types | Enum has 8 types; editor offers 3; take page renders **radio buttons for everything** | Matching, ordering, multi-select, fill-blank, and essay can't actually be taken |
| Grading | One `normalize()` string compare for all types | No partial credit, no manual grading, no tolerance, no alternatives |
| Question edits | Questions are mutable; attempts reference the live row | Editing a question silently changes how past attempts are graded and reviewed |
| Media | None | No images, audio, math, or rich text |
| Import/export | None | Every question is typed by hand |
| Adaptive | `ability += correct ? 1 : -1`, easy/medium/hard buckets | This isn't IRT; it can't be called CAT |
| Analytics | % correct per question, author's own questions only | No reliability, discrimination, distractors, or cohort views |
| Roles | Hard-coded `STUDENT/INSTRUCTOR/ADMIN` enum | No invigilator, grader, reviewer, or exam-officer roles and no scoping |
| Tables | Hand-rolled per page | No server pagination, filters, bulk actions, or column control |
| Audit | None | No record of who changed a key, extended time, or overrode a grade |

**Recommendation:** evolve the same stack incrementally rather than rewrite, but do a **clean schema redesign** (Phase 0). The data is still demo/seed data, so a breaking migration now is cheap; in six months it won't be.

---

## 1. Product principles

1. **Never lose a candidate's answer.** Every response is saved server-side within seconds and the attempt resumes exactly where it stopped.
2. **The server is the authority.** Deadline, scoring, question order, and correct answers never live on the client.
3. **Immutable history.** Attempts pin the exact question *version* and delivered layout, and every privileged action is audited.
4. **One item-type registry.** Adding a new question type means adding one folder, not touching ten files.
5. **Layered integrity.** No single anti-cheat measure is trusted. We combine prevention, detection, evidence, human review, and statistics.
6. **Fast for staff, calm for candidates.** Staff tools are bulk-first and keyboard-friendly. The candidate screen is distraction-free and accessible.
7. **LAN-first, internet-optional.** Every exam-critical path (authoring, delivery, grading, analytics, exports) runs on a local server with **zero internet**. Only optional extras (cloud sync, AI assist, email) need a connection, and they degrade gracefully.
8. **Built but dormant.** Heavier features (proctoring levels, AI) ship fully implemented behind feature flags that are off by default, so turning them on is a settings change, not a release.

---

## 2. Architecture changes

### 2.1 Stack additions

| Concern | Choice | Why |
|---|---|---|
| Background jobs | **Redis + BullMQ** worker process | Imports, exports, PDF rendering, regrades, analytics recompute, and AI calls must not run in request handlers |
| File/media storage | **S3-compatible**, **Garage** bundled by default on the LAN server (SeaweedFS as the alternative); R2/S3 only for the optional cloud hub | MinIO Community Edition was archived in 2026, so avoid it for new builds. On a LAN, uploads and downloads **stream through the app** (one origin for browsers, a permission check on every read); presigned URLs are reserved for the optional cloud hub |
| AI | **Claude** via `@anthropic-ai/sdk`, model **`claude-opus-5`** | Question generation from notes/PDFs, scanned past-question OCR, distractors, essay-grading suggestions, report summaries. Runs only in the worker and only when the server has internet (§5.4) |
| Feature flags | DB-backed flags at org → exam level (simple table + typed helper) | Proctoring levels, AI, and experimental types ship dark and are toggled per org/exam without redeploying |
| Image processing | `sharp` in worker | Resize, WebP/AVIF variants, strip EXIF, content hash for dedupe |
| Rich text | **Tiptap** (ProseMirror) with custom nodes | Images, tables, math, code, blanks, and inline dropdowns inside the prompt |
| Math/science | **KaTeX** render + **MathLive** input + mhchem | LaTeX storage, visual equation entry, and chemistry notation |
| Drag & drop | `@dnd-kit` | Accessible ordering, matching, classification, and label-the-image |
| Tables | **TanStack Table v8 + TanStack Virtual** | Headless, so it keeps our design system. Server-side pagination/sort/filter and virtualization |
| Charts | **Apache ECharts** | Histograms, heatmaps, scatter, and trace lines, with good performance on thousands of points |
| Spreadsheets | **ExcelJS** (MIT) | Styled templates, data validation, images in exports, streaming reads. SheetJS CE drops styles/drawings on write |
| Word import | **mammoth** for DOCX→HTML+images; **pandoc** worker for equations (OMML→LaTeX) | Mammoth handles structure and images but not Word equations |
| PDFs | `@react-pdf/renderer` for slips/certificates; **Playwright** (headless Chromium) for exam papers and reports | React-PDF is light; papers with math and images need a real browser layout |
| Realtime | Small **Socket.io** (or SSE) service | Invigilator dashboard, live exam control (pause, extend, broadcast), heartbeats |
| Live video (optional) | **LiveKit** (self-hostable WebRTC SFU) | Remote live proctoring only |
| On-device AI proctoring | **MediaPipe** Face Landmarker + object detector (browser), **model files and WASM served from our own server**, never a CDN | Inference on the candidate machine, so only evidence frames are uploaded, and it works on a LAN without internet |
| Observability | OpenTelemetry + Sentry | Save latency and error rates during live exams matter operationally |
| Testing | Vitest (scorers/psychometrics), Playwright e2e, **k6** load tests | We must prove 1–5k concurrent candidates before we claim it |

### 2.2 Next.js 16 notes (from `node_modules/next/dist/docs`)

- Middleware is now **`proxy.ts`**. Use it only for optimistic redirects (e.g. unauthenticated users hitting `/exams/*/take`), never as the authorization layer. Keep role checks in handlers/actions.
- **Server Actions are capped at 1 MB** by default. Media and import files go via presigned upload URLs, not through actions.
- `experimental.useOffline` retries navigations and Server Actions after reconnect. It does **not** cover our own `fetch()` calls, so exam autosave keeps its own queue (§6.4).

### 2.3 Code organisation

```
src/
  items/                      # ← the item-type registry
    registry.ts
    single-choice/
      schema.ts               # zod: interaction + scoring config
      editor.tsx              # authoring UI
      player.tsx              # candidate UI (accessible, keyboard)
      review.tsx              # post-exam review / grader view
      score.ts                # pure fn (response, key, config) -> {points, max, detail}
      stats.ts                # distractor/option extraction for analytics
      interop.ts              # QTI / Moodle XML / XLSX mappers
    multiple-response/ …
  server/
    attempts/ grading/ proctoring/ analytics/ imports/ exports/ authz/ audit/
  workers/                    # BullMQ processors (separate entrypoint)
  components/data-table/      # shared table system
```

Every type implements the same interface. Scoring functions are pure and unit-tested with fixtures.

---

## 3. Data model redesign (Prisma)

Key changes (abbreviated; not final syntax):

```
Organization(kind: UNIVERSITY | CBT_CENTRE | SCHOOL) ─┬─ Department ── Course ── Enrollment
              ├─ AcademicSession (e.g. 2026/2027) ── Term | Semester
              ├─ Level / Class / Arm            # 100L–500L · JSS1–SS3 with arms (JSS2B) · centre batches
              ├─ AssessmentComponent            # CA1, CA2, Exam with weights (e.g. 30/70) → term/semester result
              ├─ Venue ── Lab ── Seat           # CBT centres & campus labs; seat allocation per sitting
              ├─ FeatureFlag(key, scope: org|exam, enabled, config)
              ├─ User ── Membership(role, scope: org|dept|course)   # RBAC, not an enum on User
              └─ AuditLog(actor, action, entity, before, after, ip, at)

Taxonomy:   Subject → Topic → Subtopic;  LearningObjective;  BloomLevel;  Tag
Asset:      id, sha256, mime, bytes, width, height, storageKey, variants[], alt, ownerId

Question (stable identity, bank, status: DRAFT|IN_REVIEW|APPROVED|RETIRED)
  └─ QuestionVersion (immutable)
       type, content (Tiptap JSON), interaction (per-type JSON), scoring (per-type JSON),
       explanation, feedback, difficulty, points, timeEstimate, topicIds, objectiveIds,
       stimulusId?, createdBy, createdAt
Stimulus/Passage (shared reading passage, case study, audio clip) ← many QuestionVersions
ItemStats (questionVersionId, n, pValue, discrimination, pointBiserial, irtA, irtB, irtC,
           exposureRate, avgTimeSec, flags[], computedAt)
Comment/ReviewThread on Question

Exam (settings, status, gradingScale, releasePolicy, integrityProfile)
  └─ Section (title, instructions, timeLimit?, order, navigation: free|linear|locked)
       └─ SelectionRule  # either fixed QuestionVersion list OR "pick N from pool where topic=… difficulty mix=…"
ExamForm (pre-generated A/B/C/D versions, optional)
ExamSession (window start/end, access code, venue/lab, IP allowlist, invigilators, capacity)
Assignment (exam ↔ course | group | individual candidates)
Accommodation (candidateId, examId?, extraTimePct, breaks, tts, fontScale, allowUnlocked)

Attempt (examId, sessionId, candidateId, formId, status, startedAt, deadlineAt, extensions[],
         resumeCount, deviceId, ip, riskScore, score, maxScore, percent, grade, releasedAt)
  └─ AttemptItem (order, sectionId, questionVersionId, layout: shuffled option map, seed/variables)
       └─ Response (latest value, revision, savedAt, timeSpentMs, flagged, changeLog[])
       └─ ItemGrade (points, max, method: AUTO|MANUAL|AI_SUGGESTED, rubricScores, graderId,
                     comments, moderated, overriddenBy)
ProctorEvent (attemptId, type, severity, clientAt, serverAt, payload, evidenceAssetId?)
IntegrityReview (attemptId, reviewerId, decision, notes)
Job (type, status, progress, input, resultAssetId, createdBy)  # imports/exports/regrades
Webhook, ApiKey, LtiRegistration, LtiDeployment, LtiLineItem
```

Notes:
- `AttemptItem` pins the **QuestionVersion** and exact option layout, so review and regrade are always reproducible.
- `deadlineAt` is computed on the server at start as `start + limit × accommodation + extensions`, and every write checks it.
- Retired and edited questions never break old attempts.

---

## 4. Question types

Tiered by value vs effort. ✅ = auto-scored, ✍️ = manual/AI-assisted, ⚙️ = partial credit supported.

### Tier 1 — core objective (Phase 1)
| Type | Notes |
|---|---|
| Single choice (MCQ) ✅ | Options may be **text, image, or math**. "None/all of the above" can be pinned during shuffle |
| Multiple response ✅⚙️ | Scoring modes: all-or-nothing, per-correct, right-minus-wrong, min/max selections |
| True / False ✅ | Optional **"justify your answer"** manual part |
| True / False / Not Given ✅ | Common in comprehension exams |
| Fill in the blank / text entry ✅⚙️ | Multiple blanks inline in the prompt; accepted alternatives, case/space rules, regex, fuzzy (Levenshtein) threshold |
| Inline dropdown (cloze) ✅⚙️ | Dropdowns embedded in a sentence or passage |
| Numeric ✅ | Absolute/percent tolerance, units, significant figures, ranges |
| Matching ✅⚙️ | Two lists, optional distractors on the right, one-to-one or many-to-one |
| Ordering / sequencing ✅⚙️ | Partial credit by correct adjacent pairs or position |
| Classification / categorise ✅⚙️ | Drag items into buckets |
| Matrix / grid choice ✅⚙️ | Rows × columns (e.g. mark each statement true/false) |
| Short answer ✅/✍️ | Auto with alternatives, falls back to manual queue |
| Essay ✍️ | Rich text, word min/max, rubric, optional spell-check off, plagiarism similarity within cohort |

### Tier 2 — media & graphic (Phase 1–3)
| Type | Notes |
|---|---|
| Image hotspot ✅ | Author draws polygons/circles on an image; candidate clicks region(s) |
| Select point on image ✅ | Click coordinates within a tolerance region (anatomy, maps, circuits) |
| Label the image (drag labels onto image) ✅⚙️ | QTI graphic-gap-match |
| Highlight text (hottext) ✅⚙️ | Candidate selects words/sentences in a passage |
| Passage / case-study set | One stimulus (text, image, PDF, audio, video) shared by many items with a split-screen layout |
| Audio/video prompt | Play-count limits, no seeking (listening tests) |

### Tier 3 — advanced & performance (Phase 7)
| Type | Notes |
|---|---|
| Math expression entry ✅ | MathLive input; **symbolic equivalence** checking (e.g. CortexJS Compute Engine) so `2(x+1)` = `2x+2` |
| Calculated / randomised variables ✅ | Author writes `A train travels {d} km in {t} h…` with formula answer. Every candidate gets different numbers, which strongly deters answer sharing |
| File upload ✍️ | Type/size limits, virus scan in worker |
| Audio response ✍️ | Record in browser (language/oral exams) |
| Drawing / sketch ✍️ | Canvas with shapes, optionally over a background image (diagrams, graphs) |
| Graph plotting ✅ | Plot points/lines on axes with tolerance |
| Code ✅⚙️ | Monaco editor; run hidden test cases in a sandbox (self-hosted Judge0 or similar) |
| Survey / Likert (unscored) | Course evaluations and feedback forms using the same engine |

Every type supports: per-option feedback, general explanation, hints (practice mode only), points, negative marking (exam-level toggle), time estimate, topics/objectives, Bloom level, and alt text on all media.

---

## 5. Authoring & ease of use

### 5.1 Question editor
- **One editor page for all types**: type picker with icons, then a type-specific panel from the registry.
- **Rich prompt editor** (Tiptap): bold/italic/lists/tables, **paste images from clipboard**, drag-drop images, crop/resize, alt text required, KaTeX math (`$…$` shortcut plus visual MathLive editor), chemistry (mhchem), code blocks, sub/superscript.
- **Live candidate preview** side-by-side (desktop, tablet, phone widths), plus a "try it" mode that runs the real scorer so authors can check their key.
- **Autosaving drafts**, **version history with visual diff**, and restore.
- **Quality linting** on save: missing key, duplicate options, "all of the above" with shuffle on, missing alt text, option-length giveaway (correct answer much longer than the others), near-duplicate of an existing question (text similarity).
- Keyboard shortcuts: `⌘Enter` save, `⌘D` duplicate, `Alt+↑/↓` reorder options.

### 5.2 Question bank
- Shared DataTable (§10): search, faceted filters (type, topic, difficulty, status, author, has-media, p-value range, last used), saved views.
- **Bulk actions**: tag, move topic, set difficulty/points, change status, add to exam, export, retire.
- Banks with sharing permissions (personal → course → department → organisation).
- **Review workflow**: Draft → In review → Approved → Retired, with threaded comments on an item and reviewer assignment. Only approved items can go into high-stakes exams (configurable).
- Item card shows live stats (p-value, discrimination, times used, last flagged).

### 5.3 Exam builder
- **Wizard with templates**: Quiz, Mid-semester test, Final exam, CBT-centre mock (JAMB-style), Practice set, Survey.
- **Sections** with their own instructions, timers, navigation rules (free / linear / lock after leaving), and optional breaks.
- **Blueprint-driven assembly**: "Section A: 40 items — 30% Algebra, 30% Geometry, 40% Statistics; 25% easy / 50% medium / 25% hard". It shows live coverage vs. pool size and warns when a pool is too small for the randomisation requested.
- **Random per-candidate forms** from pools, or **fixed forms A/B/C/D** for paper backup.
- Settings grouped into clear panels: Timing, Navigation, Scoring (negative marking, partial credit, grade scale), Results release (immediately / after close / manually; score only vs full review with explanations), Integrity profile (§8), Accessibility.
- **Scheduling**: sessions with windows, access codes, venue/lab, IP allowlist, capacity, invigilator assignment, late-start rules.
- **Pre-flight checklist** before publishing: every item has a key, pools are big enough, time vs. estimated time is reasonable, candidates are assigned, and media loads.
- Duplicate exam, reuse settings as a template, "preview as candidate", **dry-run with synthetic candidates** to test grading.

### 5.4 AI assist with Claude (org-level flag, off by default, always human-in-the-loop)

**Features**
- **Generate draft items** from uploaded lecture notes, PDFs, or a topic + syllabus objective, landing as **drafts in review status** only, never straight into an exam.
- **Import scanned past questions**: photos/PDF scans of old papers → Claude extracts stem, options, key (if present), and figure regions → preview grid → review. This is a big time-saver for Nigerian schools and centres with paper archives.
- Generate plausible **distractors**; flag ambiguous wording, grammar, and answer giveaways; suggest topic/Bloom/difficulty tags.
- Draft **rubrics** from a model answer; suggest **essay scores** with a per-criterion rationale that the **grader must accept or edit** (never auto-released).
- Summarise item analysis and exam reports in plain English ("Q14 likely miskeyed: top scorers chose C").

**Implementation**
- Official TypeScript SDK `@anthropic-ai/sdk`, model **`claude-opus-5`** with adaptive thinking. All calls go through one `server/ai` module invoked **only from BullMQ workers**, never from exam-delivery requests.
- **Structured outputs** (`client.messages.parse` with our zod item schemas from the registry), so generated items validate against exactly the same schema the editor uses.
- **PDF and image input** natively (PDF document blocks; images for scans), so no separate OCR service is needed. Large PDFs are uploaded once via the Files API and reused.
- **Prompt caching** for the stable prefix (system prompt, item-type schemas, rubric, source document) when generating or grading many items from the same material.
- **Message Batches API** for bulk, non-urgent work (e.g. suggesting scores for 800 essays overnight) at about half the cost.
- Streaming for long generations; handle `stop_reason: "refusal"` and enable server-side refusal fallbacks.
- **LAN behaviour**: the LAN server holds the API key; AI jobs queue and run when the server has internet, and the UI shows "AI unavailable offline — queued". Nothing exam-critical depends on AI.
- **Privacy & cost controls**: send question content and anonymised responses only (no names or matric numbers); per-org monthly token budget and usage dashboard; every AI suggestion stored with model, prompt version, and who accepted it (audit). Institutions opt in explicitly.

### 5.5 Everyday polish
- Command palette (`⌘K`) and global search across exams, questions, candidates, and attempts.
- Empty states with next-step CTAs, onboarding checklist for new orgs, demo dataset.
- Toasts with **undo** for destructive actions; soft delete with a 30-day trash.
- In-app + email notifications: grading pending, exam starting soon, results released, import finished.

---

## 6. Exam delivery (candidate experience)

### 6.1 Before the exam
- Candidate dashboard: upcoming/ongoing/past exams, countdown, instructions, allowed materials.
- **System check page**: browser version, fullscreen support, camera/mic (if required), screen count, network latency, and media playback test.
- Practice mode and mock exams with the same UI, so nobody meets the interface for the first time on exam day.
- Centre login option: matric number + session PIN/access code (no email needed).

### 6.2 Exam screen
- **One-question-per-page** (default, CBT-centre style) or scroll mode.
- **Question palette** showing answered / unanswered / flagged / current, with section tabs.
- Tools (each toggleable per exam): **flag for review**, **option eliminator** (strike-through), **highlighter**, scratch notes, **basic/scientific calculator**, zoom, high-contrast/dark mode, font size, line focus.
- **Keyboard-first**: `A–E` select option, `N/P` next/previous, `F` flag, `S` submit dialog, like JAMB-style centres expect.
- Split view for passages/case studies; images zoomable (pinch/scroll) without leaving the question.
- **Review screen** before submit, listing unanswered and flagged items, with explicit confirmation. Allow submitting with unanswered items (the current app blocks this).
- Server-synced timer with section timers, 10/5/1-minute warnings, and screen-reader announcements.
- Break handling (timer paused, content hidden) where configured.

### 6.3 Accessibility & accommodations
- WCAG 2.2 AA target: full keyboard operation, focus management, ARIA for drag-and-drop alternatives (every drag interaction has a click/keyboard fallback), 400% zoom without horizontal scroll.
- Per-candidate accommodations: extra time %, extra breaks, text-to-speech, larger fonts, colour overlays, and exemption from specific lockdown rules.

### 6.4 Resilience (non-negotiable)
- **Start is idempotent**: opening the exam again resumes the existing `IN_PROGRESS` attempt; it never creates a new one.
- **Autosave on every change** (debounced ~1s) with a per-response `revision` number, so the server ignores stale/out-of-order writes. A **heartbeat every 15s** carries time-on-question and focus state.
- **Offline queue**: if a save fails, keep the latest value per item in memory plus IndexedDB (encrypted, cleared on submit), show a clear "Offline — answers saved on this device" banner, and flush on reconnect. Server state wins if the attempt was closed.
- **Server-authoritative deadline**: the client computes clock offset from the server; the server rejects writes after `deadlineAt + grace`, and a **worker auto-submits** expired attempts even if the browser is gone.
- **Single active session** per attempt (new device takes over only with invigilator approval, and it's logged).
- Media pre-fetched at start for the current section so a flaky network doesn't stall images/audio.
- Invigilator can **pause/resume/extend** individuals or the whole session, with server-side time adjustment and audit.

---

## 7. Grading & results

- **Scoring engine** per type (pure functions): exact, partial credit modes, negative marking, tolerance, alternatives/regex/fuzzy, symbolic math equivalence, test-case scoring for code.
- **Manual grading queue**:
  - **Grade by question across all candidates** (faster and more consistent) or by candidate.
  - **Anonymous marking** (hide names/matric numbers).
  - Rubrics (analytic and holistic), reusable rubric library, inline annotations/comments on essays.
  - **Double marking and moderation**: second marker on N% sample or all, with automatic flag when marks differ by more than a threshold.
  - Progress bars per grader and per question; assign graders to questions.
- **Regrade**: changing a key, dropping an item, or giving everyone credit creates a job that recomputes affected attempts, shows a before/after diff, and logs everything.
- **Grade scales**: configurable boundaries (e.g. Nigerian 5-point scale: A 70–100, B 60–69, … F 0–39), curves/scaling, pass marks per section and overall.
- **Result release policies**: instant, after window closes, or manual. Score only, score + breakdown, or full review with explanations.
- **Appeals/queries**: candidate raises a query on an item and staff resolve it (which may trigger a regrade).
- **Certificates** with QR verification link and verification page.

---

## 8. Proctoring & exam integrity

> **Rollout decision: build everything, turn nothing on by default.** Every level below is fully implemented and tested, but gated by feature flags (org-level master switch → per-exam integrity profile). Out of the box, exams run at **L0 with passive logging only**: events are recorded for later review, with no warnings, lock screens, or camera prompts. An admin enables stricter levels per org or exam when they're ready. A seeded "demo exam" with all levels on lets staff try it safely.

Exams pick an **integrity profile** from level L0–L4. Every event is stored as a `ProctorEvent` with server timestamp, feeds a **risk score**, and appears on a per-attempt **timeline**. Each rule has a configurable action: *log → warn candidate → lock screen until invigilator unlocks → auto-submit after N*.

### L0 — Practice
No restrictions.

### L1 — Browser integrity (default for high-stakes web exams)
- Fullscreen enforcement, tab/window focus loss with duration, copy/paste/right-click/print blocked and logged.
- **Multiple monitors** detection (Window Management API `screen.isExtended` where supported).
- DevTools-open heuristics, browser-resize, and suspicious-extension hints (logged as low severity; these can be spoofed).
- **Single session / device binding**, IP allowlist per session (lab subnets), access codes, late-join rules.
- **Content protection**: per-candidate shuffle of items and options, pools and forms, randomised variables, watermark overlay with candidate name/matric (discourages photographing the screen), answers never sent to the client.

### L2 — Lockdown browser / centre kiosk
- **Safe Exam Browser** integration: verify Config Key/Browser Exam Key via the **SEB JavaScript API** (modern WebViews no longer send the hash headers), and refuse to serve exam pages otherwise.
- Kiosk mode guide for CBT centres (managed OS accounts, SEB config file generated per exam).

### L3 — AI webcam/mic proctoring (remote)
- **Identity check** at start: selfie + ID card photo, face-match against the profile photo (flag for human review; never auto-fail).
- **Room/desk scan** prompt at start (and on invigilator request).
- In-browser **MediaPipe** models: no face, **multiple faces**, looking away/head-pose, face covered, **phone/book detection**, and voice activity from the mic.
- Optional **screen recording** (`getDisplayMedia`, entire screen required).
- Evidence: short frame bursts around each flag plus random periodic snapshots, uploaded to storage. No continuous video by default, which saves bandwidth and privacy.
- Explicit consent screen, retention period per org (e.g. 90 days), auto-purge job. Required under the **Nigeria Data Protection Act 2023** (and GDPR for any EU candidates).

### L4 — Live invigilation
- **Invigilator console**: live grid/seat map with status per candidate (not started / active / idle / offline / flagged / submitted), progress, time left, last heartbeat, and risk score.
- Real-time flag feed; click into a candidate to see the event timeline and latest snapshot.
- Actions: message one or broadcast to all, pause/resume, extend time, lock, force-submit, approve device change, all audited.
- Remote: optional live webcam tiles via **LiveKit**; optional phone as **second camera** (join via QR code) showing desk and hands.

### Post-exam integrity analytics
- **Integrity review queue** sorted by risk score, with evidence, timeline, and reviewer decision (clear / warning / invalidate item / invalidate attempt).
- **Statistical detection** (works even without webcams):
  - **Answer-similarity index**: pairs of candidates sharing an unusual number of identical *wrong* answers, weighted by distractor rarity and filtered by seat/lab/IP proximity.
  - **Response-time anomalies**: many hard items answered correctly in seconds.
  - **Score jumps** vs. the candidate's history; unusual answer changes (wrong→right) after focus loss.
  - **Item compromise detection**: a pool item whose p-value suddenly rises across sessions.

> Honest caveat for the product: browser-only lockdown can always be bypassed by a determined candidate with a second device. The value comes from layering prevention, detection, evidence, and statistics, and from giving humans the final decision.

---

## 9. Analytics

All heavy metrics are precomputed by worker jobs when an exam closes or grades change, stored in stats tables, and every view is exportable.

### 9.1 Candidate
- Score, percent, grade, **percentile** and rank (if released), time taken.
- **Strengths & opportunities**: performance by topic/objective/Bloom level vs. cohort average.
- Per-question review (per release policy) with explanation, time spent, and flagged/changed answers.
- Progress over time across exams and practice.

### 9.2 Exam (test-level)
- Score distribution histogram with pass mark line; mean, median, SD, min/max, pass rate.
- **Reliability: KR-20 / Cronbach's α** and **standard error of measurement**.
- Time distribution, completion vs. abandoned vs. auto-submitted, section-level stats.
- **Cut-score what-if**: drag the pass mark and see pass rate change live.
- Integrity summary: flags by type, reviewed/unreviewed.

### 9.3 Item analysis (the part serious users care about)
| Metric | Use |
|---|---|
| Difficulty (p-value) | Too easy/too hard flags |
| Discrimination index (upper vs lower 27%) | Does the item separate strong from weak candidates |
| **Corrected point-biserial** | Item-total correlation; < 0.20 = review, negative = likely miskeyed |
| **Distractor analysis** | Selection % per option by score quintile (trace lines); distractors chosen by < 5% are non-functional; distractors attracting top scorers point to ambiguity/miskey |
| Alpha-if-item-deleted | Impact on reliability |
| Time on item | Items that take far longer than their estimate |
| Flag rate & answer-change rate | Confusing wording |
| Omit rate | Unreached items suggest the time limit is too short |
| IRT a/b/c (when n is large enough) | Feeds CAT and form assembly |
| Exposure rate | How often an item has been seen, for retirement decisions |

Each problem item gets an **auto-generated recommendation** and one-click actions: *fix key → regrade*, *drop item*, *credit all*, *send to review*.

### 9.4 Cohort / programme / admin
- **Heatmap: topic × class/department/course**, and trend over semesters.
- Course and department dashboards: pass rates, grade distributions, at-risk candidates (consistently low across exams).
- Question-bank health: coverage per topic, items by difficulty, stale/over-exposed items.
- Operational: concurrent candidates, autosave latency p95, disconnect counts, incidents per session.

### 9.5 Adaptive testing (CAT), done properly (Phase 7)
- Calibrate items with **2PL/3PL IRT** from real response data (R `mirt`/Python worker job), stored in `ItemStats`.
- Ability estimation **EAP** (MLE once responses are mixed); item selection by **Maximum Fisher Information** with **randomesque / Sympson-Hetter exposure control** and **content balancing** to blueprint targets.
- Stop rules: SEM threshold, min/max items, time.
- Simulation tool: run synthetic candidates to check accuracy and exposure before going live.

---

## 10. Tables & UI system

A single **`<DataTable>`** built on TanStack Table, used everywhere (question bank, exams, candidates, attempts, results, grading queue, audit log, integrity queue):

- Server-side pagination, sorting, filtering; **state in the URL** (shareable, back-button safe).
- Faceted filters with counts, date ranges, numeric ranges, and a global search.
- Column visibility, reorder, resize, **pinning**, density toggle (compact/comfortable), sticky header.
- **Saved views** per user (e.g. "Unreviewed essays — CSC 201").
- Row selection with a **bulk action bar**, confirm dialogs, and undo.
- Inline edit for simple fields (points, difficulty, status).
- Expandable rows (attempt → per-item responses), row hover preview (question render).
- **Virtualised rows** for large result sets; skeleton loading, empty and error states.
- **Export current view** (respecting filters/columns) to CSV/XLSX.
- Keyboard navigation and screen-reader labels.

Adopt accessible headless primitives (Radix-style) for dialogs, menus, comboboxes, tooltips, tabs, keep the existing visual language from `globals.css`, and add design tokens for light, dark, and high-contrast modes.

---

## 11. Imports

All imports run through the **same pipeline**: *Upload → Parse (job) → Preview grid with per-row errors & warnings → Fix inline or re-upload → Map to bank/topic → Duplicate detection → Commit → Import report*. Every import is a batch that can be **undone**.

| Format | Types covered | Images/media |
|---|---|---|
| **Cibiti XLSX template** (+ optional ZIP of media) | All Tier 1 types; one sheet per type with dropdown validation and examples | Reference `image: q12.png` in a column and put files in the ZIP |
| **CSV** | Simple MCQ/TF/short answer | Same ZIP convention |
| **Word (.docx)** | MCQ, multi-response, TF, fill-blank, short answer, essay, using a simple convention (`1.` question, `A.` options, `*` or `Answer: B`, `Topic:`, `Difficulty:`) | **Inline images extracted automatically**; Word equations converted to LaTeX (pandoc) |
| **Aiken (.txt)** | MCQ | — |
| **GIFT (.txt / .zip)** | MCQ, TF, short answer, matching, numeric | ZIP with media |
| **Moodle XML** | Most Moodle types | Base64-embedded images decoded |
| **QTI 2.1 / 3.0 package (.zip)** | Choice, order, match, gap-match, inline choice, text entry, hotspot, extended text… | Package media resources |
| **Cibiti bundle (.zip, JSON + assets)** | Everything, lossless (versions, topics, stats optional) | Included |
| **PDF / scanned past questions** (experimental, AI) | MCQ extraction with figure cropping, always into review status | Cropped figures |

Also: **paste a block of questions** into a "quick import" box using the Aiken-like convention, and paste images straight into the editor.

**People & structure imports**: candidates (matric no., name, email, department, level, courses) with a **photo ZIP matched by matric number**, enrolments, departments/courses, and staff.

Docs: downloadable templates plus a sample DOCX and ZIP for each format.

---

## 12. Exports

All exports are background jobs with progress, landing in a **Download centre** (and optionally emailed or scheduled).

| Export | Formats |
|---|---|
| Question bank / selection | Cibiti bundle, **QTI 3.0**, Moodle XML, XLSX, DOCX |
| **Printable exam papers** | PDF/DOCX: multiple forms A/B/C/D, cover page, instructions, images and math rendered, **answer key** and marking scheme, optional OMR-style answer sheet |
| Results | XLSX/CSV with chosen columns (per item, per section, per topic), **course broadsheet**, grade summary |
| Result slips / transcripts | PDF per candidate or merged, with QR verification |
| Candidate scripts | PDF of an attempt's responses and grades (appeals, external moderation) |
| Item analysis report | PDF + XLSX |
| Integrity report | PDF with timeline and evidence thumbnails |
| Audit log | CSV |
| Grade passback | **LTI 1.3 AGS** to Canvas/Moodle/Blackboard, plus REST API and webhooks (`attempt.submitted`, `results.released`, …) |

---

## 13. Platform, security & operations

- **RBAC with scopes**: Super admin, Org admin, Exam officer, Author, Reviewer, Grader, Invigilator, Candidate. Permissions are checked in one `authz` module with policy tests.
- **Multi-tenant organisations** with branding (logo, colours, certificate templates, custom domain later).
- **Audit log** for every privileged action (key change, grade override, time extension, integrity decision, role change, export of personal data).
- Auth: staff **2FA**, Google/Microsoft SSO, rate-limited login, session/device management; candidate PIN login for centres.
- **LTI 1.3 Advantage** (launch, Deep Linking to pick an exam, AGS grade passback, NRPS roster sync).
- **Deployment**: LAN-first (see §14). A cloud deployment of the same bundle is supported later as an optional hub.
- **Performance targets**: **500 concurrent candidates on one mid-range LAN server** (1,000+ with a second app node), 5,000 in the optional cloud; autosave p95 < 300 ms on LAN; exam start < 2 s; zero lost responses in chaos tests (kill server, pull the network cable, power-cycle a candidate PC mid-exam).
- Security: CSP headers, signed short-lived media URLs, answer keys never in client bundles/props, per-attempt option shuffles keyed server-side, backups with point-in-time recovery, and a data retention and deletion policy (NDPA 2023).

---

## 14. LAN-first deployment

The primary product is a **local exam server** that a university ICT unit, CBT centre, or school runs on its own network. Candidate PCs just need a browser.

### 14.1 What ships
- **One installer / `docker compose` bundle**: Next.js app, worker, realtime service, Postgres, Redis, Garage storage, and a local reverse proxy with TLS (self-signed CA the installer can push to lab PCs, or plain HTTP on isolated labs).
- **No runtime internet dependencies**: fonts, icons, KaTeX/MathLive assets, MediaPipe models, PDF fonts, and Safe Exam Browser config files are all bundled locally. CI fails the build if any page loads an external URL.
- **Local discovery**: a fixed LAN address/hostname (e.g. `http://cbt.local`), printed on a QR code in the admin console for lab setup.
- **Hardware guide**: minimum and recommended specs for 100 / 250 / 500 / 1,000 seats, UPS requirement, switch/Wi-Fi guidance.
- **Updates** by offline package (USB) or online when available, with automatic DB backup before each migration and one-click rollback.
- **Licensing/activation** that works offline (signed licence file bound to the org, seat count, expiry).

### 14.2 Centre & exam-day operations
- **Centre admin console**: server health (CPU, RAM, disk, DB, queue), connected candidates per lab, network latency to each seat, and storage usage.
- **Sittings & seat allocation**: multiple sittings per day, auto-assign seats per lab, print seat lists and attendance sheets, and candidate check-in (scan matric/registration number QR on the slip).
- **Power and machine failure**: a candidate moves to any free PC, logs in, and the invigilator approves the transfer; the attempt resumes with the same deadline (paused time credited if the invigilator records an outage).
- **Server-time only**: candidate PCs' clocks are ignored; all timing comes from the LAN server.
- **Bulk session control**: start/pause/extend/end a whole lab or sitting from one screen.
- **Result slips printed on site** immediately after the sitting (if release policy allows).

### 14.3 Data safety
- **Continuous local backups**: Postgres WAL archiving plus scheduled full dumps to a second disk or USB drive; media snapshots; restore drill script.
- **Export/import between servers**: move an exam (questions + media + candidates) from a "setup" server to exam-day servers using the Cibiti bundle, with a checksum.
- **Encrypted at rest** option for the data volume; exam content locked until the sitting starts (decrypt key released by the exam officer's action) to reduce leaks on shared servers.

### 14.4 Optional cloud hub (later)
- Multiple campuses/centres **sync** results, item stats, and question banks to a central hub when internet is available (outbox pattern with idempotent batches; LAN is always source of truth for its own sittings).
- The hub is also where AI jobs can run if the LAN server has no internet at all.

---

## 15. Roadmap

Each phase ends with something demo-able. Sizes: S ≈ days, M ≈ 1–2 weeks, L ≈ 3+ weeks for one developer.

### Phase 0 — Foundations reset (L) · *must come first*
- **Drop the demo data** and move to the new schema (§3): versions, sections, attempt items, responses, grades, events, assets, memberships, academic structure (sessions/terms, levels/classes, assessment components), venues/labs/seats, feature flags, audit log, jobs.
- **LAN-ready from day one**: docker compose bundle running app + worker + Postgres + Redis + Garage locally, no external URLs.
- Item-type registry with the existing types ported (single choice, TF, short answer) and tests for scorers.
- **Attempt resume + autosave + server deadline + worker auto-submit** (fixes current data-loss bugs).
- Persist lockdown events as `ProctorEvent`.
- RBAC module, audit log, S3 storage with presigned uploads, BullMQ worker, and `<DataTable>` v1.
- CI: typecheck, lint, Vitest, Playwright smoke test of "author → publish → take → grade".

### Phase 1 — Authoring 2.0 (L)
- Tiptap editor with images, math, tables; live preview; quality lint; version history.
- All **Tier 1** types plus image-option MCQ, passages/stimulus sets, hotspot and label-the-image.
- Taxonomy (subjects/topics/objectives/Bloom), bank permissions, review workflow, bulk actions.

### Phase 2 — Delivery 2.0 (L)
- Sections, pools & blueprints, forms, scheduling/sessions/access codes, assignments.
- New candidate UI: palette, flag, eliminator, calculator, highlighter, review screen, keyboard shortcuts, system check, practice mode.
- Offline queue, clock sync, accommodations, WCAG pass.

### Phase 2.5 — LAN centre operations (M)
- Installer/bundle hardening, hardware guide, offline licence, backups and restore drill, offline update packages.
- Centre admin console, sittings & seat allocation, check-in, PC transfer, bulk lab controls, on-site slip printing.
- k6 load test to 500 concurrent candidates on reference hardware; chaos tests (cable pull, server restart, PC power loss).

### Phase 3 — Import & export (M–L)
- XLSX/CSV + media ZIP, DOCX with images & equations, Aiken, GIFT, Moodle XML, candidate + photo import.
- Result exports, **university broadsheets** (CA + exam weighting, GPA-ready), **school term report sheets** (per class/arm, positions, CA + exam), **CBT-centre result slips**, certificates with QR, printable papers with answer keys, download centre.
- QTI 3.0 import/export.

### Phase 4 — Grading (M)
- Manual grading queue (by question, anonymous), rubrics, annotations, double marking & moderation.
- Regrade jobs, grade scales, release policies, appeals.

### Phase 5 — Analytics (M–L)
- Stats jobs; exam dashboard (distribution, KR-20/α, SEM, cut-score what-if).
- Item analysis with distractor trace lines and auto-recommendations; one-click fixes.
- Candidate strengths & opportunities; cohort topic heatmaps; exportable reports.

### Phase 6 — Proctoring, built dark (L)
All of this ships **behind feature flags, off by default** (exams default to L0 + passive logging).
- Flag framework for integrity profiles (org master switch → per-exam level), seeded demo exam with everything on.
- L1 hardening + configurable actions + risk score + **integrity review queue**.
- **Invigilator live console** (realtime service): pause/extend/message/force-submit. *Useful for LAN centres even with proctoring off.*
- L2 Safe Exam Browser integration plus a config-file generator for labs.
- L3 in-browser AI (face, multi-face, gaze, phone, voice) with locally served models, ID check against candidate photo, evidence storage on the LAN, consent & retention.
- Statistical collusion and timing anomaly detection (runs after every exam; results visible only when the flag is on).
- L4 live video (LiveKit, self-hosted on the LAN server) and phone second camera, built last and lowest priority.

### Phase 7 — Advanced types & real CAT (L)
- Math entry with equivalence, calculated/randomised questions, drawing, audio response, file upload, graph plotting, code questions.
- IRT calibration jobs, CAT engine (EAP + MFI + exposure control + content balancing), simulator.

### Phase 8 — AI assist & platform (L)
- **Claude AI assist** (§5.4) behind an org flag: scanned past-question import, item generation from notes/PDFs, distractors, quality checks, rubric drafting, essay score suggestions (batch), report summaries; usage budgets and audit.
- Multi-tenancy & branding, staff 2FA, optional Google/Microsoft SSO, public API & webhooks.
- Optional **cloud hub with multi-site sync** (§14.4).
- LTI 1.3 (low priority for these markets; universities using Moodle may want it).
- External accessibility audit.

---

## 16. Decisions (confirmed 2026-09-15)

| # | Decision | What it changes in this plan |
|---|---|---|
| 1 | **Markets: universities, CBT centres, schools** | Academic structure for all three (sessions/terms/semesters, levels/classes/arms, CA + exam weighting); broadsheets, term report sheets, and centre result slips; JAMB-style candidate UI and keyboard shortcuts; corporate features and LTI deprioritised |
| 2 | **Deployment: mainly local network** | New §14. LAN bundle is part of Phase 0 and hardened in Phase 2.5 (not Phase 8); no runtime internet dependencies; server-time only; backups, offline licence and updates; cloud becomes an optional sync hub |
| 3 | **Proctoring: implement fully, keep it off** | Feature-flag framework; all levels built in Phase 6 but exams default to L0 with passive logging; invigilator console useful regardless; demo exam to try it |
| 4 | **AI: Claude** | `@anthropic-ai/sdk` with `claude-opus-5` in workers only; structured outputs against the item schemas, native PDF/image input for scanned papers, prompt caching, batch API for bulk essay suggestions; queued when offline; opt-in per org |
| 5 | **Schema reset: yes** | Phase 0 drops demo data and replaces the schema outright, with no migration shims for the old models; the seed script is rewritten for the new model |

### Still open (can be decided during Phase 0–1)
- Which school curricula to ship with starter taxonomies (Nigerian NERDC subjects? WAEC/NECO/JAMB syllabus topics?).
- Grade scales to seed (university 5-point, polytechnic 4-point, WAEC-style A1–F9 for schools).
- Reference LAN server hardware to certify against for the 500-seat target.

---

## Sources

- Learnosity question types: [learnosity.com/build/questions](https://learnosity.com/build/questions/), [Question types overview](https://www.learnosity.com/features/question-types-overview)
- QTI interactions: [TAO QTI interactions](https://userguide.taotesting.com/user-documentation/latest/public/qti-interactions), [QTI 3 implementation guide](https://www.imsglobal.org/spec/qti/v3p0/impl), [qti3 TypeScript reference](https://github.com/LongsightGroup/qti3)
- Inspera: [Inspera Assessment](https://inspera.com/inspera-assessment/), [April 2026 release notes](https://support.inspera.com/hc/en-us/articles/35179490633885-April-2026-Release-Notes)
- ExamSoft: [Strengths & Opportunities report](https://support.examsoft.com/hc/en-us/articles/11166823429261-Enterprise-Portal-View-the-Individual-Strengths-Opportunities-Report-S-O-Report), [ExamSCORE rubrics](https://examsoft.com/solutions/exam-score/)
- Moodle import formats: [Import questions](https://docs.moodle.org/502/en/Import_questions), [Moodle XML format](https://docs.moodle.org/502/en/Moodle_XML_format)
- Proctoring: [Honorlock phone detection](https://honorlock.com/blog/proctoring-cell-phone-detection-new/), [Workspace scan](https://honorlock.kb.help/workspace-scan-test-taker-guide/), [Proctorio vs Honorlock](https://www.edtick.com/en/software/comparisons/honorlock-vs-proctorio), [Client-side AI proctoring engine](https://github.com/SBanditaDas/Client-Side-AI-Exam-Proctoring-Engine), [Smart Exam Monitoring System](https://github.com/shankadeepdey/Smart-Exam-Monitoring-System)
- Safe Exam Browser: [Integration](https://safeexambrowser.org/developer/seb-integration.html), [Config Key](https://safeexambrowser.org/developer/seb-config-key.html)
- Psychometrics: [Item analysis guide (ASC)](https://assess.com/item-analysis/), [Distractor analysis](https://assess.com/distractor-analysis-test-items/), [Distractor efficiency study](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11040895/)
- CAT: [Item selection components](https://pmc.ncbi.nlm.nih.gov/articles/PMC5968224/), [projectCAT](https://pubmed.ncbi.nlm.nih.gov/42614332/), [Exposure control methods](https://files.eric.ed.gov/fulltext/EJ1057460.pdf)
- Resilience: [ExamBank offline save UX](https://github.com/nassarwafik/ExamBank791381/pull/69), [Offline exam software guide](https://www.conductexam.in/blog/no-internet-no-problem-the-complete-guide-to-offline-exam-software)
- LTI: [LTI AGS 2.0](https://www.imsglobal.org/spec/lti-ags/v2p0), [LTI Advantage FAQ](https://www.imsglobal.org/lti-advantage-faq)
- Accessibility: [Kryterion WCAG in testing](https://www.kryterion.com/blog/accessible-certification-exam-delivery-wcag-2-1-vpat-compliance/), [ExamSoft accessibility](https://examsoft.com/about-examsoft/accessibility-statement/)
- Nigerian CBT context: [o3schools CBT centre software](https://o3schools.com/best-jamb-cbt-software-for-computer-centres/), [TestDriller UTME](https://www.testdriller.com/utme)
- Libraries: [TanStack Table](https://tanstack.com/table/v8/docs/framework/react/examples/pagination-controlled), [Tiptap math](https://tiptap.dev/docs/editor/extensions/nodes/mathematics), [mammoth.js](https://github.com/mwilliamson/mammoth.js/), [SheetJS vs ExcelJS 2026](https://www.pkgpulse.com/guides/sheetjs-vs-exceljs-vs-node-xlsx-excel-files-node-2026), [PDF in Next.js](https://pdf4.dev/blog/pdf-generation-nextjs), [MinIO alternatives 2026](https://wz-it.com/en/blog/minio-successor-s3-storage-comparison/)
