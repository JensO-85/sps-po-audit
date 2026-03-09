import { runComparison } from "@/lib/comparison/engine"
import type { PoLineItem, BuyPlanRow, ParsedBuyPlan } from "@/lib/schemas"

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makePo(overrides: Partial<PoLineItem> = {}): PoLineItem {
  return {
    lineNumber: 1,
    sku: "1155056",
    vendorPN: "6UBOMBSOR02",
    colorCode: "BL",
    description: "HANGING TOILETRY ORGANIZER",
    qty: 336,
    unitCost: 4.79,
    lineTotal: 1609.44,
    uom: "Each",
    upc: "400185842493",
    ...overrides,
  }
}

function makeBp(overrides: Partial<BuyPlanRow> = {}): BuyPlanRow {
  return {
    sku: "6UBOMBSOR02",
    colorCode: "BL",
    description: "HANGING TOILETRY ORGANIZER",
    unitCost: 4.79,
    uom: "Each",
    windowQtys: { "APR WK 4/STORE": 2310, "APR WK 4/DIGITAL": 336 },
    totalQty: 2646,
    ...overrides,
  }
}

function makePlan(rows: BuyPlanRow[]): ParsedBuyPlan {
  return {
    windows: [
      {
        weekLabel: "APR WK 4",
        channel: "STORE",
        shipDate: "4/20/2026",
        inDcDate: "4/25/2026",
        colKey: "APR WK 4/STORE",
      },
      {
        weekLabel: "APR WK 4",
        channel: "DIGITAL",
        shipDate: "4/20/2026",
        inDcDate: "4/25/2026",
        colKey: "APR WK 4/DIGITAL",
      },
    ],
    rows,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runComparison — perfect match", () => {
  const items = runComparison([makePo()], makePlan([makeBp()]))

  test("returns one item", () => expect(items).toHaveLength(1))
  test("isUnmatched = false", () => expect(items[0].isUnmatched).toBe(false))
  test("no discrepancies", () => expect(items[0].discrepancies).toHaveLength(0))
  test("sku = vendorPN", () => expect(items[0].sku).toBe("6UBOMBSOR02"))
})

describe("runComparison — unit cost discrepancy", () => {
  const items = runComparison(
    // lineTotal kept consistent with new unitCost so math doesn't also fire
    [makePo({ unitCost: 4.89, lineTotal: parseFloat((336 * 4.89).toFixed(2)) })],
    makePlan([makeBp({ unitCost: 4.79 })])
  )

  test("flags unitCost discrepancy", () => {
    const d = items[0].discrepancies
    expect(d).toHaveLength(1)
    expect(d[0].field).toBe("unitCost")
    expect(d[0].poValue).toBe(4.89)
    expect(d[0].buyPlanValue).toBe(4.79)
  })

  test("cost within $0.01 is NOT a discrepancy", () => {
    const items2 = runComparison(
      [makePo({ unitCost: 4.795 })],
      makePlan([makeBp({ unitCost: 4.79 })])
    )
    expect(items2[0].discrepancies.find((d) => d.field === "unitCost")).toBeUndefined()
  })
})

describe("runComparison — description discrepancy", () => {
  test("flags when descriptions differ (case-insensitive check)", () => {
    const items = runComparison(
      [makePo({ description: "HANGING TOILETRY ORGANIZE" })], // truncated
      makePlan([makeBp({ description: "HANGING TOILETRY ORGANIZER" })])
    )
    const d = items[0].discrepancies.find((x) => x.field === "description")
    expect(d).toBeDefined()
    expect(d!.poValue).toBe("HANGING TOILETRY ORGANIZE")
  })

  test("case difference alone is NOT a discrepancy", () => {
    const items = runComparison(
      [makePo({ description: "hanging toiletry organizer" })],
      makePlan([makeBp({ description: "HANGING TOILETRY ORGANIZER" })])
    )
    expect(items[0].discrepancies.find((d) => d.field === "description")).toBeUndefined()
  })
})

describe("runComparison — UOM discrepancy", () => {
  test("flags when UOM differs", () => {
    const items = runComparison(
      [makePo({ uom: "Case" })],
      makePlan([makeBp({ uom: "Each" })])
    )
    const d = items[0].discrepancies.find((x) => x.field === "uom")
    expect(d).toBeDefined()
    expect(d!.poValue).toBe("Case")
    expect(d!.buyPlanValue).toBe("Each")
  })

  test("UOM case difference is NOT a discrepancy", () => {
    const items = runComparison(
      [makePo({ uom: "each" })],
      makePlan([makeBp({ uom: "Each" })])
    )
    expect(items[0].discrepancies.find((d) => d.field === "uom")).toBeUndefined()
  })
})

