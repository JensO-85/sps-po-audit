import ExcelJS from "exceljs"
import { parseBuyPlan } from "@/lib/parsers/buy-plan"
import type { ParsedBuyPlan } from "@/lib/schemas"

// ---------------------------------------------------------------------------
// Fixture builder — creates a minimal in-memory Buy Plan workbook that mirrors
// the real file structure (MAP Receipt Dump sheet, window header rows, data rows).
//
// Layout used in the fixture:
//   Row 3  : Week labels in cols 31-34 (AE-AH) — 2 windows × 2 channels
//   Row 4  : Channel labels ("STORE" / "DIGITAL")
//   Row 7  : Date ranges ("4/20/2026-4/25/2026")
//   Row 10 : Column-header row ("Vendor Style #", "First Cost", …)
//   Row 11 : Data row — HANGING TOILETRY ORGANIZER, BL, $4.79
//   Row 12 : Data row — MESH SHOWER CADDY, GRY, $2.96
// ---------------------------------------------------------------------------

async function buildFixtureBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("MAP Receipt Dump")

  // ── Window header block (cols 31-34 = AE-AH) ─────────────────────────────
  // Row 1: PO numbers per window column (mirrors real Buy Plan structure)
  ws.getCell(1, 31).value = "16043871"  // APR WK 4 STORE
  ws.getCell(1, 32).value = "16043880"  // APR WK 4 DIGITAL
  ws.getCell(1, 33).value = "16043881"  // MAY WK 4 STORE
  ws.getCell(1, 34).value = "16043883"  // MAY WK 4 DIGITAL

  // Row 3: week labels
  ws.getCell(3, 31).value = "APR WK 4"
  ws.getCell(3, 32).value = "APR WK 4"
  ws.getCell(3, 33).value = "MAY WK 4"
  ws.getCell(3, 34).value = "MAY WK 4"

  // Row 4: channel
  ws.getCell(4, 31).value = "STORE"
  ws.getCell(4, 32).value = "DIGITAL"
  ws.getCell(4, 33).value = "STORE"
  ws.getCell(4, 34).value = "DIGITAL"

  // Row 7: ship window date ranges
  ws.getCell(7, 31).value = "4/20/2026-4/25/2026"
  ws.getCell(7, 32).value = "4/20/2026-4/25/2026"
  ws.getCell(7, 33).value = "5/18/2026-5/23/2026"
  ws.getCell(7, 34).value = "5/18/2026-5/23/2026"

  // Row 8: "Inner Pack" labels in every window column
  ws.getCell(8, 31).value = "Inner Pack"
  ws.getCell(8, 32).value = "Inner Pack"
  ws.getCell(8, 33).value = "Inner Pack"
  ws.getCell(8, 34).value = "Inner Pack"

  // Row 9: per-PO inner pack values (STORE=2, DIGITAL=1)
  ws.getCell(9, 31).value = 2  // APR WK 4 STORE (PO 16043871)
  ws.getCell(9, 32).value = 1  // APR WK 4 DIGITAL (PO 16043880)
  ws.getCell(9, 33).value = 2  // MAY WK 4 STORE (PO 16043881)
  ws.getCell(9, 34).value = 1  // MAY WK 4 DIGITAL (PO 16043883)

  // ── Column headers (row 10) ───────────────────────────────────────────────
  ws.getCell(10, 1).value = "PO"
  ws.getCell(10, 2).value = "First Cost"
  ws.getCell(10, 3).value = "Retail Cost"
  ws.getCell(10, 11).value = "Vendor Style #"
  ws.getCell(10, 12).value = "Kohl's Style Description"
  ws.getCell(10, 13).value = "Vendor Color"
  ws.getCell(10, 26).value = "Inner Packs"  // col Z (static fallback)
  ws.getCell(10, 27).value = "Outer Pack"   // col AA

  // ── Data row 1: HANGING TOILETRY ORGANIZER, BL ───────────────────────────
  ws.getCell(11, 1).value = "16043880"
  ws.getCell(11, 2).value = 4.79
  ws.getCell(11, 3).value = 19.99
  ws.getCell(11, 26).value = 6  // col Z: static fallback (not the per-PO value)
  ws.getCell(11, 27).value = 12 // col AA: 12 inner packs per outer carton
  ws.getCell(11, 11).value = "6UBOMBSOR02"
  ws.getCell(11, 12).value = "HANGING TOILETRY ORGANIZER"
  ws.getCell(11, 13).value = "BL"
  ws.getCell(11, 31).value = 2310 // APR WK 4 STORE
  ws.getCell(11, 32).value = 336  // APR WK 4 DIGITAL
  ws.getCell(11, 33).value = 630  // MAY WK 4 STORE
  ws.getCell(11, 34).value = 360  // MAY WK 4 DIGITAL

  // ── Data row 2: MESH SHOWER CADDY, GRY (no PO column value — tests optional) ─
  ws.getCell(12, 2).value = 2.96
  ws.getCell(12, 11).value = "6UBOMBSMC01"
  ws.getCell(12, 12).value = "MESH SHOWER CADDY"
  ws.getCell(12, 13).value = "GRY"
  ws.getCell(12, 31).value = 3468 // APR WK 4 STORE
  ws.getCell(12, 32).value = 264  // APR WK 4 DIGITAL
  ws.getCell(12, 33).value = 828  // MAY WK 4 STORE
  ws.getCell(12, 34).value = 468  // MAY WK 4 DIGITAL

  const arrayBuffer = await wb.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

