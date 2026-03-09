/**
 * Parser for SPS Commerce / Kohl's PO PDFs.
 *
 * PDF structure (observed from production PDFs, Dec 2025):
 *
 *   HEADER
 *     Order #: {poNumber}
 *     PO Date: {mm/dd/yyyy}
 *     Shipping Window: {mm/dd/yyyy}   ← our shipDate
 *     Cancel Date:     {mm/dd/yyyy}   ← our inDcDate
 *
 *   LINE ITEM TABLE — two sub-rows per logical line:
 *     (a) Main row : {lineNum} {sku} Vendors Style Number: {vendorPN}
 *                    {upc} Product Description: {text...}
 *                    Buyers Color... {store} {qty} Unit Price: {price}
 *                    Resale: {resale} {qty} Each {lineTotal}
 *     (b) Sub-row  : {lineNum} {sku} {vendorPN} {upc} {price} 1 Each
 *
 * Strategy: the sub-rows are compact and consistent — we use them as anchors.
 * The text block BEFORE each sub-row (since the previous sub-row) is the main
 * row data for that line item.
 */

import type { ParsedPo, PoLineItem } from "@/lib/schemas"
import { writeFileSync } from "fs"
import { join } from "path"

type PdfParseFn = (buf: Buffer) => Promise<{ text: string }>

/** Loads pdf-parse defensively — handles CJS module.exports=fn and ESM default. */
async function loadPdfParse(): Promise<PdfParseFn> {
  const m = await import("pdf-parse")
  // ESM interop: CJS `module.exports = fn` becomes `.default`
  const fn = (m as { default?: unknown }).default ?? m
  if (typeof fn !== "function") {
    throw new Error(
      `pdf-parse did not export a function. Got: ${typeof fn}. ` +
        `Keys: [${Object.keys(m as object).join(", ")}]`
    )
  }
  return fn as PdfParseFn
}

export async function parsePoPdf(buffer: Buffer): Promise<ParsedPo> {
  const pdfParseFn = await loadPdfParse()
  const { text } = await pdfParseFn(buffer)

  // TEMPORARY — write raw text to project root so we can tune the parser regexes
  try {
    writeFileSync(join(process.cwd(), "po-debug.txt"), text, "utf-8")
  } catch {
    // ignore — read-only FS or permission error
  }

  return parsePoText(text)
}

/**
 * Pure text → ParsedPo. Exported so unit tests can pass fixtures without a
 * real PDF.
 */
