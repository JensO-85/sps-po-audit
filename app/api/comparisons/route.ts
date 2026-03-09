import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { runComparison } from "@/lib/comparison/engine"
import type { ParsedPo, ParsedBuyPlan, PoLineItem } from "@/lib/schemas"

const RequestSchema = z.object({
  poUploadIds: z.array(z.string()).min(1, "At least one PO upload is required"),
  buyPlanId: z.string().min(1),
})

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const { poUploadIds, buyPlanId } = parsed.data

  // Fetch PO uploads
  const poUploads = await db.poUpload.findMany({
    where: { id: { in: poUploadIds } },
  })
  if (poUploads.length !== poUploadIds.length) {
    return NextResponse.json(
      { error: "One or more PO uploads not found" },
      { status: 404 }
    )
  }

  // Fetch buy plan
  const buyPlan = await db.buyPlan.findUnique({ where: { id: buyPlanId } })
  if (!buyPlan?.parsedData) {
    return NextResponse.json(
      { error: "Buy Plan not found or not yet parsed" },
      { status: 404 }
    )
  }

  // Combine PO line items from all uploads.
  // Propagate header-level dates (shipDate, inDcDate) onto every line item so
  // the comparison engine can check them against Buy Plan windows.
  const allPoLines: PoLineItem[] = []
  for (const upload of poUploads) {
    if (!upload.parsedData) continue
    const parsedPo = upload.parsedData as unknown as ParsedPo
    const { poNumber, shipDate, inDcDate } = parsedPo
    for (const line of parsedPo.lineItems) {
      allPoLines.push({ ...line, poNumber, shipDate, inDcDate })
    }
  }

  const parsedBuyPlan = buyPlan.parsedData as unknown as ParsedBuyPlan
  const comparisonItems = runComparison(allPoLines, parsedBuyPlan)

  const discrepancyCount = comparisonItems.filter(
    (i) => i.discrepancies.length > 0
  ).length
  const unmatchedCount = comparisonItems.filter((i) => i.isUnmatched).length

  // Persist comparison and all its items in one transaction
  const comparison = await db.comparison.create({
    data: {
      createdById: session.user.id,
      buyPlanId,
      poUploadLinks: {
        createMany: {
          data: poUploadIds.map((id) => ({ poUploadId: id })),
        },
      },
      items: {
        createMany: {
          data: comparisonItems.map((item) => ({
            sku: item.sku,
            isUnmatched: item.isUnmatched,
            poData: item.poLine ? (item.poLine as Prisma.InputJsonValue) : Prisma.JsonNull,
            buyPlanData: item.buyPlanRow ? (item.buyPlanRow as Prisma.InputJsonValue) : Prisma.JsonNull,
            discrepancies: item.discrepancies as Prisma.InputJsonValue,
          })),
        },
      },
    },
    select: { id: true, createdAt: true },
  })

  return NextResponse.json(
    {
      id: comparison.id,
      createdAt: comparison.createdAt,
      itemCount: comparisonItems.length,
      discrepancyCount,
      unmatchedCount,
    },
    { status: 201 }
  )
}

export async function DELETE() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Delete all comparisons — children first (no cascade in schema)
  await db.comparisonItem.deleteMany({})
  await db.comparisonPoUpload.deleteMany({})
  await db.comparison.deleteMany({})

  return NextResponse.json({ success: true })
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const comparisons = await db.comparison.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      createdAt: true,
      buyPlan: { select: { id: true, filename: true } },
      poUploadLinks: {
        select: { poUpload: { select: { id: true, filename: true } } },
      },
      _count: { select: { items: true } },
    },
  })

  return NextResponse.json(comparisons)
}