describe("runComparison — math discrepancy (PO internal)", () => {
  test("flags when lineTotal does not equal qty × unitCost", () => {
    // 336 × 4.79 = 1609.44 — deliberately use wrong lineTotal
    const items = runComparison(
      [makePo({ qty: 336, unitCost: 4.79, lineTotal: 1700.00 })],
      makePlan([makeBp()])
    )
    const d = items[0].discrepancies.find((x) => x.field === "math")
    expect(d).toBeDefined()
    expect(d!.poValue).toBe(1700.00)
    expect(d!.buyPlanValue).toBeCloseTo(1609.44, 1)
  })

  test("rounding within $0.02 is NOT a math discrepancy", () => {
    // 264 × 3.36 = 887.04 exactly
    const items = runComparison(
      [makePo({ qty: 264, unitCost: 3.36, lineTotal: 887.04 })],
      makePlan([makeBp({ unitCost: 3.36 })])
    )
    expect(items[0].discrepancies.find((d) => d.field === "math")).toBeUndefined()
  })
})

describe("runComparison — unmatched PO line", () => {
  test("PO line with no buy plan row is flagged isUnmatched=true", () => {
    const items = runComparison(
      [makePo({ vendorPN: "UNKNOWN-STYLE" })],
      makePlan([makeBp()])
    )
    const unmatchedPo = items.find((i) => i.poLine?.vendorPN === "UNKNOWN-STYLE")
    expect(unmatchedPo).toBeDefined()
    expect(unmatchedPo!.isUnmatched).toBe(true)
    expect(unmatchedPo!.buyPlanRow).toBeNull()
    expect(unmatchedPo!.discrepancies).toHaveLength(0)
  })
})

describe("runComparison — unmatched buy plan row", () => {
  test("buy plan row with no PO line is flagged isUnmatched=true", () => {
    const items = runComparison(
      [], // no PO lines
      makePlan([makeBp()])
    )
    expect(items).toHaveLength(1)
    expect(items[0].isUnmatched).toBe(true)
    expect(items[0].poLine).toBeNull()
    expect(items[0].buyPlanRow).not.toBeNull()
  })
})

describe("runComparison — case-insensitive matching", () => {
  test("lowercase vendorPN/colorCode matches uppercase buy plan row", () => {
    const items = runComparison(
      [makePo({ vendorPN: "6ubombsor02", colorCode: "bl" })],
      makePlan([makeBp({ sku: "6UBOMBSOR02", colorCode: "BL" })])
    )
    expect(items).toHaveLength(1)
    expect(items[0].isUnmatched).toBe(false)
  })
})

describe("runComparison — multiple lines, multiple colors", () => {
  const poLines: PoLineItem[] = [
    makePo({ vendorPN: "6UBOMBSOR02", colorCode: "BL", lineNumber: 1 }),
    makePo({ vendorPN: "6UBOMBSOR02", colorCode: "PNK", lineNumber: 2 }),
    makePo({ vendorPN: "6UBOMBSMC01", colorCode: "GRY", lineNumber: 7, qty: 264, unitCost: 2.96, lineTotal: 781.44 }),
  ]
  const bpRows: BuyPlanRow[] = [
    makeBp({ sku: "6UBOMBSOR02", colorCode: "BL" }),
    makeBp({ sku: "6UBOMBSOR02", colorCode: "PNK" }),
    makeBp({ sku: "6UBOMBSMC01", colorCode: "GRY", unitCost: 2.96 }),
  ]

  const items = runComparison(poLines, makePlan(bpRows))

  test("returns 3 items (all matched)", () => expect(items).toHaveLength(3))
  test("none are unmatched", () =>
    expect(items.every((i) => !i.isUnmatched)).toBe(true))
  test("no discrepancies in any item", () =>
    expect(items.every((i) => i.discrepancies.length === 0)).toBe(true))
})

describe("runComparison — multiple discrepancies on one line", () => {
  test("reports all discrepancy types simultaneously", () => {
    const items = runComparison(
      [makePo({ unitCost: 5.99, description: "WRONG DESC", uom: "Case", lineTotal: 999.99 })],
      makePlan([makeBp()])
    )
    const fields = items[0].discrepancies.map((d) => d.field)
    expect(fields).toContain("unitCost")
    expect(fields).toContain("description")
    expect(fields).toContain("uom")
    expect(fields).toContain("math")
  })
})

