"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function ClearAllButton({ disabled }: { disabled: boolean }) {
  const router = useRouter()
  const [clearing, setClearing] = useState(false)

  async function handleClearAll() {
    if (!confirm("Delete ALL comparisons? This cannot be undone.")) return
    setClearing(true)
    try {
      await fetch("/api/comparisons", { method: "DELETE" })
      router.refresh()
    } finally {
      setClearing(false)
    }
  }

  return (
    <button
      onClick={handleClearAll}
      disabled={disabled || clearing}
      className="text-sm text-gray-500 hover:text-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
    >
      {clearing ? "Clearing…" : "Clear all"}
    </button>
  )
}
