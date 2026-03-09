/**
 * Comparison engine — matches PO line items against Buy Plan rows and
 * identifies discrepancies.
 *
 * Match key:  vendorPN (from PO sub-row) + colorCode (from "Buyers Color Description")
 *             Both map to BuyPlanRow.sku + BuyPlanRow.colorCode.
 *
 * Discrepancies checked:
 *   unitCost    — difference > $0.01
 *   description — case-insensitive inequality
 *   uom         — case-insensitive inequality
 *   math        — |qty × unitCost − lineTotal| > $0.02  (PO internal check)
 *
 * Note: qty comparison is omitted because a PO covers one channel / one window
 * while the Buy Plan carries totals across all channels and windows.  The UI
 * (M6) shows both values side-by-side for visual review.
 */

import type {
  PoLineItem,
  BuyPlanRow,
  BuyPlanWindow,
  ParsedBuyPlan,
  ComparisonItem,
  Discrepancy,
} from "@/lib/schemas"

const COST_TOLERANCE = 0.01 // $0.01
const MATH_TOLERANCE = 0.02 // $0.02 covers rounding at quantity

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalised match key: vendorPN + "/" + colorCode, both lower-cased */
function matchKey(vendorPN: string, colorCode: string): string {
  return `${vendorPN.trim().toLowerCase()}/${colorCode.trim().toLowerCase()}`
}

/**
 * Parses a M/D/YYYY or MM/DD/YYYY date string into a canonical YYYY-MM-DD
 * string for reliable cross-format comparison.  Returns null on parse failure.
 */
function parseSlashDate(s: string): string | null {
  const parts = s.trim().split("/")
  if (parts.length !== 3) return null
  const [m, d, y] = parts.map(Number)
  if ([m, d, y].some(isNaN) || y < 2000) return null
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

function findDiscrepancies(
  po: PoLineItem,
  bp: BuyPlanRow,
  windows: BuyPlanWindow[]
): Discrepancy[] {
  const result: Discrepancy[] = []

  // Unit cost (within $0.01)
  if (Math.abs(po.unitCost - bp.unitCost) > COST_TOLERANCE) {
    result.push({
      field: "unitCost",
      poValue: po.unitCost,
      buyPlanValue: bp.unitCost,
    })
  }

  // Description (case-insensitive, trimmed)
  if (po.description.trim().toLowerCase() !== bp.description.trim().toLowerCase()) {
    result.push({
      field: "description",
      poValue: po.description,
      buyPlanValue: bp.description,
    })
  }

  // UOM (case-insensitive)
  if (po.uom.trim().toLowerCase() !== bp.uom.trim().toLowerCase()) {
    result.push({
      field: "uom",
      poValue: po.uom,
      buyPlanValue: bp.uom,
    })
  }

  // Math: qty × unitCost should ≈ lineTotal (PO internal consistency)
  const computed = po.qty * po.unitCost
  if (Math.abs(computed - po.lineTotal) > MATH_TOLERANCE) {
    result.push({
      field: "math",
      poValue: po.lineTotal,
      buyPlanValue: parseFloat(computed.toFixed(2)),
    })
  }

  // Outer packs: Number of Inner Containers (PO) vs Outer Pack (Buy Plan)
  if (po.outerPacks != null && bp.outerPacks != null) {
    if (po.outerPacks !== bp.outerPacks) {
      result.push({
        field: "outerPacks",
        poValue: po.outerPacks,
        buyPlanValue: bp.outerPacks,
      })
    }
  }

  // Inner packs: Eaches Per Inner Container (PO) vs per-PO Buy Plan value.
  // Prefer the per-PO map (keyed by PO number from row 1 of the Buy Plan header
  // block) over the static column-Z value, because STORE and DIGITAL channels
  // carry different pack counts.
  if (po.innerPacks != null) {
    const bpInnerPack =
      po.poNumber && bp.innerPacksByPo?.[po.poNumber] != null
        ? bp.innerPacksByPo[po.poNumber]
        : bp.innerPacks
    if (bpInnerPack != null && po.innerPacks !== bpInnerPack) {
      result.push({
        field: "innerPacks",
        poValue: po.innerPacks,
        buyPlanValue: bpInnerPack,
      })
    }
  }

  // Resale vs retail cost (both must be present to compare)
  if (po.resale != null && bp.retailCost != null) {
    if (Math.abs(po.resale - bp.retailCost) > COST_TOLERANCE) {
      result.push({
        field: "resale",
        poValue: po.resale,
        buyPlanValue: bp.retailCost,
      })
    }
  }

  // Ship date: PO ship date must match at least one Buy Plan window's ship date.
  // Only checked when the PO line carries a shipDate (propagated from the header)
  // and the Buy Plan has at least one window to compare against.
  if (po.shipDate && windows.length > 0) {
    const poNorm = parseSlashDate(po.shipDate)
    if (poNorm) {
      const match = windows.find((w) => parseSlashDate(w.shipDate) === poNorm)
      if (!match) {
        // Deduplicate window ship dates for the buyPlanValue display
        const bpDates = [...new Set(windows.map((w) => w.shipDate))].join(", ")
        result.push({
          field: "shipDate",
          poValue: po.shipDate,
          buyPlanValue: bpDates,
        })
      }
    }
  }

  return result
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compares PO line items against a parsed Buy Plan.
 *
 * Returns one ComparisonItem per unique (vendorPN, colorCode) key:
 *   - Matched items carry discrepancy details.
 *   - Unmatched PO lines (no buy plan row) are flagged with isUnmatched=true.
 *   - Buy plan rows with no PO line are also flagged with isUnmatched=true.
 */
export function runComparison(
  poLines: PoLineItem[],
  parsedBuyPlan: ParsedBuyPlan
): ComparisonItem[] {
  // Build lookup: matchKey → BuyPlanRow
  const bpMap = new Map<string, BuyPlanRow>()
  for (const row of parsedBuyPlan.rows) {
    bpMap.set(matchKey(row.sku, row.colorCode), row)
  }

  const matchedBpKeys = new Set<string>()
  const items: ComparisonItem[] = []

  // ── PO lines → match or flag unmatched ───────────────────────────────────
  for (const poLine of poLines) {
    const key = matchKey(poLine.vendorPN, poLine.colorCode)
    const bpRow = bpMap.get(key)

    if (!bpRow) {
      items.push({
        sku: poLine.vendorPN,
        poLine,
        buyPlanRow: null,
        discrepancies: [],
        isUnmatched: true,
      })
    } else {
      matchedBpKeys.add(key)
      items.push({
        sku: poLine.vendorPN,
        poLine,
        buyPlanRow: bpRow,
        discrepancies: findDiscrepancies(poLine, bpRow, parsedBuyPlan.windows),
        isUnmatched: false,
      })
    }
  }

  // ── Buy plan rows with no corresponding PO line ───────────────────────────
  for (const [key, bpRow] of bpMap) {
    if (!matchedBpKeys.has(key)) {
      items.push({
        sku: bpRow.sku,
        poLine: null,
        buyPlanRow: bpRow,
        discrepancies: [],
        isUnmatched: true,
      })
    }
  }

  return items
}
