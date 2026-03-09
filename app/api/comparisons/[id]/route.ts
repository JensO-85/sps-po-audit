import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  // Delete child records first (no cascade defined in schema)
  await db.comparisonItem.deleteMany({ where: { comparisonId: id } })
  await db.comparisonPoUpload.deleteMany({ where: { comparisonId: id } })
  await db.comparison.delete({ where: { id } })

  return NextResponse.json({ success: true })
}

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
      id: true,
      createdAt: true,
      buyPlan: { select: { id: true, filename: true, uploadedAt: true } },
      poUploadLinks: {
        select: {
          poUpload: { select: { id: true, filename: true, uploadedAt: true } },
        },
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

  if (!comparison) {
    return NextResponse.json({ error: "Comparison not found" }, { status: 404 })
  }

  // Compute summary counts
  const items = comparison.items
  const discrepancyCount = items.filter(
    (i) => Array.isArray(i.discrepancies) && (i.discrepancies as unknown[]).length > 0
  ).length
  const unmatchedCount = items.filter((i) => i.isUnmatched).length

  return NextResponse.json({
    ...comparison,
    summary: {
      totalItems: items.length,
      discrepancyCount,
      unmatchedCount,
    },
  })
}
