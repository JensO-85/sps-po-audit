# PLAN.md — SPS PO Audit App

## Architecture Decisions

### Framework: Next.js (App Router) + TypeScript
- Single deployment unit — API routes and React UI in one app, no separate backend service.
- App Router enables React Server Components (RSC) so Prisma queries run server-side with no extra API layer for UI data fetching.
- Native TypeScript support; strong ecosystem for every library we need.

### Database: PostgreSQL + Prisma
- Relational model is a natural fit: users, buy plans, PO uploads, and comparison results have clear foreign-key relationships.
- Prisma gives us type-safe queries, schema-driven migrations, and Prisma Studio for quick data inspection.
- Railway's managed Postgres is free-tier eligible and zero-config with the Next.js service.

### Auth: NextAuth.js v5 (Credentials provider)
- Credentials (email + bcrypt password) — no OAuth needed for internal-only users.
- Admin creates user accounts directly via Prisma Studio or a seed script; no self-signup UI required in v1.
- Session stored as a signed JWT cookie; no extra Redis needed.

### File Handling
- Uploaded files (PDFs, Excel) are parsed immediately server-side; only the structured JSON is persisted to the DB.
- Raw files are not stored long-term in v1 — simplifies deployment (no S3 bucket, no file-system persistence across deploys).
- If re-parsing is needed later, the user re-uploads. This is acceptable for v1 given internal usage patterns.

### PDF Parsing Strategy
- Use `pdf-parse` to extract raw text from SPS PO PDFs.
- SPS PO PDFs have a consistent layout; write a custom text-parsing function that locates line items by pattern/position.
- Parser is encapsulated and independently testable — swappable if SPS changes their format.

### Deployment: Railway
- Single `railway.json` or `Procfile` — deploy the Next.js app + provision a Postgres plugin.
- `npm run build && npm start` production command.
- Environment variables set in Railway dashboard.

---

## Milestone Plan

### Milestone 1 — Project Scaffold & Auth
**Goal:** Working Next.js app, connected to Postgres, with login/logout.

Tasks:
- `npx create-next-app@latest` with TypeScript, Tailwind, App Router
- Install and configure Prisma; write initial schema (users, sessions)
- Install NextAuth.js v5; configure Credentials provider with bcrypt
- Protected layout: redirect unauthenticated users to `/login`
- Login page UI (email + password form)
- Seed script: create first admin user
- Deploy skeleton to Railway; confirm DB connection and auth works in production

Deliverables: `prisma/schema.prisma` (v1), `app/(auth)/login/`, `lib/auth.ts`, `lib/db.ts`, Railway config.

---

### Milestone 2 — File Upload Infrastructure
**Goal:** Users can upload PO PDFs and a Buy Plan Excel via the UI; files are received and ACKed server-side.

Tasks:
- Upload page UI (`/upload`) with two drop zones: "SPS PO PDFs (one or more)" and "Buy Plan Excel"
- API route `POST /api/po-uploads` — accept multipart PDF uploads, return upload IDs
- API route `POST /api/buy-plans` — accept multipart Excel upload, return buy-plan ID
- Extend Prisma schema: `po_uploads`, `buy_plans` tables (store parsed JSON + metadata)
- File validation: type checks (PDF / xlsx), size limit, error messaging in UI

Deliverables: `app/(dashboard)/upload/`, `app/api/po-uploads/route.ts`, `app/api/buy-plans/route.ts`, schema additions.

---

### Milestone 3 — PDF Parser (SPS PO Format)
**Goal:** Uploaded PO PDFs are parsed into structured `PoLineItem[]` and stored in the DB.

Tasks:
- Install `pdf-parse`
- Inspect real SPS PO PDFs and document their text layout/structure
- Write `lib/parsers/po-pdf.ts`: `parsePoPdf(buffer: Buffer): PoLineItem[]`
- Parse: SKU, description, quantity, unit cost, line total, UOM/pack, ship date, in-DC date
- Wire parser into `POST /api/po-uploads` — parse on upload, store JSON in `po_uploads.parsed_data`
- Write unit tests with sample PO text fixtures (`__tests__/parsers/po-pdf.test.ts`)

Deliverables: `lib/parsers/po-pdf.ts`, `lib/schemas.ts` (Zod shapes), tests.

---

### Milestone 4 — Buy Plan Parser (Excel)
**Goal:** Uploaded Buy Plan Excel is parsed into `BuyPlanRow[]` and stored in the DB.

