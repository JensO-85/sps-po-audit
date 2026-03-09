import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { parsePoPdf } from "@/lib/parsers/po-pdf"

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get("file")

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }

  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  if (!isPdf) {
    return NextResponse.json({ error: "File must be a PDF" }, { status: 400 })
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File must be under 10 MB" }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  let parsedData
  try {
    parsedData = await parsePoPdf(buffer)
  } catch (err) {
    return NextResponse.json(
      {
        error: `Could not parse PDF: ${err instanceof Error ? err.message : "Unknown error"}`,
      },
      { status: 422 }
    )
  }

  const upload = await db.poUpload.create({
    data: {
      filename: file.name,
      uploadedById: session.user.id,
      parsedData: parsedData as object,
    },
    select: { id: true, filename: true, uploadedAt: true },
  })

  return NextResponse.json(
    { ...upload, lineItemCount: parsedData.lineItems.length },
    { status: 201 }
  )
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const uploads = await db.poUpload.findMany({
    orderBy: { uploadedAt: "desc" },
    take: 50,
    select: { id: true, filename: true, uploadedAt: true },
  })

  return NextResponse.json(uploads)
}
