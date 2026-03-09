import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { CreateUserForm, UserRow } from "./users-client"

export default async function AdminUsersPage() {
  const session = await auth()
  if (!session) redirect("/login")

  // Allow access if user is admin OR if no admins exist yet (bootstrap)
  const adminCount = await db.user.count({ where: { isAdmin: true } })
  if (!session.user.isAdmin && adminCount > 0) redirect("/")

  const users = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, isAdmin: true, createdAt: true },
  })

  const isBootstrap = adminCount === 0

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900">Users</h2>
        <p className="text-xs text-gray-500 mt-0.5">Manage who has access to this app</p>
      </div>

      {/* User list */}
      <div className="mb-10">
        {users.length === 0 ? (
          <p className="text-sm text-gray-500">No users yet.</p>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 font-medium">Created</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <UserRow
                    key={user.id}
                    user={{ ...user, createdAt: user.createdAt.toISOString() }}
                    currentUserId={session.user.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create user form */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Add a user</h3>
        <CreateUserForm isBootstrap={isBootstrap} />
      </div>
    </div>
  )
}