// ---------------------------------------------------------------------------

let result: ParsedBuyPlan

beforeAll(async () => {
  result = await parseBuyPlan(await buildFixtureBuffer())
})

// ── Windows ──────────────────────────────────────────────────────────────────

describe("parseBuyPlan — windows", () => {
  test("finds 4 windows (2 week-labels × 2 channels)", () => {
    expect(result.windows).toHaveLength(4)
  })

  test("window 0 is APR WK 4/STORE with correct dates", () => {
    const w = result.windows[0]
    expect(w.weekLabel).toBe("APR WK 4")
    expect(w.channel).toBe("STORE")
    expect(w.shipDate).toBe("4/20/2026")
    expect(w.inDcDate).toBe("4/25/2026")
    expect(w.colKey).toBe("APR WK 4/STORE")
  })

  test("window 1 is APR WK 4/DIGITAL", () => {
    expect(result.windows[1].colKey).toBe("APR WK 4/DIGITAL")
  })

  test("window 2 is MAY WK 4/STORE with correct dates", () => {
    const w = result.windows[2]
    expect(w.weekLabel).toBe("MAY WK 4")
    expect(w.shipDate).toBe("5/18/2026")
    expect(w.inDcDate).toBe("5/23/2026")
  })
})

// ── Rows ──────────────────────────────────────────────────────────────────────

describe("parseBuyPlan — rows", () => {
  test("finds 2 data rows", () => {
    expect(result.rows).toHaveLength(2)
  })

  describe("row 0 — HANGING TOILETRY ORGANIZER, BL", () => {
    const row = () => result.rows[0]

    test("sku (Vendor Style #)", () => expect(row().sku).toBe("6UBOMBSOR02"))
    test("colorCode", () => expect(row().colorCode).toBe("BL"))
    test("description", () =>
      expect(row().description).toBe("HANGING TOILETRY ORGANIZER"))
    test("unitCost", () => expect(row().unitCost).toBe(4.79))
    test("uom", () => expect(row().uom).toBe("Each"))

    test("poNumber extracted from PO column", () =>
      expect(row().poNumber).toBe("16043880"))
    test("retailCost extracted from Retail Cost column", () =>
      expect(row().retailCost).toBe(19.99))
    test("innerPacks (static col Z fallback)", () =>
      expect(row().innerPacks).toBe(6))
    test("innerPacksByPo has per-PO values from row 1 + Inner Pack header rows", () => {
      expect(row().innerPacksByPo?.["16043871"]).toBe(2) // APR WK 4 STORE
      expect(row().innerPacksByPo?.["16043880"]).toBe(1) // APR WK 4 DIGITAL
      expect(row().innerPacksByPo?.["16043881"]).toBe(2) // MAY WK 4 STORE
      expect(row().innerPacksByPo?.["16043883"]).toBe(1) // MAY WK 4 DIGITAL
    })
    test("outerPacks extracted from Outer Pack column", () =>
      expect(row().outerPacks).toBe(12))

    test("APR WK 4/STORE qty = 2310", () =>
      expect(row().windowQtys["APR WK 4/STORE"]).toBe(2310))
    test("APR WK 4/DIGITAL qty = 336", () =>
      expect(row().windowQtys["APR WK 4/DIGITAL"]).toBe(336))
    test("MAY WK 4/STORE qty = 630", () =>
      expect(row().windowQtys["MAY WK 4/STORE"]).toBe(630))
    test("MAY WK 4/DIGITAL qty = 360", () =>
      expect(row().windowQtys["MAY WK 4/DIGITAL"]).toBe(360))

    test("totalQty = 2310+336+630+360 = 3636", () =>
      expect(row().totalQty).toBe(3636))
  })

  describe("row 1 — MESH SHOWER CADDY, GRY", () => {
    const row = () => result.rows[1]

    test("sku", () => expect(row().sku).toBe("6UBOMBSMC01"))
    test("colorCode", () => expect(row().colorCode).toBe("GRY"))
    test("poNumber is undefined when PO column is blank", () =>
      expect(row().poNumber).toBeUndefined())
    test("retailCost is undefined when Retail Cost column is blank", () =>
      expect(row().retailCost).toBeUndefined())
    test("innerPacks is undefined when col Z is blank", () =>
      expect(row().innerPacks).toBeUndefined())
    test("outerPacks is undefined when Outer Pack column is blank", () =>
      expect(row().outerPacks).toBeUndefined())
    test("unitCost", () => expect(row().unitCost).toBe(2.96))
    test("APR WK 4/DIGITAL qty = 264", () =>
      expect(row().windowQtys["APR WK 4/DIGITAL"]).toBe(264))
    test("totalQty = 3468+264+828+468 = 5028", () =>
      expect(row().totalQty).toBe(5028))
  })
})

