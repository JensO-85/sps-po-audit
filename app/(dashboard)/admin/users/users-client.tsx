"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { signOut } from "next-auth/react"

type User = {
  id: string
  email: string
  name: string | null
  isAdmin: boolean
  createdAt: string
}

// ── Create user form ──────────────────────────────────────────────────────────

export function CreateUserForm({ isBootstrap }: { isBootstrap: boolean }) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdEmail, setCreatedEmail] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password, isAdmin }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to create user")

      if (isBootstrap) {
        // Don't refresh — the page would redirect because session.isAdmin is still false.
        // Instead show a success state with instructions.
        setCreatedEmail(email)
      } else {
        setEmail("")
        setName("")
        setPassword("")
        setIsAdmin(false)
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user")
    } finally {
      setLoading(false)
    }
  }

  // Bootstrap success state
  if (isBootstrap && createdEmail) {
    return (
      <div className="px-4 py-4 bg-green-50 border border-green-200 rounded-md space-y-3">
        <p className="text-sm font-medium text-green-800">
          User <span className="font-mono">{createdEmail}</span> created successfully.
        </p>
        <p className="text-sm text-green-700">
          Sign out and log back in with that account to manage users.
        </p>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="px-3 py-1.5 text-sm font-medium text-white bg-green-700 rounded-md hover:bg-green-800"
        >
          Sign out now
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isBootstrap && (
        <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
          No admins exist yet. Create the first admin account, then sign out and log in with it.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-700">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Jane Smith"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-700">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="jane@example.com"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-700">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="Min 8 characters"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isAdmin"
          checked={isAdmin}
          onChange={(e) => setIsAdmin(e.target.checked)}
          className="text-blue-600"
        />
        <label htmlFor="isAdmin" className="text-sm text-gray-700">
          Admin (can manage users)
        </label>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? "Creating…" : "Create user"}
      </button>
    </form>
  )
}

// ── User row with delete button ───────────────────────────────────────────────

export function UserRow({ user, currentUserId }: { user: User; currentUserId: string }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirm(`Delete ${user.email}? This cannot be undone.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to delete user")
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete user")
      setDeleting(false)
    }
  }

  const isSelf = user.id === currentUserId

  return (
    <tr className="border-t border-gray-100">
      <td className="px-4 py-3 text-sm text-gray-900">{user.name ?? "—"}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
      <td className="px-4 py-3">
        {user.isAdmin ? (
          <span className="inline-block px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
            Admin
          </span>
        ) : (
          <span className="inline-block px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded">
            User
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-gray-400">
        {new Date(user.createdAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </td>
      <td className="px-4 py-3 text-right">
        {!isSelf && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs text-red-600 hover:text-red-800 disabled:opacity-40"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        )}
      </td>
    </tr>
  )
}
