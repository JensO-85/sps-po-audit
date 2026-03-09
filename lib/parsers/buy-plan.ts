/**
 * Parser for the Kohl's / SPS Buy Plan Excel workbook.
 *
 * Workbook structure (observed from production files, Nov 2025):
 *
 *   Sheet "MAP Receipt Dump"
 *     Rows 1–N  : Metadata / header block
 *       Row with "APR WK 4" etc. → delivery-window week labels  (cols AE+)
 *       Row below                → channel labels ("STORE" / "DIGITAL")
 *       Row with "4/20/2026-4/25/2026" → ship/in-DC date ranges
 *     Row with "Vendor Style #"  → column-header row  (col K, B, L, M, …)
 *     Rows after header row      → data rows (one per vendor-style × color)
 *       Subtotal / group-header rows have no value in the Vendor Style # column
 *
 * Strategy: discover all key rows and columns dynamically so the parser
 * survives minor layout shifts (extra header rows, different window counts).
 */

import ExcelJS from "exceljs"
import { writeFileSync } from "fs"
import { join } from "path"
import type { ParsedBuyPlan, BuyPlanRow, BuyPlanWindow } from "@/lib/schemas"

// ── Cell value helpers ────────────────────────────────────────────────────────

function cellStr(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v === null || v === undefined) return ""
  // Formula cells carry a result object
  if (typeof v === "object" && "result" in v) {
    const r = (v as { result: unknown }).result
    return r !== null && r !== undefined ? String(r).trim() : ""
  }
  if (v instanceof Date) {
    return `${v.getMonth() + 1}/${v.getDate()}/${v.getFullYear()}`
  }
  return String(v).trim()
}

function cellNum(cell: ExcelJS.Cell): number | null {
  const v = cell.value
  if (v === null || v === undefined) return null
  if (typeof v === "number") return isNaN(v) ? null : v
  if (typeof v === "object" && "result" in v) {
    const r = (v as { result: unknown }).result
    if (typeof r === "number") return isNaN(r) ? null : r
  }
  const n = parseFloat(String(v))
  return isNaN(n) ? null : n
}

// ── Internal type — window column with its sheet column index ─────────────────

interface WindowColInfo extends BuyPlanWindow {
  colIndex: number
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function parseBuyPlan(buffer: Buffer): Promise<ParsedBuyPlan> {
  const workbook = new ExcelJS.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any)

  const ws = workbook.worksheets[0]
  if (!ws) throw new Error("Buy Plan Excel has no worksheets")

  // ── 1. Find the column-header row ─────────────────────────────────────────
  //   Scan every row until we find one whose cells contain "Vendor Style #".
  let headerRowNum = -1
  ws.eachRow((row, rowNum) => {
    if (headerRowNum !== -1) return
    row.eachCell((cell) => {
      if (cellStr(cell) === "Vendor Style #") headerRowNum = rowNum
    })
  })
  if (headerRowNum === -1) {
    throw new Error(
      "Could not find 'Vendor Style #' column — is this a Buy Plan Excel?"
    )
  }

  // ── 2. Build column-index map from the header row ─────────────────────────
  const colMap: Record<string, number> = {}
  ws.getRow(headerRowNum).eachCell((cell, colNum) => {
    const label = cellStr(cell)
    if (label) colMap[label] = colNum
  })

  const vendorStyleCol = colMap["Vendor Style #"]
  const descriptionCol = colMap["Kohl's Style Description"]
  const colorCodeCol = colMap["Vendor Color"]
  const firstCostCol = colMap["First Cost"]
  const poNumberCol = colMap["PO"] ?? null

  // ── 2b. Locate the retail-cost column ────────────────────────────────────
  // The "retail" header may appear in any row of the header block (rows 1 →
  // headerRowNum), not necessarily the same row as "Vendor Style #".  Scan
  // every header-block row for a cell whose text matches "retail" (or a common
  // variant) case-insensitively.  If still not found, fall back to column D
  // (index 4), which is where the real Buy Plan workbook places it.
  const RETAIL_LABELS = new Set(["retail", "retail cost", "retail price", "aur"])
  let retailCostCol = 4  // default: column D
  for (let r = 1; r <= headerRowNum; r++) {
    ws.getRow(r).eachCell((cell, colNum) => {
      if (RETAIL_LABELS.has(cellStr(cell).toLowerCase())) {
        retailCostCol = colNum
      }
    })
  }

