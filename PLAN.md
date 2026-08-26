# 🎓 Advanced CBT System — Development Plan

> **CBT** = Computer-Based Testing. A web-based exam/assessment platform for students/trainees, with an admin side for creating exams and a student side for taking them. The "advanced" differentiators are **adaptive testing (CAT)**, **AI-assisted question generation & grading**, **anti-cheating/proctoring**, and **rich analytics**.

---

## 1. Recommended Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Frontend** | Next.js (React) + TypeScript + Tailwind | Fast, SEO-friendly, one codebase |
| **Backend** | Next.js API routes (or Node/Express) | Shared types, simpler deploy |
| **Database** | PostgreSQL + Prisma ORM | Relational data (exams, questions, attempts) |
| **Auth** | NextAuth (JWT) | Roles: student / instructor / admin |
| **Real-time** | WebSockets (Socket.io) | Live proctoring, auto-submit on time-up |
| **AI** | OpenAI API | Question generation, essay grading, reports |
| **Caching/Queue** | Redis + BullMQ | Handle large concurrent exam loads |

---

## 2. Core Feature Modules

### A. Question Bank & Authoring
- **20+ question types**: multiple-choice, multi-select, true/false, fill-in-blank, matching, ordering, essay, hotspot, media-based (image/audio/video), dropdown
- **Metadata**: difficulty, topic/tag, discrimination, time estimate, point value
- **Bulk import** (Excel/CSV) and **AI generation** from a topic prompt
- **QTI import/export** for interoperability

### B. Exam Engine (the heart)
- **Exam builder**: assemble from question bank, set time limits, shuffle, sectioning, pass marks
- **Adaptive mode (CAT)**: IRT-based item selection — start at medium difficulty, pick next item based on ability estimate, terminate when precision threshold met
- **Fixed/linear mode**: classic sequential exams
- **Auto-grading** for objective questions; **AI-assisted grading** with rubrics for essays
- **Timer** with auto-submit, question palette/navigation, flag-for-review, mark & review

### C. Anti-Cheating / Proctoring
- Question & option **shuffling** per student
- **Unique exams** generated from a large bank (no two students get the same set)
- **Browser lockdown**: tab-switch detection, copy/paste disable, fullscreen enforcement
- **Webcam proctoring** (optional): periodic snapshots, face detection, suspicious-event flags
- **IP/device fingerprinting** and session anomaly logging

### D. Results & Analytics
- **Student**: instant score, per-topic breakdown, answer review, certificates on pass
- **Instructor**: class performance, question difficulty/discrimination stats, item analysis, cheating flags
- **Admin**: platform-wide usage, exam analytics, AI-generated summary reports

### E. Roles & Workflow
- **Student**: browse/assign exams, take exam, view results
- **Instructor**: create questions/exams, review attempts, grade essays
- **Admin**: manage users, orgs, settings

---

## 3. Recommended Build Phases

| Phase | Scope | Deliverable |
|-------|-------|-------------|
| **1. Foundation** | Next.js + Prisma + auth + roles | Working skeleton, DB schema |
| **2. Question Bank** | CRUD, 6 core question types, import | Authoring UI |
| **3. Exam Engine** | Fixed exams, timer, auto-grading, results | Students can take & get scored |
| **4. Adaptive (CAT)** | IRT engine, item selection, scoring | Adaptive exams |
| **5. Anti-cheating** | Shuffling, lockdown, proctoring | Secure exams |
| **6. Analytics & AI** | Reports, AI grading, AI generation | Advanced features |
| **7. Polish** | Certificates, branding, performance, deploy | Production-ready |

---

## 4. Open Decisions (to confirm before scaffolding)

1. **Scope for v1** — Full adaptive (CAT) engine from the start, or start with fixed exams and add adaptivity later? *(Recommended: start fixed, then layer CAT.)*
2. **Proctoring depth** — Full webcam proctoring is complex and privacy-sensitive. Start with browser lockdown + shuffling, or go all-in?
3. **AI features** — Integrate an AI API (OpenAI) for question generation and essay grading, or keep it fully deterministic for v1?
4. **Deployment target** — Local dev only for now, or a hosting target (Vercel, Docker, etc.)?

---

## 5. Research Notes

- **Assessment types**: formative, summative, diagnostic, practice, survey
- **Question types** (industry standard): MC, multi-response, T/F, fill-blank, matching, essay, hotspot, order, dropdown, media-based
- **CAT (computer-adaptive testing)**: IRT-based; iterative loop of (1) select optimal item from ability estimate, (2) present item, (3) update ability estimate, (4) repeat until termination criterion. Uses MLE or Bayesian (EAP/MAP) scoring. Exposure control via Sympson-Hetter or shadow tests.
- **Anti-cheating**: shuffling, unique exams from a large bank, browser lockdown, proctoring
- **Analytics**: question difficulty, discrimination, learner behavior, AI reports
- **Interoperability**: QTI (IMS Global Question & Test Interoperability) standard
