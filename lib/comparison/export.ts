import ExcelJS from "exceljs"

// ── Types (mirror what's stored in DB JSON columns) ───────────────────────────

type PoData = {
  lineNumber?: number
  poNumber?: string
  vendorPN?: string
  colorCode?: string
  description?: string
  qty?: number
  unitCost?: number
  lineTotal?: number
  uom?: string
  resale?: number
  innerPacks?: number
  outerPacks?: number
  shipDate?: string
  inDcDate?: string
}

type BpData = {
  colorCode?: string
  description?: string
  unitCost?: number
  uom?: string
  retailCost?: number
  innerPacks?: number
  innerPacksByPo?: Record<string, number>
  outerPacks?: number
  poNumber?: string
  totalQty?: number
  windowQtys?: Record<string, number>
}

type Discrepancy = { field: string; poValue: unknown; buyPlanValue: unknown }

export type ExportItem = {
  sku: string
  isUnmatched: boolean
  poData: PoData | null
  buyPlanData: BpData | null
  discrepancies: Discrepancy[]
}

export type ExportMeta = {
  buyPlanFilename: string
  poFilenames: string[]
  createdAt: Date
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const RED_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFEE2E2" }, // red-100
}
const AMBER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFEF3C7" }, // amber-100
}
const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF3F4F6" }, // gray-100
}

