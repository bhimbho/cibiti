# Cibiti

Computer-based testing for **universities, CBT centres and schools**, built to run on a **local network** with no internet required during exams. See [PLAN.md](PLAN.md) for the full product plan.

## What works today (Phase 0)

- **Resilient exam delivery**: attempts resume after a refresh, crash or network drop; answers autosave within a second with an offline queue; the server owns the deadline and a background worker auto-submits expired attempts.
- **Candidate exam screen**: one question per page, question palette, flag for review, review screen, keyboard shortcuts (A–E, N, P, F), server-synced timer.
- **Question types**: single choice, multiple response (all-or-nothing, partial, right-minus-wrong), true/false and short answer, each with pure, unit-tested scoring.
- **Exams**: sections with fixed questions or questions drawn at random from the bank, shuffling, negative marking, sittings with access codes and IP allowlists, accommodations (extra time), release policies.
- **Integrity**: every focus, fullscreen, clipboard and network event is logged. Enforcement is built but off unless the `proctoring` feature flag is enabled.
- **Question bank & editor**: searchable table with bulk approve/retire; editor with images, subjects and topics, versioning, and a live candidate preview that checks the answer.
- **Exam builder**: settings, sections, fixed questions and random draws, sittings with access codes, labs and IP allowlists, publish checks, close/duplicate.
- **Results**: staff results table with release controls, attempt reports with answer review and integrity timeline; candidates see their own released results.
- **People**: accounts with roles and generated one-time passwords, extra-time accommodations, CSV import in a background job.
- **Academics**: departments, levels, groups/arms, sessions and terms, venues and labs, courses with registration by matric number.
- **Invigilation & settings**: live console (add time, move computer, submit), feature-flag switches, audit log.

Manual grading queues, analytics and advanced question types are next (Phases 4–7).

## Stack

Next.js 16 · React 19 · Prisma 6 + PostgreSQL · Redis + BullMQ · Garage (S3-compatible storage) · Auth.js · Zod · TanStack Table · Vitest · Playwright

## Getting started

### 1. Configure the environment

```bash
cp .env.example .env
```

Generate the secrets in `.env`:

```bash
openssl rand -hex 32   # AUTH_SECRET, STORAGE_SECRET_KEY, GARAGE_RPC_SECRET, GARAGE_ADMIN_TOKEN
echo "GK$(openssl rand -hex 12)"   # STORAGE_ACCESS_KEY
```

### 2. Start Postgres, Redis and storage

```bash
docker compose up -d db redis storage
```

Already running Postgres or Redis natively? Start only `storage`, or change `DB_PORT` / `REDIS_PORT` in `.env`.

### 3. Install, create the schema and seed

```bash
npm install
npx prisma db push
npm run db:seed
npm run storage:check
```

### 4. Run the app and the worker

```bash
npm run dev      # http://localhost:3000
npm run worker   # in a second terminal: auto-submit and background jobs
```

Health check: [http://localhost:3000/api/health](http://localhost:3000/api/health)

## Demo accounts

Every account uses the password `password123`.

| Role | Sign in with |
|---|---|
| Org admin | `admin@cibiti.dev` |
| Exam officer | `officer@cibiti.dev` |
| Instructor (author + grader) | `instructor@cibiti.dev` |
| Invigilator | `invigilator@cibiti.dev` |
| Candidate | `student@cibiti.dev` or `CSC/2026/001` |
| Candidate | `CSC/2026/002`, `CSC/2026/003` |

The seed creates two exams: a timed CSC101 continuous assessment (one attempt, Section B drawn at random) and an untimed General Studies practice quiz open to everyone (three attempts).

## LAN server

The same compose file runs the whole stack on a local exam server:

```bash
docker compose --profile lan up -d --build
docker compose --profile lan run --rm app npx prisma db push
docker compose --profile lan run --rm app npm run db:seed   # optional demo data
```

The app is served on port 80 (`APP_PORT`). Candidate computers only need a browser pointed at the server.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run worker` | Start the background worker (auto-submit, sweeps) |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` / `npm run typecheck` | Static checks (run `npx next typegen` first on a fresh clone) |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright; needs a seeded database, app and worker) |
| `npm run db:push` / `npm run db:seed` | Apply the schema / seed demo data |
| `npm run storage:check` | Round-trip a file through object storage |

## Security notes

- Passwords are hashed with bcrypt (cost 12). Roles are read from the database on every request, never trusted from the session.
- Answer keys never leave the server; candidates receive per-attempt layouts only.
- Uploaded files are identified by content, not extension, and served only to signed-in members of the same organisation.
- Privileged staff actions are written to the audit log.
