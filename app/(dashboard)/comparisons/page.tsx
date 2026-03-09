import Link from "next/link"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { DeleteComparisonButton } from "./delete-button"
import { ClearAllButton } from "./clear-all-button"

export default async function ComparisonsPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const comparisons = await db.comparison.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      createdAt: true,
      buyPlan: { select: { filename: true } },
      poUploadLinks: {
        select: { poUpload: { select: { filename: true } } },
      },
      _count: { select: { items: true } },
    },
  })

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Comparisons</h2>
        <div className="flex items-center gap-4">
          <ClearAllButton disabled={comparisons.length === 0} />
          <Link
            href="/upload"
            className="text-sm text-blue-600 hover:underline"
          >
            + New comparison
          </Link>
        </div>
      </div>

      {comparisons.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-500">
          No comparisons yet.{" "}
          <Link href="/upload" className="text-blue-600 hover:underline">
            Upload files and run one.
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
          {comparisons.map((c) => {
            const poNames = c.poUploadLinks
              .map((l) => l.poUpload.filename)
              .join(", ")
            return (
              <li key={c.id} className="flex items-stretch">
                <Link
                  href={`/comparisons/${c.id}`}
                  className="flex flex-1 items-start gap-4 px-5 py-4 hover:bg-gray-50 transition-colors min-w-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {c.buyPlan.filename}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      PO{c.poUploadLinks.length > 1 ? "s" : ""}: {poNames}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm text-gray-700">
                      {c._count.items} line{c._count.items !== 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(c.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <span className="text-gray-300 self-center">›</span>
                </Link>
                <DeleteComparisonButton id={c.id} />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
