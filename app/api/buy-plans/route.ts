import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { parseBuyPlan } from "@/lib/parsers/buy-plan"

const MAX_BYTES = 20 * 1024 * 1024 // 20 MB
const ALLOWED_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]

function isExcel(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase()
  return ALLOWED_TYPES.includes(file.type) || ext === "xlsx" || ext === "xls"
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get("file")

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }

  if (!isExcel(file)) {
    return NextResponse.json(
      { error: "File must be an Excel spreadsheet (.xlsx or .xls)" },
      { status: 400 }
    )
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File must be under 20 MB" },
      { status: 400 }
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  let parsedData
  try {
    parsedData = await parseBuyPlan(buffer)
  } catch (err) {
    return NextResponse.json(
      {
        error: `Could not parse Buy Plan: ${err instanceof Error ? err.message : "Unknown error"}`,
      },
      { status: 422 }
    )
  }

  const buyPlan = await db.buyPlan.create({
    data: {
      filename: file.name,
      uploadedById: session.user.id,
      parsedData: parsedData as object,
    },
    select: { id: true, filename: true, uploadedAt: true },
  })

  return NextResponse.json(
    { ...buyPlan, rowCount: parsedData.rows.length, windowCount: parsedData.windows.length },
    { status: 201 }
  )
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const buyPlans = await db.buyPlan.findMany({
    where: { deletedAt: null },
    orderBy: { uploadedAt: "desc" },
    take: 10,
    select: { id: true, filename: true, uploadedAt: true },
  })

  return NextResponse.json(buyPlans)
}
