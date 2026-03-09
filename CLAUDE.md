# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

Internal web app for comparing purchase order PDFs received from SPS Commerce against a Buy Plan Excel file. It parses PO PDFs into structured line items, matches them by SKU to the Buy Plan, highlights discrepancies (cost, description, quantity, UOM/pack, line-total math), and exports a report to Excel.

Internal users only — no public signup. Credentials-based auth (email + bcrypt password) via NextAuth.js.

## Tech Stack

- **Framework**: Next.js (App Router) with TypeScript
- **Database**: PostgreSQL via Prisma ORM
- **Auth**: NextAuth.js v5 (Credentials provider)
- **Styling**: Tailwind CSS + shadcn/ui components
- **PDF parsing**: `pdf-parse` (text extraction from SPS PO PDFs)
- **Excel I/O**: `exceljs` (read Buy Plan, write discrepancy report)
- **Validation**: Zod (API inputs and parsed data shapes)
- **Deployment target**: Railway (Next.js + managed PostgreSQL)

## Development Commands

```bash
# Install dependencies
npm install

# Run DB migrations (requires DATABASE_URL in .env)
npx prisma migrate dev

# Generate Prisma client after schema changes
npx prisma generate

# Start dev server (http://localhost:3000)
npm run dev

# Type-check without emitting
npm run typecheck

# Lint
npm run lint

# Build for production
npm run build

# Open Prisma Studio (DB browser)
npx prisma studio
```

## Environment Variables

Required in `.env` (copy from `.env.example`):

```
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
```

## Architecture Overview

```
/app
  /api            — Next.js route handlers (REST-style API)
    /auth         — NextAuth handler
    /buy-plans    — Upload + list Buy Plan Excels
    /po-uploads   — Upload + list PO PDFs
    /comparisons  — Run comparison, get results, export Excel
  /(auth)         — Login page (unauthenticated layout)
  /(dashboard)    — Protected pages (authenticated layout)
    /upload       — Upload UI for PDFs + Buy Plan
    /comparisons  — List past comparisons
    /comparisons/[id] — Discrepancy report view

/lib
  /parsers
    po-pdf.ts     — Extracts structured line items from SPS PO PDFs
    buy-plan.ts   — Reads Buy Plan Excel into typed records
  /comparison
    engine.ts     — Matches PO lines to Buy Plan by SKU, detects discrepancies
    export.ts     — Generates Excel discrepancy report via exceljs
  /db.ts          — Prisma client singleton
  /auth.ts        — NextAuth config

/prisma
  schema.prisma   — DB schema (users, buy_plans, po_uploads, comparisons, comparison_items)
```

### Data Flow

1. User uploads one or more SPS PO PDFs → `/api/po-uploads` → stored, parsed by `lib/parsers/po-pdf.ts`, structured JSON saved to DB.
2. User uploads or selects a Buy Plan Excel → `/api/buy-plans` → parsed by `lib/parsers/buy-plan.ts`, stored as JSONB.
3. User triggers comparison → `/api/comparisons` → `lib/comparison/engine.ts` joins PO lines to Buy Plan rows by SKU, writes per-item discrepancy records to DB.
4. UI displays comparison results; user can export via `/api/comparisons/[id]/export` → `lib/comparison/export.ts`.

### Key Data Shapes (Zod schemas in `/lib/schemas.ts`)

```ts
PoLineItem    { sku, description, qty, unitCost, lineTotal, uom, shipDate, inDcDate }
BuyPlanRow    { sku, description, qty, unitCost, uom, shipDate, inDcDate }
Discrepancy   { field, poValue, buyPlanValue }
ComparisonItem { sku, poLine, buyPlanRow, discrepancies: Discrepancy[] }
```

### Discrepancy Detection Rules

- **unit cost**: values differ by more than $0.01 (float rounding tolerance)
- **description**: case-insensitive string mismatch
- **quantity**: numeric mismatch
- **UOM/pack**: case-insensitive string mismatch
- **math**: `abs(qty × unitCost − lineTotal) > 0.01`
- **unmatched SKU**: PO line has no corresponding Buy Plan row (flagged separately)

## Coding Conventions

- All API route handlers live in `app/api/` as `route.ts` files using Next.js Route Handlers (`NextRequest`/`NextResponse`).
- Validate all API inputs with Zod before touching the DB.
- Prisma queries stay in server components, route handlers, and Server Actions — never in client components.
- Use `lib/db.ts` singleton for the Prisma client (avoid multiple instances in dev).
- Parser functions (`po-pdf.ts`, `buy-plan.ts`) are pure functions: take raw buffer, return typed array or throw with a descriptive error.
- The comparison engine is also a pure function: takes arrays of `PoLineItem` and `BuyPlanRow`, returns `ComparisonItem[]`.
- Keep PDF-parsing logic isolated from the comparison logic so parsers can be tested independently.
- shadcn/ui components live in `components/ui/`; app-specific composed components live in `components/`.
