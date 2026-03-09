import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { generateComparisonExcel } from "@/lib/comparison/export"
import type { ExportItem } from "@/lib/comparison/export"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const comparison = await db.comparison.findUnique({
    where: { id },
    select: {
      createdAt: true,
      buyPlan: { select: { filename: true } },
      poUploadLinks: {
        select: { poUpload: { select: { filename: true } } },
      },
      items: {
        orderBy: [{ isUnmatched: "asc" }, { sku: "asc" }],
        select: {
          sku: true,
          isUnmatched: true,
          poData: true,
          buyPlanData: true,
          discrepancies: true,
        },
      },
    },
  })

  if (!comparison) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const buf = await generateComparisonExcel(
    {
      buyPlanFilename: comparison.buyPlan.filename,
      poFilenames: comparison.poUploadLinks.map((l) => l.poUpload.filename),
      createdAt: comparison.createdAt,
    },
    comparison.items as ExportItem[]
  )

  const filename = `comparison-${id.slice(0, 8)}.xlsx`

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
