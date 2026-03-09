import { parsePoText } from "@/lib/parsers/po-pdf"

// ---------------------------------------------------------------------------
// Fixture — text that closely mirrors actual pdf-parse output for a real
// Kohl's/SPS PO PDF (Order #16043880, 3 pages, 7 lines; fixture uses 4).
//
// Key quirks reproduced from real output:
//   • Line number and SKU are concatenated:  "11155056" = line 1 + SKU 1155056
//   • UPC and price are concatenated:        "4001858424934.79" = UPC + price
//   • Sub-row ends with "1  Each" (two spaces → one after normalise)
//   • Some line totals have no space before amount: "264  Each887.04"
//   • "Order #:" has no space after colon:   "Order #:16043880"
//   • Date fields appear on the line AFTER their label
// ---------------------------------------------------------------------------
const FIXTURE = `
18/12/2025, 4:50 PM: Order
Page 1 of 3https://wfds.hosted-commerce.net/wfds/document?docId=26985...

ORDER
Order #:16043880
Release #:
PO Type:
Blanket Order Duplicate
PO Date:
11/21/2025
Requested Delivery Date:
Requested Ship Date:Cancel Date:
04/25/2026
Delivery Window:Shipping Window:
04/20/2026
Vendor #:Department #:
115
LINE SKU VENDOR PN UPC/GTIN DESCRIPTION LINE ITEM COMMENTS MARKS AND NUMBERS STORE QTY STORE QTY UNIT COST/ RETAIL PRICE QTY UOM ITEM TOTAL
11155056Vendors Style
Number:
6UBOMBSOR02
400185842493 Product
Description:HANGING
TOILETRY
ORGANIZEBuyers Color
Description: BL
Buyers Item Size
Description: NO
SIZE
Buyers Color: 420
Eaches Per Inner
Container: 1.0
Number of Inner
Containers: 6.0
Each
00899336Unit Price:
4.79
Resale:
19.99
336  Each    1,609.44
**PREPACK
SEE
SKUS/QTYS
BELOW FOR
CONTENTS**
11155056 6UBOMBSOR02 4001858424934.791  Each
21155056Vendors Style
Number:
6UBOMBSOR02
400185842509 Product
Description:HANGING
TOILETRY
ORGANIZE
Buyers Color
Description: PNK
Buyers Item Size
Description: NO
SIZE
Buyers Color: 670
Eaches Per Inner
Container: 1.0
Number of Inner
Containers: 6.0
Each
00899336Unit Price:
4.79
Resale:
19.99
336  Each    1,609.44
**PREPACK
SEE
SKUS/QTYS
BELOW FOR
CONTENTS**
21155056 6UBOMBSOR02 4001858425094.791  Each

18/12/2025, 4:50 PMKohls: Order
Page 2 of 3https://wfds.hosted-commerce.net/wfds/document?docId=26985...

41155055Vendors Style
Number:
6UBOMBSMC02
400503231909 Product
Description:MESH SHOWER
CADDY:BL:CADDBuyers Color
Description: BL
Buyers Item Size
Description:
CADDY
Buyers Color: 420
Buyers Size Code:
90236
Eaches Per Inner
Container: 1.0
Number of Inner
Containers: 12.0
Each
00899264Unit Price:
3.36
Resale:
14.99
264  Each887.04
**PREPACK
SEE
SKUS/QTYS
BELOW FOR
CONTENTS**
41155055 6UBOMBSMC02 4005032319093.361  Each

18/12/2025, 4:50 PMKohls: Order
Page 3 of 3https://wfds.hosted-commerce.net/wfds/document?docId=26985...

71155055Vendors Style
Number:
6UBOMBSMC01
400746853227 Product
Description:MESH SHOWER
CADDY:GRY:CAD
Buyers Color
Description: GRY
Buyers Item Size
Description:
CADDY
Buyers Color: 030
Buyers Size Code:
90236
Eaches Per Inner
Container: 1.0
Number of Inner
Containers: 12.0
Each
00899264Unit Price:
2.96
Resale:
14.99
264  Each781.44
**PREPACK
SEE
SKUS/QTYS
BELOW FOR
CONTENTS**
71155055 6UBOMBSMC01 4007468532272.961  Each
7
# of Line Items Merchandise Total 2064 8,270.88
`

