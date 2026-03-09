"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { DropZone } from "@/components/drop-zone"

// ── Types ────────────────────────────────────────────────────────────────────

type UploadStatus = "uploading" | "done" | "error"

type PoEntry = {
  localId: string
  filename: string
  sizeMb: string
  status: UploadStatus
  uploadId?: string
  error?: string
}

type BuyPlanEntry = {
  filename: string
  status: UploadStatus
  uploadId?: string
  error?: string
}

type RecentBuyPlan = {
  id: string
  filename: string
  uploadedAt: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function deletePoUpload(id: string) {
  fetch(`/api/po-uploads/${id}`, { method: "DELETE" }).catch(() => {})
}

function deleteBuyPlan(id: string) {
  fetch(`/api/buy-plans/${id}`, { method: "DELETE" }).catch(() => {})
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function UploadPage() {
  const router = useRouter()
  const [poEntries, setPoEntries] = useState<PoEntry[]>([])
  const [buyPlan, setBuyPlan] = useState<BuyPlanEntry | null>(null)
  const [recentBuyPlans, setRecentBuyPlans] = useState<RecentBuyPlan[]>([])
  const [selectedBuyPlanId, setSelectedBuyPlanId] = useState<string | null>(null)
  const [comparing, setComparing] = useState(false)
  const [compareError, setCompareError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/buy-plans")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setRecentBuyPlans(data) })
      .catch(() => {})
  }, [])

  // ── PO upload handlers ──────────────────────────────────────────────────

  async function uploadPoFile(entry: PoEntry, file: File) {
    const formData = new FormData()
    formData.append("file", file)
    try {
      const res = await fetch("/api/po-uploads", { method: "POST", body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Upload failed")
      setPoEntries((prev) =>
        prev.map((e) =>
          e.localId === entry.localId ? { ...e, status: "done", uploadId: data.id } : e
        )
      )
    } catch (err) {
      setPoEntries((prev) =>
        prev.map((e) =>
          e.localId === entry.localId
            ? { ...e, status: "error", error: err instanceof Error ? err.message : "Upload failed" }
            : e
        )
      )
    }
  }

  function handlePoFiles(files: File[]) {
    const entries: PoEntry[] = files.map((file) => ({
      localId: crypto.randomUUID(),
      filename: file.name,
      sizeMb: (file.size / 1024 / 1024).toFixed(1),
      status: "uploading",
    }))
    setPoEntries((prev) => [...prev, ...entries])
    entries.forEach((entry, i) => uploadPoFile(entry, files[i]))
  }

  function handleRemovePoEntry(entry: PoEntry) {
    if (entry.uploadId) deletePoUpload(entry.uploadId)
    setPoEntries((prev) => prev.filter((e) => e.localId !== entry.localId))
  }

  // ── Buy plan upload handlers ────────────────────────────────────────────

  async function handleBuyPlanFiles(files: File[]) {
    const file = files[0]
    if (!file) return

    // Delete the previously staged buy plan if it was a fresh upload
    if (buyPlan?.uploadId) deleteBuyPlan(buyPlan.uploadId)

    setSelectedBuyPlanId(null)
    setBuyPlan({ filename: file.name, status: "uploading" })

    const formData = new FormData()
    formData.append("file", file)
    try {
      const res = await fetch("/api/buy-plans", { method: "POST", body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Upload failed")
      setBuyPlan({ filename: file.name, status: "done", uploadId: data.id })
      setRecentBuyPlans((prev) => [data, ...prev.filter((b) => b.id !== data.id)])
      setSelectedBuyPlanId(data.id)
    } catch (err) {
      setBuyPlan({
        filename: file.name,
        status: "error",
        error: err instanceof Error ? err.message : "Upload failed",
      })
    }
  }

  function handleRemoveBuyPlan() {
    if (buyPlan?.uploadId) {
      deleteBuyPlan(buyPlan.uploadId)
      setRecentBuyPlans((prev) => prev.filter((b) => b.id !== buyPlan.uploadId))
    }
    setBuyPlan(null)
    setSelectedBuyPlanId(null)
  }

  function handleRemoveRecentBuyPlan(bp: RecentBuyPlan) {
    deleteBuyPlan(bp.id)
    setRecentBuyPlans((prev) => prev.filter((b) => b.id !== bp.id))
    if (selectedBuyPlanId === bp.id) setSelectedBuyPlanId(null)
  }

  // ── Clear all ────────────────────────────────────────────────────────────

  function handleClear() {
    // Fire deletes immediately in the background — don't await
    for (const entry of poEntries) {
      if (entry.uploadId) deletePoUpload(entry.uploadId)
    }
    if (buyPlan?.uploadId) {
      deleteBuyPlan(buyPlan.uploadId)
      setRecentBuyPlans((prev) => prev.filter((b) => b.id !== buyPlan.uploadId))
    }
    setPoEntries([])
    setBuyPlan(null)
    setSelectedBuyPlanId(null)
    setCompareError(null)
  }

  // ── Run comparison ──────────────────────────────────────────────────────

  async function handleRunComparison() {
    const poUploadIds = poEntries
      .filter((e) => e.status === "done" && e.uploadId)
      .map((e) => e.uploadId!)
    if (!poUploadIds.length || !selectedBuyPlanId) return

    setComparing(true)
    setCompareError(null)
    try {
      const res = await fetch("/api/comparisons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poUploadIds, buyPlanId: selectedBuyPlanId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Comparison failed")
      router.push(`/comparisons/${data.id}`)
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : "Comparison failed")
      setComparing(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const hasAnything = poEntries.length > 0 || !!buyPlan || !!selectedBuyPlanId

  return (
    <div className="p-8 max-w-2xl space-y-10">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Upload</h2>
        <button
          onClick={handleClear}
          disabled={!hasAnything}
          className="text-sm text-gray-500 hover:text-gray-900 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Clear all
        </button>
      </div>

      {/* ── SPS PO PDFs ─────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">SPS Purchase Order PDFs</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Select or drop multiple PDFs at once (hold ⌘ or Ctrl in the file picker)
          </p>
        </div>

        <DropZone
          onFiles={handlePoFiles}
          accept=".pdf"
          multiple
          label="Drop PDFs here or click to browse"
          sublabel="PDF · up to 10 MB per file"
        />

        {poEntries.length > 0 && (
          <ul className="space-y-1.5">
            {poEntries.map((entry) => (
              <li
                key={entry.localId}
                className="flex items-center gap-2 text-sm px-3 py-2 rounded-md bg-gray-50"
              >
                <StatusBadge status={entry.status} />
                <span className="flex-1 truncate text-gray-800">{entry.filename}</span>
                <span className="text-xs text-gray-400 shrink-0">{entry.sizeMb} MB</span>
                {entry.error && (
                  <span className="text-xs text-red-600 shrink-0">{entry.error}</span>
                )}
                <button
                  onClick={() => handleRemovePoEntry(entry)}
                  className="text-gray-300 hover:text-gray-600 transition-colors shrink-0 leading-none"
                  title="Remove"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Buy Plan ────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Buy Plan</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Excel file (.xlsx) from your planning system
          </p>
        </div>

        <DropZone
          onFiles={handleBuyPlanFiles}
          accept=".xlsx,.xls"
          label="Drop Excel file here or click to browse"
          sublabel=".xlsx or .xls · up to 20 MB"
        />

        {buyPlan && (
          <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-md bg-gray-50">
            <StatusBadge status={buyPlan.status} />
            <span className="flex-1 truncate text-gray-800">{buyPlan.filename}</span>
            {buyPlan.error && (
              <span className="text-xs text-red-600">{buyPlan.error}</span>
            )}
            <button
              onClick={handleRemoveBuyPlan}
              className="text-gray-300 hover:text-gray-600 transition-colors shrink-0 leading-none"
              title="Remove"
            >
              ×
            </button>
          </div>
        )}

        {recentBuyPlans.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-gray-500">Or select a recent upload:</p>
            {recentBuyPlans.map((bp) => (
              <div
                key={bp.id}
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-50"
              >
                <label className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer">
                  <input
                    type="radio"
                    name="buyPlan"
                    value={bp.id}
                    checked={selectedBuyPlanId === bp.id}
                    onChange={() => {
                      setSelectedBuyPlanId(bp.id)
                      setBuyPlan(null)
                    }}
                    className="text-blue-600 shrink-0"
                  />
                  <span className="flex-1 truncate text-sm text-gray-800">{bp.filename}</span>
                  <span className="text-xs text-gray-400 shrink-0">
                    {new Date(bp.uploadedAt).toLocaleDateString()}
                  </span>
                </label>
                <button
                  onClick={() => handleRemoveRecentBuyPlan(bp)}
                  className="text-gray-300 hover:text-gray-600 transition-colors shrink-0 leading-none ml-1"
                  title="Delete"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Run Comparison ───────────────────────────────────────────────── */}
      {(() => {
        const readyPoCount = poEntries.filter(
          (e) => e.status === "done" && e.uploadId
        ).length
        const canRun = readyPoCount > 0 && !!selectedBuyPlanId
        return (
          <section className="pt-2">
            <button
              onClick={handleRunComparison}
              disabled={!canRun || comparing}
              className="w-full py-2.5 px-4 rounded-md text-sm font-medium transition-colors
                bg-blue-600 text-white hover:bg-blue-700
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {comparing
                ? "Running comparison…"
                : canRun
                  ? `Run Comparison (${readyPoCount} PO${readyPoCount > 1 ? "s" : ""})`
                  : "Upload POs and select a Buy Plan to compare"}
            </button>
            {compareError && (
              <p className="mt-2 text-xs text-red-600">{compareError}</p>
            )}
          </section>
        )
      })()}
    </div>
  )
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: UploadStatus }) {
  if (status === "uploading")
    return <span className="text-blue-500 text-xs w-3 shrink-0">↑</span>
  if (status === "done")
    return <span className="text-green-500 text-xs w-3 shrink-0">✓</span>
  return <span className="text-red-500 text-xs w-3 shrink-0">✗</span>
}
