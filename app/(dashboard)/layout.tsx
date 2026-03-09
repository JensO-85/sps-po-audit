import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { Sidebar } from "@/components/sidebar"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect("/login")

  // Show the Users link if the user is admin, OR if no admins exist yet (bootstrap)
  const showAdminLink =
    session.user.isAdmin ||
    (await db.user.count({ where: { isAdmin: true } })) === 0

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        userEmail={session.user.email}
        userName={session.user.name}
        isAdmin={showAdminLink}
      />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
