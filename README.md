# Cibiti

A focused workspace for **computer-based testing (CBT)**. Students take assessments, instructors author questions and exams, and everyone gets clear results.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS)
- **Prisma 6** + **PostgreSQL**
- **Auth.js (NextAuth v5)** with credentials and role-based sessions
- **Zod** for validation, **bcryptjs** for password hashing

## Getting started

### 1. Start the database

```bash
docker compose up -d
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

### 4. Create the schema and seed demo data

```bash
npx prisma db push
npm run db:seed
```

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Demo accounts

| Role       | Email                 | Password     |
|------------|-----------------------|--------------|
| Instructor | `instructor@cibiti.dev` | `password123` |
| Student    | `student@cibiti.dev`    | `password123` |

## Workflow

1. **Instructor** signs in, adds questions to the bank, creates an exam, adds questions, and publishes it.
2. **Student** signs in, opens the exam, enters fullscreen (secure mode), answers, and submits.
3. Both roles see results; instructors see all students' attempts.

## Scripts

| Command          | Description                          |
|------------------|--------------------------------------|
| `npm run dev`    | Start the dev server                 |
| `npm run build`  | Production build                     |
| `npm run lint`   | Lint the codebase                    |
| `npm run db:seed`| Seed demo users, questions, and exam |

## Security notes

- Passwords are hashed with bcrypt (cost 12).
- Exam-taking uses a browser lockdown hook (fullscreen, tab-switch and copy/paste detection).
- Role checks are enforced server-side on every API route.