Tasks:
- Install `exceljs`
- Inspect real Buy Plan Excel and document column layout
- Write `lib/parsers/buy-plan.ts`: `parseBuyPlan(buffer: Buffer): BuyPlanRow[]`
- Parse: SKU, description, quantity, unit cost, UOM/pack, ship date, in-DC date
- Wire parser into `POST /api/buy-plans`
- Unit tests with a sample Excel fixture

Deliverables: `lib/parsers/buy-plan.ts`, tests.

---

### Milestone 5 — Comparison Engine & DB Storage
**Goal:** Users can trigger a comparison; results are stored and retrievable.

Tasks:
- Write `lib/comparison/engine.ts`: `runComparison(poLines: PoLineItem[], buyPlan: BuyPlanRow[]): ComparisonItem[]`
  - Match by SKU (exact, case-insensitive)
  - Detect discrepancies: unit cost (±$0.01), description, quantity, UOM/pack, math (qty × cost vs line total)
  - Flag unmatched SKUs
- Extend schema: `comparisons`, `comparison_items` tables
- API route `POST /api/comparisons` — accept `{ poUploadIds, buyPlanId }`, run engine, persist results
- API route `GET /api/comparisons/[id]` — return full comparison with line items + discrepancies
- Unit tests for engine (edge cases: rounding, missing SKUs, case differences)

Deliverables: `lib/comparison/engine.ts`, schema additions, routes, tests.

---

### Milestone 6 — Discrepancy Report UI
**Goal:** Users see a clear, filterable discrepancy report in the browser.

Tasks:
- Comparison list page (`/comparisons`) — date, PO file names, Buy Plan name, discrepancy count
- Comparison detail page (`/comparisons/[id]`)
  - Summary bar: total lines, lines with discrepancies, unmatched SKUs
  - Table: one row per PO line; columns for each field; discrepant cells highlighted (amber/red)
  - Filter: "Show discrepancies only" toggle
  - Unmatched SKUs section
- Trigger comparison from upload page (redirect to result on completion)

Deliverables: `app/(dashboard)/comparisons/`, shared table components.

---

### Milestone 7 — Excel Export
**Goal:** Users can download the discrepancy report as a formatted Excel file.

Tasks:
- Write `lib/comparison/export.ts`: `generateExportWorkbook(comparison): ExcelJS.Workbook`
  - Sheet 1: all line items with discrepant cells highlighted (ExcelJS cell fill)
  - Sheet 2: summary (counts by discrepancy type)
- API route `GET /api/comparisons/[id]/export` — streams Excel file download
- "Export to Excel" button on comparison detail page

Deliverables: `lib/comparison/export.ts`, export route, UI button.

---

### Milestone 8 — Polish & Production Hardening
**Goal:** App is reliable, clearly usable by non-technical staff, and running stably on Railway.

Tasks:
- Loading states and error boundaries on all async UI
- Toast notifications for upload success/failure/parsing errors
- Descriptive error messages when PDF parsing fails (e.g., unexpected format)
- Input validation error display in all forms
- Responsive layout check (desktop-first is fine, but no broken layouts on 13" screens)
- Review all Prisma queries for N+1 issues; add `include` / `select` as needed
- Set up `DATABASE_URL` + `NEXTAUTH_SECRET` in Railway; confirm production build works
- README with onboarding steps for new internal users (how to log in, how to add new users)

---

## File Tree Preview (post-scaffold)

```
sps-po-audit/
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx          ← auth guard
│   │   ├── upload/page.tsx
│   │   └── comparisons/
│   │       ├── page.tsx
│   │       └── [id]/page.tsx
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── buy-plans/route.ts
│       ├── po-uploads/route.ts
│       └── comparisons/
│           ├── route.ts
│           └── [id]/
│               ├── route.ts
│               └── export/route.ts
├── lib/
│   ├── auth.ts
│   ├── db.ts
│   ├── schemas.ts
│   ├── parsers/
│   │   ├── po-pdf.ts
│   │   └── buy-plan.ts
│   └── comparison/
│       ├── engine.ts
│       └── export.ts
├── components/
│   └── ui/                     ← shadcn/ui
├── prisma/
│   └── schema.prisma
├── __tests__/
│   ├── parsers/
│   └── comparison/
├── .env.example
├── railway.json
└── CLAUDE.md
```
