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

  try {
    await db.poUpload.delete({ where: { id } })
  } catch {
    // Referenced by a comparison — leave the DB record, UI will still clear
  }

  return NextResponse.json({ success: true })
}