function redText(has: boolean): Partial<ExcelJS.Style> {
  return has ? { font: { color: { argb: "FFB91C1C" }, bold: true } } : {}
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function generateComparisonExcel(
  meta: ExportMeta,
  items: ExportItem[]
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "SPS PO Audit"
  wb.created = new Date()

  const ws = wb.addWorksheet("Comparison Report")

  // ── Meta block ────────────────────────────────────────────────────────────
  ws.addRow(["SPS PO Audit — Comparison Report"])
  ws.getRow(1).font = { bold: true, size: 13 }

  ws.addRow(["Buy Plan:", meta.buyPlanFilename])
  ws.addRow(["POs:", meta.poFilenames.join(", ")])
  ws.addRow([
    "Run:",
    meta.createdAt.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }),
  ])

  const discrepancyCount = items.filter((i) => i.discrepancies.length > 0).length
  const unmatchedCount = items.filter((i) => i.isUnmatched).length
  ws.addRow([
    "Summary:",
    `${items.length} lines · ${discrepancyCount} discrepanc${discrepancyCount !== 1 ? "ies" : "y"} · ${unmatchedCount} unmatched`,
  ])

  ws.addRow([]) // blank separator

  // ── Column headers ────────────────────────────────────────────────────────
  const HEADERS = [
    "PO #",
    "Vendor PN",
    "Color",
    "Description (PO)",
    "Description (BP)",
    "PO Cost",
    "BP Cost",
    "PO Resale",
    "BP Retail",
    "Inner Packs (PO)",
    "Inner Packs (BP)",
    "Outer Packs (PO)",
    "Outer Packs (BP)",
    "PO Qty",
    "UOM (PO)",
    "UOM (BP)",
    "Math",
    "Ship Date (PO)",
    "Ship Date (BP)",
    "Status",
  ]

  const headerRow = ws.addRow(HEADERS)
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL
    cell.font = { bold: true, size: 10 }
    cell.border = { bottom: { style: "thin", color: { argb: "FFD1D5DB" } } }
  })

  // Column widths
  ws.columns = [
    { width: 8 },  // PO #
    { width: 16 }, // Vendor PN
    { width: 8 },  // Color
    { width: 32 }, // Description PO
    { width: 32 }, // Description BP
    { width: 10 }, // PO Cost        (col 6)
    { width: 10 }, // BP Cost        (col 7)
    { width: 10 }, // PO Resale      (col 8)
    { width: 10 }, // BP Retail      (col 9)
    { width: 10 }, // Inner Packs PO (col 10)
    { width: 10 }, // Inner Packs BP (col 11)
    { width: 10 }, // Outer Packs PO (col 12)
    { width: 10 }, // Outer Packs BP (col 13)
    { width: 8 },  // PO Qty         (col 14)
    { width: 10 }, // UOM PO         (col 15)
    { width: 10 }, // UOM BP         (col 16)
    { width: 7 },  // Math           (col 17)
    { width: 14 }, // Ship Date PO   (col 18)
    { width: 22 }, // Ship Date BP   (col 19)
    { width: 14 }, // Status         (col 20)
  ]

  // ── Data rows ─────────────────────────────────────────────────────────────
  for (const item of items) {
    const po = item.poData
    const bp = item.buyPlanData
    const disc = item.discrepancies
    const has = (field: string) => disc.some((d) => d.field === field)

    const mathOk = !has("math")
    const color = po?.colorCode ?? bp?.colorCode ?? ""

    let status: string
    if (item.isUnmatched) {
      status = "Unmatched"
    } else if (disc.length === 0) {
      status = "OK"
    } else {
      status = `${disc.length} issue${disc.length > 1 ? "s" : ""}`
    }

    const shipDateDisc = disc.find((d) => d.field === "shipDate")
    const shipDateBp = shipDateDisc
      ? String(shipDateDisc.buyPlanValue ?? "")
      : ""

    const row = ws.addRow([
      po?.poNumber ?? bp?.poNumber ?? "",
      item.sku,
      color,
      po?.description ?? "",
      bp?.description ?? "",
      po?.unitCost != null ? po.unitCost : "",        // col 6
      bp?.unitCost != null ? bp.unitCost : "",        // col 7
      po?.resale != null ? po.resale : "",             // col 8
      bp?.retailCost != null ? bp.retailCost : "",    // col 9
      po?.innerPacks ?? "",                            // col 10
      (po?.poNumber && bp?.innerPacksByPo?.[po.poNumber]) ?? bp?.innerPacks ?? "", // col 11
      po?.outerPacks ?? "",                            // col 12
      bp?.outerPacks ?? "",                            // col 13
      po?.qty ?? "",                                   // col 14
      po?.uom ?? "",                                   // col 15
      bp?.uom ?? "",                                   // col 16
      mathOk ? "✓" : "✗",                             // col 17
      po?.shipDate ?? "",                              // col 18
      shipDateBp,                                      // col 19
      status,                                          // col 20
    ])

    row.font = { size: 10 }

    // Row background
    const fill = item.isUnmatched ? AMBER_FILL : disc.length > 0 ? RED_FILL : undefined
    if (fill) {
      row.eachCell((cell) => {
        cell.fill = fill
      })
    }

    // Highlight specific discrepant cells
    if (has("unitCost")) {
      Object.assign(row.getCell(6).style, redText(true))
      Object.assign(row.getCell(7).style, redText(true))
    }
    if (has("description")) {
      Object.assign(row.getCell(4).style, redText(true))
      Object.assign(row.getCell(5).style, redText(true))
    }
    if (has("resale")) {
      Object.assign(row.getCell(8).style, redText(true))
      Object.assign(row.getCell(9).style, redText(true))
    }
    if (has("innerPacks")) {
      Object.assign(row.getCell(10).style, redText(true))
      Object.assign(row.getCell(11).style, redText(true))
    }
    if (has("outerPacks")) {
      Object.assign(row.getCell(12).style, redText(true))
      Object.assign(row.getCell(13).style, redText(true))
    }
    if (has("uom")) {
      Object.assign(row.getCell(15).style, redText(true))
      Object.assign(row.getCell(16).style, redText(true))
    }
    if (!mathOk) {
      Object.assign(row.getCell(17).style, { font: { color: { argb: "FFB91C1C" }, bold: true } })
    }
    if (shipDateDisc) {
      Object.assign(row.getCell(18).style, redText(true))
      Object.assign(row.getCell(19).style, redText(true))
    }

    // Format cost/price cells as currency
    row.getCell(6).numFmt = "$#,##0.00"
    row.getCell(7).numFmt = "$#,##0.00"
    row.getCell(8).numFmt = "$#,##0.00"
    row.getCell(9).numFmt = "$#,##0.00"
  }

  // ── Freeze header rows ────────────────────────────────────────────────────
  ws.views = [{ state: "frozen", ySplit: 7 }] // freeze above data rows

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