export function parsePoText(raw: string): ParsedPo {
  const text = normalise(raw)

  const poNumber = extract(text, /Order\s+#:\s*(\d+)/)
  if (!poNumber) {
    throw new Error(
      "Could not find 'Order #' — is this an SPS PO PDF?"
    )
  }

  const poDate = extract(text, /PO\s+Date:\s*([\d/]+)/)

  // Prefer "Shipping Window", fall back to "Requested Ship Date"
  const shipDate =
    extract(text, /Shipping\s+Window:\s*([\d/]+)/) ??
    extract(text, /Requested\s+Ship\s+Date:\s*([\d/]+)/)

  // Prefer "Cancel Date", fall back to "Requested Delivery Date" / "Delivery Window"
  const inDcDate =
    extract(text, /Cancel\s+Date:\s*([\d/]+)/) ??
    extract(text, /Requested\s+Delivery\s+Date:\s*([\d/]+)/) ??
    extract(text, /Delivery\s+Window:\s*([\d/]+)/)

  const lineItems = extractLineItems(text)
  if (lineItems.length === 0) {
    throw new Error("No line items found — unexpected PDF format")
  }

  return { poNumber, poDate, shipDate, inDcDate, lineItems }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Collapse runs of spaces/tabs to a single space; normalise line endings. */
function normalise(raw: string): string {
  return raw.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ")
}

function extract(text: string, re: RegExp): string | undefined {
  return re.exec(text)?.[1]?.trim() || undefined
}

/**
 * Identify every "sub-row" in the document.  Each has the form:
 *   {lineNum}  {7-digit SKU}  {vendorPN}  {12-14-digit UPC}  {price}  1  Each
 *
 * The text block from the end of the previous sub-row to the start of the
 * current sub-row is the full main-row data for that line item.
 */
function extractLineItems(text: string): PoLineItem[] {
  // pdf-parse concatenates table cells. Two observed formats:
  //   (a) Spaced:    "11155056 6UBOMBSOR02 4001858424934.791  Each"
  //   (b) No-space:  "111550566UBOMBSOR024001858424934.791Each"
  //
  // In (b) all fields run together without separators. We use:
  //   • non-greedy (\d{1,2}?) for line number — tries 1 digit first, which is
  //     correct for single-digit lines and avoids consuming a digit that belongs
  //     to the 7-digit SKU.  (POs with ≥10 lines using no-space format would
  //     need an additional post-pass to renumber; not yet observed in practice.)
  //   • GREEDY (\S+) for vendorPN — the engine starts from the longest possible
  //     match and backtracks until (\d{12})(\d+\.\d{2})1\s*Each can satisfy the
  //     rest of the string.  Non-greedy fails when the PN ends in digits (e.g.
  //     "6UBOMBSOR02") because those trailing digits can form a valid 12-digit
  //     prefix, stopping the match too early at "6UBOMBSOR".  Greedy finds the
  //     LONGEST valid PN, which is always the correct one.
  //   • 1\s*Each — tolerates both "1Each" and "1  Each".
  const SUB_ROW =
    /(\d{1,2}?)(\d{7})\s*(\S+)\s*(\d{12})(\d+\.\d{2})1\s*Each/g

  type Anchor = {
    lineNumber: number
    sku: string
    vendorPN: string
    upc: string
    priceFallback: number
    start: number
    end: number
  }

  const anchors: Anchor[] = []
  let m: RegExpExecArray | null
  while ((m = SUB_ROW.exec(text)) !== null) {
    anchors.push({
      lineNumber: parseInt(m[1], 10),
      sku: m[2],
      vendorPN: m[3],
      upc: m[4],
      priceFallback: parseFloat(m[5]),
      start: m.index,
      end: m.index + m[0].length,
    })
  }

  if (anchors.length === 0) return []

  const items: PoLineItem[] = []

  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i]
    // Main-row block: from end of previous sub-row (or text start) to this sub-row
    const blockStart = i === 0 ? 0 : anchors[i - 1].end
    const block = text.slice(blockStart, anchor.start)

    // ── Description ───────────────────────────────────────────────────────
    // Capture everything between "Product Description:" and the next structural
    // label. The description text may span several lines due to PDF wrapping.
    //
    // Stop conditions:
    //   • "Buyers\s"       — Buyers Color / Size label immediately follows
    //   • "Eaches Per"     — inner-container count
    //   • "Number of Inner"— inner-container count
    //   • "\n\d{7,}"       — store SKU (8 digits) concatenated with "Unit Price:"
    //                        when a page break splits the Buyers Color onto the
    //                        next page (the SKU runs together with the label)
    //   • "\nUnit Price"    — Unit Price label on its own line (spaced format)
    const descMatch =
      /Product\s+Description:\s*([\s\S]*?)(?=Buyers\s|Eaches Per|Number of Inner|\n\d{7,}|\nUnit Price)/i.exec(
        block
      )
    const description = descMatch
      ? descMatch[1].replace(/\n/g, " ").replace(/\s+/g, " ").trim()
      : ""

    // ── Color code ────────────────────────────────────────────────────────
    // "Buyers Color\nDescription: BL" — pdf-parse wraps across two lines
    const colorCode =
      extract(block, /Buyers Color\s+Description:\s*(\S+)/i) ?? ""

    // ── Unit cost ──────────────────────────────────────────────────────────
    // "Unit Price: 4.79" — prefer the labelled value; fall back to sub-row price
    const priceStr = extract(block, /Unit\s+Price:\s*([\d.,]+)/)
    const unitCost = priceStr
      ? parseFloat(priceStr.replace(/,/g, ""))
      : anchor.priceFallback

    // ── Resale / retail price ──────────────────────────────────────────────
    // "Resale: 19.99" appears after the Unit Price label in each main-row block
    const resaleStr = extract(block, /Resale:\s*([\d.,]+)/)
    const resale = resaleStr ? parseFloat(resaleStr.replace(/,/g, "")) : undefined

    // ── Eaches Per Inner Container ─────────────────────────────────────────
    // "Eaches Per Inner\nContainer: 1.0" — the label wraps across two lines in
    // the PDF, so \s+ bridges the newline between "Inner" and "Container:"
    const innerPacksStr = extract(block, /Eaches\s+Per\s+Inner\s+Container:\s*([\d.,]+)/i)
    const innerPacks = innerPacksStr ? parseFloat(innerPacksStr.replace(/,/g, "")) : undefined

    // ── Number of Inner Containers (Outer Packs) ───────────────────────────
    // "Number of Inner\nContainers: 6.0" — same line-wrap pattern
    const outerPacksStr = extract(block, /Number\s+of\s+Inner\s+Containers:\s*([\d.,]+)/i)
    const outerPacks = outerPacksStr ? parseFloat(outerPacksStr.replace(/,/g, "")) : undefined

    // ── Qty + line total ───────────────────────────────────────────────────
    // Pattern: "{integer qty}[ ]Each[ ]{decimal total}"
    // • Spaces are optional — real PDFs often omit them: "360Each1,724.40"
    // • Won't match "1.0 Each" (Eaches Per Inner Container) — the decimal
    //   point terminates \d[\d,]* before the fractional part, leaving ".0 Each"
    //   which then fails \s*Each because "." is not whitespace.
    // • Won't match prepack sub-row "1 Each" — no dollar total follows it in
    //   this block (the sub-row itself is excluded as the anchor boundary).
    const qtyTotalMatch = /\b(\d[\d,]*)\s*Each\s*([\d,]+\.\d{2})\b/.exec(block)
    if (!qtyTotalMatch) continue // should not happen for a valid PO line

    const qty = parseInt(qtyTotalMatch[1].replace(/,/g, ""), 10)
    const lineTotal = parseFloat(qtyTotalMatch[2].replace(/,/g, ""))

    // ── UOM ────────────────────────────────────────────────────────────────
    // Derive UOM from the qty+total context (allows for future Case/Dozen lines)
    const uomMatch = /\d+\s*(Each|Case|Dozen|Pair|Set)\s*[\d,]+\.\d{2}/.exec(block)
    const uom = uomMatch?.[1] ?? "Each"

    items.push({
      lineNumber: anchor.lineNumber,
      sku: anchor.sku,
      vendorPN: anchor.vendorPN,
      colorCode,
      description,
      qty,
      unitCost,
      lineTotal,
      uom,
      upc: anchor.upc,
      ...(resale !== undefined ? { resale } : {}),
      ...(innerPacks !== undefined ? { innerPacks } : {}),
      ...(outerPacks !== undefined ? { outerPacks } : {}),
    })
  }

  return items
}