  // Inner Packs column — scan header block for matching label; fall back to
  // column Z (index 26) which is where the real Buy Plan places this field.
  const INNER_PACKS_LABELS = new Set(["inner packs", "inner pack", "eaches per inner", "inner qty"])
  let innerPacksCol = 26  // default: column Z
  for (let r = 1; r <= headerRowNum; r++) {
    ws.getRow(r).eachCell((cell, colNum) => {
      if (INNER_PACKS_LABELS.has(cellStr(cell).toLowerCase())) {
        innerPacksCol = colNum
      }
    })
  }

  // Outer Packs column — scan header block for matching label.
  const OUTER_PACKS_LABELS = new Set(["outer pack", "outer packs", "number of inner containers", "outer qty"])
  let outerPacksCol: number | null = null
  for (let r = 1; r <= headerRowNum; r++) {
    ws.getRow(r).eachCell((cell, colNum) => {
      if (OUTER_PACKS_LABELS.has(cellStr(cell).toLowerCase())) {
        outerPacksCol = colNum
      }
    })
  }

  if (!vendorStyleCol || !firstCostCol) {
    throw new Error(
      "Buy Plan is missing required columns: 'Vendor Style #' or 'First Cost'"
    )
  }

  // ── 3. Discover delivery-window columns ───────────────────────────────────
  //   Find the first row before the header that contains a week-label pattern.
  const WEEK_RE =
    /\b(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+WK\s+\d/i
  const DATE_RANGE_RE =
    /(\d{1,2}\/\d{1,2}\/\d{4})-(\d{1,2}\/\d{1,2}\/\d{4})/

  let weekLabelRowNum = -1
  for (let r = 1; r < headerRowNum; r++) {
    ws.getRow(r).eachCell((cell) => {
      if (WEEK_RE.test(cellStr(cell))) weekLabelRowNum = r
    })
    if (weekLabelRowNum !== -1) break
  }

  // Channel row immediately follows the week-label row
  const channelRowNum = weekLabelRowNum !== -1 ? weekLabelRowNum + 1 : -1

  // Date-range row: first row after weekLabelRowNum that contains "MM/DD/YYYY-MM/DD/YYYY"
  let dateRowNum = -1
  if (weekLabelRowNum !== -1) {
    for (let r = weekLabelRowNum + 1; r < headerRowNum; r++) {
      let found = false
      ws.getRow(r).eachCell((cell) => {
        if (DATE_RANGE_RE.test(cellStr(cell))) found = true
      })
      if (found) {
        dateRowNum = r
        break
      }
    }
  }

  // Build per-column window descriptors
  const windowColInfos: WindowColInfo[] = []
  if (weekLabelRowNum !== -1) {
    ws.getRow(weekLabelRowNum).eachCell((cell, colNum) => {
      const weekLabel = cellStr(cell)
      if (!WEEK_RE.test(weekLabel)) return

      const channel =
        channelRowNum !== -1
          ? cellStr(ws.getRow(channelRowNum).getCell(colNum))
          : ""

      let shipDate = ""
      let inDcDate = ""
      if (dateRowNum !== -1) {
        const dateStr = cellStr(ws.getRow(dateRowNum).getCell(colNum))
        const dm = DATE_RANGE_RE.exec(dateStr)
        if (dm) {
          shipDate = dm[1]
          inDcDate = dm[2]
        }
      }

      const colKey = `${weekLabel}/${channel}`
      windowColInfos.push({
        weekLabel,
        channel,
        shipDate,
        inDcDate,
        colKey,
        colIndex: colNum,
      })
    })
  }

  // Public window list (strip internal colIndex)
  const windows: BuyPlanWindow[] = windowColInfos.map(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ({ colIndex: _ci, ...rest }) => rest
  )

  // ── 3b. Per-PO inner pack from the window header block ────────────────────
  // Row 1 has a PO number in each window column position.  The header block
  // also contains a row where every window column says "Inner Pack" (label),
  // followed immediately by a row with the actual numeric values.
  // These values are per-PO (STORE and DIGITAL channels carry different counts).

  // Step 1: read PO numbers from row 1 aligned to window column positions.
  const poNumByCol: Record<number, string> = {}
  if (windowColInfos.length > 0) {
    const row1 = ws.getRow(1)
    for (const wi of windowColInfos) {
      const v = cellStr(row1.getCell(wi.colIndex))
      if (/^\d{7,}$/.test(v)) poNumByCol[wi.colIndex] = v
    }
  }

  // Step 2: find the first header-block row where window columns all say "Inner Pack".
  let innerPackLabelRowNum = -1
  for (let r = 1; r < headerRowNum; r++) {
    let count = 0
    for (const wi of windowColInfos) {
      const v = cellStr(ws.getRow(r).getCell(wi.colIndex)).toLowerCase().trim()
      if (v === "inner pack" || v === "inner packs") count++
    }
    if (count > 0) { innerPackLabelRowNum = r; break }
  }

  // Step 3: read per-PO inner pack values from the row after the label row.
  const innerPacksByPo: Record<string, number> = {}
  if (innerPackLabelRowNum !== -1) {
    const valRow = ws.getRow(innerPackLabelRowNum + 1)
    for (const wi of windowColInfos) {
      const poNum = poNumByCol[wi.colIndex]
      if (poNum) {
        const v = cellNum(valRow.getCell(wi.colIndex))
        if (v !== null) innerPacksByPo[poNum] = v
      }
    }
  }

  // ── 4. Parse data rows ────────────────────────────────────────────────────
  const rows: BuyPlanRow[] = []

  ws.eachRow((row, rowNum) => {
    if (rowNum <= headerRowNum) return

    const sku = cellStr(row.getCell(vendorStyleCol))
    if (!sku) return // group-header or blank row — no vendor style #

    const unitCost = cellNum(row.getCell(firstCostCol))
    if (unitCost === null) return // subtotal row — no numeric first cost

    const colorCode = colorCodeCol ? cellStr(row.getCell(colorCodeCol)) : ""
    const description = descriptionCol
      ? cellStr(row.getCell(descriptionCol))
      : ""
    const retailCostRaw = retailCostCol ? cellNum(row.getCell(retailCostCol)) : null
    const retailCost = retailCostRaw !== null ? retailCostRaw : undefined
    const innerPacksRaw = cellNum(row.getCell(innerPacksCol))
    const innerPacks = innerPacksRaw !== null ? innerPacksRaw : undefined
    const outerPacksRaw = outerPacksCol ? cellNum(row.getCell(outerPacksCol)) : null
    const outerPacks = outerPacksRaw !== null ? outerPacksRaw : undefined
    const poNumber = poNumberCol ? cellStr(row.getCell(poNumberCol)) || undefined : undefined

    // Collect qty for each window column
    const windowQtys: Record<string, number> = {}
    for (const wi of windowColInfos) {
      const q = cellNum(row.getCell(wi.colIndex))
      if (q !== null && q > 0) windowQtys[wi.colKey] = q
    }
    const totalQty = Object.values(windowQtys).reduce((s, q) => s + q, 0)

    rows.push({
      sku,
      colorCode,
      description,
      unitCost,
      uom: "Each",
      ...(retailCost !== undefined ? { retailCost } : {}),
      ...(innerPacks !== undefined ? { innerPacks } : {}),
      ...(Object.keys(innerPacksByPo).length > 0 ? { innerPacksByPo } : {}),
      ...(outerPacks !== undefined ? { outerPacks } : {}),
      ...(poNumber ? { poNumber } : {}),
      windowQtys,
      totalQty,
    })
  })

  if (rows.length === 0) {
    throw new Error("No line items found — unexpected Buy Plan format")
  }

  // TEMPORARY — write diagnostics so we can verify column detection
  try {
    // Dump non-empty cells from rows 1–15 to reveal the header-block structure
    const headerCells: Array<{ row: number; col: number; value: string }> = []
    for (let r = 1; r <= Math.min(15, headerRowNum); r++) {
      ws.getRow(r).eachCell((cell, colNum) => {
        const v = cellStr(cell)
        if (v) headerCells.push({ row: r, col: colNum, value: v })
      })
    }

    const debug = {
      headerRowNum,
      colMap,
      retailCostCol,
      innerPacksCol,
      outerPacksCol,
      headerCells,
      innerPacksByPo,
      firstRows: rows.slice(0, 3).map((r) => ({
        sku: r.sku,
        colorCode: r.colorCode,
        unitCost: r.unitCost,
        retailCost: r.retailCost,
        innerPacks: r.innerPacks,
        innerPacksByPo: r.innerPacksByPo,
        outerPacks: r.outerPacks,
      })),
    }
    writeFileSync(
      join(process.cwd(), "bp-debug.json"),
      JSON.stringify(debug, null, 2),
      "utf-8"
    )
  } catch {
    // ignore — read-only FS or permission error
  }

  return { windows, rows }
}
