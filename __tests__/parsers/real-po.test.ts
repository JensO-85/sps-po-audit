/**
 * Real-PDF regression test — PO #16043880 (Kohl's, Dec 2025, APR shipping window)
 *
 * Uses a fixed fixture extracted from the actual pdf-parse output for
 * Order 16043880 so the test is stable regardless of what is currently in
 * po-debug.txt (which is overwritten on every PDF upload in the running app).
 *
 * 7 line items:
 *   Lines 1-3  SKU 1155056  HANGING TOILETRY ORGANIZE   336 each @ $4.79
 *   Lines 4-6  SKU 1155055  MESH SHOWER CADDY            264 each @ $3.36
 *   Line  7    SKU 1155055  MESH SHOWER CADDY (GRY)      264 each @ $2.96
 *
 * Note: line 3 is split across a page break — Buyers Color (WHT) appears on
 * page 2 after the page header, testing the parser's cross-page handling.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parsePoText } from "@/lib/parsers/po-pdf"

const raw = readFileSync(
  join(__dirname, "fixtures/po-16043880.txt"),
  "utf-8"
)
const result = parsePoText(raw)

describe("real PO #16043880 — header", () => {
  test("poNumber", () => expect(result.poNumber).toBe("16043880"))
  test("poDate",   () => expect(result.poDate).toBe("11/21/2025"))
  test("shipDate", () => expect(result.shipDate).toBe("04/20/2026"))
  test("inDcDate", () => expect(result.inDcDate).toBe("04/25/2026"))
})

describe("real PO #16043880 — line items", () => {
  const items = result.lineItems

  test("finds 7 line items", () => expect(items).toHaveLength(7))

  test("all line math checks out", () => {
    for (const item of items) {
      const computed = item.qty * item.unitCost
      expect(Math.abs(computed - item.lineTotal)).toBeLessThan(0.02)
    }
  })

  test("line 1: SKU 1155056 BL, qty 336, cost $4.79, resale $19.99, total $1609.44", () => {
    const item = items[0]
    expect(item.lineNumber).toBe(1)
    expect(item.sku).toBe("1155056")
    expect(item.vendorPN).toBe("6UBOMBSOR02")
    expect(item.colorCode).toBe("BL")
    expect(item.qty).toBe(336)
    expect(item.unitCost).toBe(4.79)
    expect(item.resale).toBe(19.99)
    expect(item.innerPacks).toBe(1)
    expect(item.outerPacks).toBe(6)
    expect(item.lineTotal).toBeCloseTo(1609.44)
  })

  test("line 2: SKU 1155056 PNK, qty 336, cost $4.79, total $1609.44", () => {
    const item = items[1]
    expect(item.lineNumber).toBe(2)
    expect(item.colorCode).toBe("PNK")
    expect(item.qty).toBe(336)
    expect(item.unitCost).toBe(4.79)
    expect(item.lineTotal).toBeCloseTo(1609.44)
  })

  test("line 3: SKU 1155056 WHT — page-break split, color on page 2", () => {
    const item = items[2]
    expect(item.lineNumber).toBe(3)
    expect(item.colorCode).toBe("WHT")
    expect(item.qty).toBe(336)
    expect(item.unitCost).toBe(4.79)
    expect(item.lineTotal).toBeCloseTo(1609.44)
  })

  test("line 4: SKU 1155055 BL caddy, qty 264, cost $3.36, total $887.04", () => {
    const item = items[3]
    expect(item.lineNumber).toBe(4)
    expect(item.sku).toBe("1155055")
    expect(item.vendorPN).toBe("6UBOMBSMC02")
    expect(item.colorCode).toBe("BL")
    expect(item.qty).toBe(264)
    expect(item.unitCost).toBe(3.36)
    expect(item.lineTotal).toBeCloseTo(887.04)
  })

  test("line 7: SKU 1155055 GRY caddy (different vendorPN), qty 264, cost $2.96", () => {
    const item = items[6]
    expect(item.lineNumber).toBe(7)
    expect(item.vendorPN).toBe("6UBOMBSMC01")
    expect(item.colorCode).toBe("GRY")
    expect(item.qty).toBe(264)
    expect(item.unitCost).toBe(2.96)
    expect(item.lineTotal).toBeCloseTo(781.44)
  })

  test("prints parsed output for inspection", () => {
    console.log("\n=== HEADER ===")
    console.log("PO Number :", result.poNumber)
    console.log("PO Date   :", result.poDate)
    console.log("Ship Date :", result.shipDate)
    console.log("In-DC Date:", result.inDcDate)
    console.log("\n=== LINE ITEMS (%d) ===", items.length)
    for (const item of items) {
      const math = item.qty * item.unitCost
      const mathOk = Math.abs(math - item.lineTotal) < 0.02
      console.log(
        `  Line ${item.lineNumber}: SKU=${item.sku} VPN=${item.vendorPN}` +
        ` Color=${item.colorCode || "(none)"}` +
        ` Qty=${item.qty} Cost=$${item.unitCost.toFixed(2)}` +
        ` Total=$${item.lineTotal.toFixed(2)} Math=${mathOk ? "✓" : "✗"}`
      )
    }
  })
})