describe("runComparison — innerPacks discrepancy", () => {
  test("uses innerPacksByPo keyed by PO number (per-PO path)", () => {
    const items = runComparison(
      [makePo({ innerPacks: 1, poNumber: "16043880" })],
      makePlan([makeBp({ innerPacksByPo: { "16043880": 2 } })])
    )
    const d = items[0].discrepancies.find((x) => x.field === "innerPacks")
    expect(d).toBeDefined()
    expect(d!.poValue).toBe(1)
    expect(d!.buyPlanValue).toBe(2)
  })

  test("no discrepancy when per-PO value matches PO innerPacks", () => {
    const items = runComparison(
      [makePo({ innerPacks: 1, poNumber: "16043880" })],
      makePlan([makeBp({ innerPacksByPo: { "16043880": 1 } })])
    )
    expect(items[0].discrepancies.find((d) => d.field === "innerPacks")).toBeUndefined()
  })

  test("falls back to static innerPacks when innerPacksByPo absent", () => {
    const items = runComparison(
      [makePo({ innerPacks: 1 })],
      makePlan([makeBp({ innerPacks: 6 })])
    )
    const d = items[0].discrepancies.find((x) => x.field === "innerPacks")
    expect(d).toBeDefined()
    expect(d!.poValue).toBe(1)
    expect(d!.buyPlanValue).toBe(6)
  })

  test("no discrepancy when either value is absent", () => {
    const items = runComparison([makePo()], makePlan([makeBp({ innerPacks: 6 })]))
    expect(items[0].discrepancies.find((d) => d.field === "innerPacks")).toBeUndefined()
  })
})

describe("runComparison — resale discrepancy", () => {
  test("flags when PO resale differs from BP retailCost by more than $0.01", () => {
    const items = runComparison(
      [makePo({ resale: 24.99 })],
      makePlan([makeBp({ retailCost: 19.99 })])
    )
    const d = items[0].discrepancies.find((x) => x.field === "resale")
    expect(d).toBeDefined()
    expect(d!.poValue).toBe(24.99)
    expect(d!.buyPlanValue).toBe(19.99)
  })

  test("no discrepancy when values match exactly", () => {
    const items = runComparison(
      [makePo({ resale: 19.99 })],
      makePlan([makeBp({ retailCost: 19.99 })])
    )
    expect(items[0].discrepancies.find((d) => d.field === "resale")).toBeUndefined()
  })

  test("no discrepancy when PO resale is absent", () => {
    const items = runComparison(
      [makePo()],
      makePlan([makeBp({ retailCost: 19.99 })])
    )
    expect(items[0].discrepancies.find((d) => d.field === "resale")).toBeUndefined()
  })

  test("no discrepancy when BP retailCost is absent", () => {
    const items = runComparison(
      [makePo({ resale: 19.99 })],
      makePlan([makeBp()])
    )
    expect(items[0].discrepancies.find((d) => d.field === "resale")).toBeUndefined()
  })
})

describe("runComparison — ship date discrepancy", () => {
  // makePlan windows: shipDate "4/20/2026"

  test("PO ship date matching a window → no shipDate discrepancy", () => {
    const items = runComparison(
      [makePo({ shipDate: "4/20/2026" })],
      makePlan([makeBp()])
    )
    const fields = items[0].discrepancies.map((d) => d.field)
    expect(fields).not.toContain("shipDate")
  })

  test("PO ship date matching a window with leading zero → no discrepancy (04/20/2026)", () => {
    const items = runComparison(
      [makePo({ shipDate: "04/20/2026" })],
      makePlan([makeBp()])
    )
    const fields = items[0].discrepancies.map((d) => d.field)
    expect(fields).not.toContain("shipDate")
  })

  test("PO ship date not matching any window → shipDate discrepancy", () => {
    const items = runComparison(
      [makePo({ shipDate: "6/8/2026" })],
      makePlan([makeBp()])
    )
    const d = items[0].discrepancies.find((x) => x.field === "shipDate")
    expect(d).toBeDefined()
    expect(d!.poValue).toBe("6/8/2026")
    // buyPlanValue should list the available window ship date(s)
    expect(String(d!.buyPlanValue)).toContain("4/20/2026")
  })

  test("PO with no shipDate → no shipDate discrepancy (field absent)", () => {
    const items = runComparison([makePo()], makePlan([makeBp()]))
    const fields = items[0].discrepancies.map((d) => d.field)
    expect(fields).not.toContain("shipDate")
  })

  test("plan with no windows → no shipDate discrepancy (nothing to compare against)", () => {
    const items = runComparison(
      [makePo({ shipDate: "6/8/2026" })],
      { windows: [], rows: [makeBp()] }
    )
    const fields = items[0].discrepancies.map((d) => d.field)
    expect(fields).not.toContain("shipDate")
  })
})