// ── Retail cost column discovery ──────────────────────────────────────────────
// The real Buy Plan has "retail" in a metadata row above the "Vendor Style #"
// row.  The parser must scan the entire header block, not just the header row.

describe("parseBuyPlan — retail cost column discovery", () => {
  test("finds 'retail' label in a row above the Vendor Style # row", async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet("Sheet1")
    // Row 1: metadata — "retail" label is in col 4 (D), above the header row
    ws.getCell(1, 4).value = "retail"
    // Row 2: column-header row with "Vendor Style #"
    ws.getCell(2, 2).value = "First Cost"
    ws.getCell(2, 11).value = "Vendor Style #"
    ws.getCell(2, 12).value = "Kohl's Style Description"
    ws.getCell(2, 13).value = "Vendor Color"
    // Row 3: data — retail cost value in col D (4)
    ws.getCell(3, 2).value = 4.79
    ws.getCell(3, 4).value = 19.99
    ws.getCell(3, 11).value = "6UBOMBSOR02"
    ws.getCell(3, 12).value = "HANGING TOILETRY ORGANIZER"
    ws.getCell(3, 13).value = "BL"
    const buf = Buffer.from(await wb.xlsx.writeBuffer())
    const r = await parseBuyPlan(buf)
    expect(r.rows[0].retailCost).toBe(19.99)
  })

  test("falls back to column D (4) when no retail label exists anywhere", async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet("Sheet1")
    ws.getCell(1, 2).value = "First Cost"
    ws.getCell(1, 11).value = "Vendor Style #"
    ws.getCell(1, 12).value = "Kohl's Style Description"
    ws.getCell(1, 13).value = "Vendor Color"
    ws.getCell(2, 2).value = 4.79
    ws.getCell(2, 4).value = 19.99
    ws.getCell(2, 11).value = "6UBOMBSOR02"
    ws.getCell(2, 12).value = "HANGING TOILETRY ORGANIZER"
    ws.getCell(2, 13).value = "BL"
    const buf = Buffer.from(await wb.xlsx.writeBuffer())
    const r = await parseBuyPlan(buf)
    expect(r.rows[0].retailCost).toBe(19.99)
  })
})

// ── Error cases ───────────────────────────────────────────────────────────────

describe("parseBuyPlan — error cases", () => {
  test("throws when Vendor Style # header is absent", async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet("Sheet1").getCell(1, 1).value = "Not a buy plan"
    const buf = Buffer.from(await wb.xlsx.writeBuffer())
    await expect(parseBuyPlan(buf)).rejects.toThrow("Vendor Style #")
  })

  test("throws when no data rows are found", async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet("Sheet1")
    // Header row only, no data
    ws.getCell(1, 2).value = "First Cost"
    ws.getCell(1, 11).value = "Vendor Style #"
    const buf = Buffer.from(await wb.xlsx.writeBuffer())
    await expect(parseBuyPlan(buf)).rejects.toThrow("No line items found")
  })
})
