import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

// ── Types ─────────────────────────────────────────────────────────────────────

type Discrepancy = { field: string; poValue: unknown; buyPlanValue: unknown }

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

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ComparisonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session) redirect("/login")

  const { id } = await params

  const comparison = await db.comparison.findUnique({
    where: { id },
    select: {
      id: true,
      createdAt: true,
      buyPlan: { select: { filename: true } },
      poUploadLinks: {
        select: { poUpload: { select: { filename: true } } },
      },
      items: {
        orderBy: [{ isUnmatched: "asc" }, { sku: "asc" }],
        select: {
          id: true,
          sku: true,
          isUnmatched: true,
          poData: true,
          buyPlanData: true,
          discrepancies: true,
        },
      },
    },
  })

  if (!comparison) notFound()

  const items = comparison.items
  const discrepancyCount = items.filter(
    (i) => (i.discrepancies as Discrepancy[]).length > 0
  ).length
  const unmatchedCount = items.filter((i) => i.isUnmatched).length
  const poNames = comparison.poUploadLinks.map((l) => l.poUpload.filename).join(", ")

  return (
    <div className="p-8 max-w-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {comparison.buyPlan.filename}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">vs {poNames}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Run {new Date(comparison.createdAt).toLocaleString()}
          </p>
        </div>
        <a
          href={`/api/comparisons/${comparison.id}/export`}
          className="shrink-0 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
        >
          Export to Excel
        </a>
      </div>

      {/* Summary pills */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <Pill label="Total lines" value={items.length} />
        <Pill
          label="Discrepancies"
          value={discrepancyCount}
          highlight={discrepancyCount > 0 ? "red" : "green"}
        />
        <Pill
          label="Unmatched"
          value={unmatchedCount}
          highlight={unmatchedCount > 0 ? "amber" : "green"}
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-xs text-left">
          <thead className="bg-gray-50 text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2.5 font-medium">PO #</th>
              <th className="px-3 py-2.5 font-medium">Vendor PN / Color</th>
              <th className="px-3 py-2.5 font-medium">Description</th>
              <th className="px-3 py-2.5 font-medium text-right">PO Cost</th>
              <th className="px-3 py-2.5 font-medium text-right">BP Cost</th>
              <th className="px-3 py-2.5 font-medium text-right">PO Resale</th>
              <th className="px-3 py-2.5 font-medium text-right">BP Retail</th>
              <th className="px-3 py-2.5 font-medium text-right">Inner Packs</th>
              <th className="px-3 py-2.5 font-medium text-right">BP Inner Packs</th>
              <th className="px-3 py-2.5 font-medium text-right">Outer Packs</th>
              <th className="px-3 py-2.5 font-medium text-right">BP Outer Packs</th>
              <th className="px-3 py-2.5 font-medium text-right">PO Qty</th>
              <th className="px-3 py-2.5 font-medium">UOM</th>
              <th className="px-3 py-2.5 font-medium text-center">Math</th>
              <th className="px-3 py-2.5 font-medium">Ship Date</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((item) => {
              const po = item.poData as PoData | null
              const bp = item.buyPlanData as BpData | null
              const disc = item.discrepancies as Discrepancy[]
              const has = (field: string) => disc.some((d) => d.field === field)

              if (item.isUnmatched) {
                return (
                  <tr key={item.id} className="bg-amber-50">
                    <td className="px-3 py-2 font-mono text-gray-500 text-xs">
                      {po?.poNumber ?? bp?.poNumber ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-600">
                      {item.sku}
                      {(po?.colorCode || bp?.colorCode) && (
                        <span className="text-gray-400">
                          {" "}/ {po?.colorCode ?? bp?.colorCode}
                        </span>
                      )}
                    </td>
                    <td
                      colSpan={12}
                      className="px-3 py-2 text-amber-700 italic"
                    >
                      {po
                        ? "No matching Buy Plan row"
                        : "No matching PO line"}
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs">
                      {po?.shipDate ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge color="amber">Unmatched</Badge>
                    </td>
                  </tr>
                )
              }

              return (
                <tr key={item.id} className={disc.length > 0 ? "bg-red-50" : ""}>
                  <td className="px-3 py-2 font-mono text-gray-500 text-xs">
                    {po?.poNumber ?? bp?.poNumber ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-gray-700">
                    {item.sku}
                    {po?.colorCode && (
                      <span className="text-gray-400"> / {po.colorCode}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 max-w-xs">
                    {has("description") ? (
                      <span className="text-red-700">
                        PO: {po?.description ?? "—"}
                        <br />
                        <span className="text-gray-500">
                          BP: {bp?.description ?? "—"}
                        </span>
                      </span>
                    ) : (
                      <span className="text-gray-700 truncate block max-w-xs">
                        {po?.description ?? bp?.description ?? "—"}
                      </span>
                    )}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      has("unitCost") ? "text-red-700 font-semibold" : "text-gray-700"
                    }`}
                  >
                    {po?.unitCost != null ? `$${po.unitCost.toFixed(2)}` : "—"}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      has("unitCost") ? "text-red-700" : "text-gray-500"
                    }`}
                  >
                    {bp?.unitCost != null ? `$${bp.unitCost.toFixed(2)}` : "—"}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      has("resale") ? "text-red-700 font-semibold" : "text-gray-700"
                    }`}
                  >
                    {po?.resale != null ? `$${po.resale.toFixed(2)}` : "—"}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      has("resale") ? "text-red-700" : "text-gray-500"
                    }`}
                  >
                    {bp?.retailCost != null ? `$${bp.retailCost.toFixed(2)}` : "—"}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      has("innerPacks") ? "text-red-700 font-semibold" : "text-gray-700"
                    }`}
                  >
                    {po?.innerPacks ?? "—"}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      has("innerPacks") ? "text-red-700" : "text-gray-500"
                    }`}
                  >
                    {(po?.poNumber && bp?.innerPacksByPo?.[po.poNumber]) ?? bp?.innerPacks ?? "—"}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      has("outerPacks") ? "text-red-700 font-semibold" : "text-gray-700"
                    }`}
                  >
                    {po?.outerPacks ?? "—"}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      has("outerPacks") ? "text-red-700" : "text-gray-500"
                    }`}
                  >
                    {bp?.outerPacks ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                    {po?.qty ?? "—"}
                  </td>
                  <td
                    className={`px-3 py-2 ${
                      has("uom") ? "text-red-700 font-semibold" : "text-gray-700"
                    }`}
                  >
                    {has("uom") ? (
                      <>
                        PO: {po?.uom}
                        <br />
                        <span className="text-gray-500">BP: {bp?.uom}</span>
                      </>
                    ) : (
                      po?.uom ?? "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {has("math") ? (
                      <span className="text-red-600 font-bold">✗</span>
                    ) : (
                      <span className="text-green-600">✓</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {has("shipDate") ? (() => {
                      const d = disc.find((x) => x.field === "shipDate")
                      return (
                        <span className="text-red-700">
                          PO: {String(d?.poValue ?? "—")}
                          <br />
                          <span className="text-gray-500">
                            BP: {String(d?.buyPlanValue ?? "—")}
                          </span>
                        </span>
                      )
                    })() : (
                      <span className="text-gray-600">{po?.shipDate ?? "—"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {disc.length === 0 ? (
                      <Badge color="green">OK</Badge>
                    ) : (
                      <Badge color="red">
                        {disc.length} issue{disc.length > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Small components ──────────────────────────────────────────────────────────

function Pill({
  label,
  value,
  highlight,
}: {
  label: string
  value: number
  highlight?: "red" | "green" | "amber"
}) {
  const colors = {
    red: "bg-red-50 text-red-700 border-red-200",
    green: "bg-green-50 text-green-700 border-green-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
  }
  const cls = highlight ? colors[highlight] : "bg-gray-50 text-gray-700 border-gray-200"
  return (
    <div className={`flex items-baseline gap-1.5 px-3 py-1.5 rounded-md border text-sm ${cls}`}>
      <span className="font-semibold">{value}</span>
      <span className="text-xs opacity-70">{label}</span>
    </div>
  )
}

function Badge({
  color,
  children,
}: {
  color: "green" | "red" | "amber"
  children: React.ReactNode
}) {
  const colors = {
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700",
  }
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${colors[color]}`}
    >
      {children}
    </span>
  )
}