// ---------------------------------------------------------------------------

describe("parsePoText — header", () => {
  const result = parsePoText(FIXTURE)

  test("extracts PO number", () => {
    expect(result.poNumber).toBe("16043880")
  })

  test("extracts PO date", () => {
    expect(result.poDate).toBe("11/21/2025")
  })

  test("extracts ship date from Shipping Window", () => {
    expect(result.shipDate).toBe("04/20/2026")
  })

  test("extracts in-DC date from Cancel Date", () => {
    expect(result.inDcDate).toBe("04/25/2026")
  })
})

describe("parsePoText — line items", () => {
  const result = parsePoText(FIXTURE)

  test("finds 4 line items (lines 1, 2, 4, 7)", () => {
    expect(result.lineItems).toHaveLength(4)
  })

  describe("line 1 — SKU 1155056 (HANGING TOILETRY ORGANIZER, BL)", () => {
    const item = () => result.lineItems[0]
    test("lineNumber", () => expect(item().lineNumber).toBe(1))
    test("sku", () => expect(item().sku).toBe("1155056"))
    test("vendorPN", () => expect(item().vendorPN).toBe("6UBOMBSOR02"))
    test("colorCode", () => expect(item().colorCode).toBe("BL"))
    test("upc", () => expect(item().upc).toBe("400185842493"))
    test("description contains product text", () =>
      expect(item().description).toContain("HANGING"))
    test("qty", () => expect(item().qty).toBe(336))
    test("unitCost", () => expect(item().unitCost).toBe(4.79))
    test("resale", () => expect(item().resale).toBe(19.99))
    test("innerPacks", () => expect(item().innerPacks).toBe(1))
    test("outerPacks", () => expect(item().outerPacks).toBe(6))
    test("lineTotal", () => expect(item().lineTotal).toBeCloseTo(1609.44))
    test("uom", () => expect(item().uom).toBe("Each"))
  })

  describe("line 4 — SKU 1155055 (MESH SHOWER CADDY BL)", () => {
    const item = () => result.lineItems[2]
    test("sku", () => expect(item().sku).toBe("1155055"))
    test("qty", () => expect(item().qty).toBe(264))
    test("unitCost", () => expect(item().unitCost).toBe(3.36))
    test("resale", () => expect(item().resale).toBe(14.99))
    test("lineTotal", () => expect(item().lineTotal).toBeCloseTo(887.04))
  })

  describe("line 7 — SKU 1155055 different vendor PN (GRY caddy, lower price)", () => {
    const item = () => result.lineItems[3]
    test("sku", () => expect(item().sku).toBe("1155055"))
    test("vendorPN", () => expect(item().vendorPN).toBe("6UBOMBSMC01"))
    test("colorCode", () => expect(item().colorCode).toBe("GRY"))
    test("upc", () => expect(item().upc).toBe("400746853227"))
    test("unitCost", () => expect(item().unitCost).toBe(2.96))
    test("lineTotal", () => expect(item().lineTotal).toBeCloseTo(781.44))
  })
})

describe("parsePoText — math integrity", () => {
  test("qty × unitCost ≈ lineTotal for each parsed line", () => {
    const result = parsePoText(FIXTURE)
    for (const item of result.lineItems) {
      const computed = item.qty * item.unitCost
      expect(Math.abs(computed - item.lineTotal)).toBeLessThan(0.02)
    }
  })
})

describe("parsePoText — error cases", () => {
  test("throws when Order # not found", () => {
    expect(() => parsePoText("This is not a PO document")).toThrow(
      "Could not find 'Order #'"
    )
  })

  test("throws when no line items found", () => {
    expect(() => parsePoText("Order #: 99999\nNo line items here")).toThrow(
      "No line items found"
    )
  })
})
