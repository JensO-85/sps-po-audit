"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function DeleteComparisonButton({ id }: { id: string }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault() // prevent the parent <Link> from firing
    if (!confirm("Delete this comparison? This cannot be undone.")) return
    setDeleting(true)
    try {
      await fetch(`/api/comparisons/${id}`, { method: "DELETE" })
      router.refresh()
    } catch {
      setDeleting(false)
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="shrink-0 self-center px-3 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40 text-lg leading-none"
      title="Delete comparison"
    >
      {deleting ? "…" : "×"}
    </button>
  )
}
