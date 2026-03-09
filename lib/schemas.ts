import { z } from "zod"

// ── PO line item (parsed from PDF) ───────────────────────────────────────────

export const PoLineItemSchema = z.object({
  lineNumber: z.number().int().positive(),
  sku: z.string(),
  /** Vendor Style # from sub-row — primary key for matching against Buy Plan */
  vendorPN: z.string(),
  /** Buyers Color Description (e.g. "BL", "PNK") — used alongside vendorPN to uniquely match */
  colorCode: z.string(),
  description: z.string(),
  qty: z.number().positive(),
  unitCost: z.number().nonnegative(),
  lineTotal: z.number().nonnegative(),
  uom: z.string(),
  upc: z.string().optional(),
  /** Resale / retail price from the PO PDF line item */
  resale: z.number().nonnegative().optional(),
  /** Eaches Per Inner Container from the PO PDF line item */
  innerPacks: z.number().nonnegative().optional(),
  /** Number of Inner Containers (outer carton pack count) from the PO PDF */
  outerPacks: z.number().nonnegative().optional(),
  /** PO / order number from the PDF header, propagated to every line item */
  poNumber: z.string().optional(),
  /** Ship date from PO header (Shipping Window), propagated to every line item */
  shipDate: z.string().optional(),
  /** In-DC / cancel date from PO header, propagated to every line item */
  inDcDate: z.string().optional(),
})
export type PoLineItem = z.infer<typeof PoLineItemSchema>

// ── Parsed PO (header + line items) ─────────────────────────────────────────

export const ParsedPoSchema = z.object({
  poNumber: z.string(),
  poDate: z.string().optional(),
  /** Shipping Window date from PO header */
  shipDate: z.string().optional(),
  /** Cancel Date from PO header — used as in-DC date */
  inDcDate: z.string().optional(),
  lineItems: z.array(PoLineItemSchema),
})
export type ParsedPo = z.infer<typeof ParsedPoSchema>

// ── Buy Plan (parsed from Excel) ─────────────────────────────────────────────

/**
 * One delivery window column from the Buy Plan header.
 * colKey format: "{weekLabel}/{channel}"  e.g. "APR WK 4/STORE"
 */
export const BuyPlanWindowSchema = z.object({
  weekLabel: z.string(),  // e.g. "APR WK 4"
  channel: z.string(),    // e.g. "STORE" or "DIGITAL"
  shipDate: z.string(),   // e.g. "4/20/2026"
  inDcDate: z.string(),   // e.g. "4/25/2026"
  colKey: z.string(),     // e.g. "APR WK 4/STORE"
})
export type BuyPlanWindow = z.infer<typeof BuyPlanWindowSchema>

/**
 * One data row from the Buy Plan Excel (one per vendor-style + color).
 * sku = Vendor Style # — matches PoLineItem.vendorPN for comparison.
 * windowQtys maps each colKey to the planned quantity for that window/channel.
 */
export const BuyPlanRowSchema = z.object({
  sku: z.string(),                            // Vendor Style # (K column)
  colorCode: z.string(),                      // Vendor Color (M column, e.g. "BL")
  description: z.string(),                    // Kohl's Style Description (L column)
  unitCost: z.number().nonnegative(),         // First Cost (B column)
  uom: z.string(),                            // Always "Each" for now
  retailCost: z.number().nonnegative().optional(), // Retail Cost column (when present)
  innerPacks: z.number().nonnegative().optional(), // Static Inner Pack col Z (fallback)
  /** Per-PO inner pack quantity: keyed by PO number from row 1 of the Buy Plan window header */
  innerPacksByPo: z.record(z.string(), z.number()).optional(),
  outerPacks: z.number().nonnegative().optional(), // Outer Pack column (when present)
  poNumber: z.string().optional(),            // PO column (when present in Buy Plan)
  windowQtys: z.record(z.string(), z.number()), // keyed by colKey
  totalQty: z.number().nonnegative(),         // sum across all windows
})
export type BuyPlanRow = z.infer<typeof BuyPlanRowSchema>

export const ParsedBuyPlanSchema = z.object({
  windows: z.array(BuyPlanWindowSchema),
  rows: z.array(BuyPlanRowSchema),
})
export type ParsedBuyPlan = z.infer<typeof ParsedBuyPlanSchema>

// ── Comparison types (used by engine + export) ────────────────────────────────

export const DiscrepancySchema = z.object({
  field: z.enum(["unitCost", "description", "qty", "uom", "math", "shipDate", "resale", "innerPacks", "outerPacks"]),
  poValue: z.unknown(),
  buyPlanValue: z.unknown(),
})
export type Discrepancy = z.infer<typeof DiscrepancySchema>

export const ComparisonItemSchema = z.object({
  sku: z.string(),
  poLine: PoLineItemSchema.nullable(),
  buyPlanRow: BuyPlanRowSchema.nullable(),
  discrepancies: z.array(DiscrepancySchema),
  isUnmatched: z.boolean(),
})
export type ComparisonItem = z.infer<typeof ComparisonItemSchema>
