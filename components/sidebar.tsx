"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/upload", label: "Upload" },
  { href: "/comparisons", label: "Comparisons" },
]

interface SidebarProps {
  userEmail: string
  userName: string | null
  isAdmin?: boolean
}

export function Sidebar({ userEmail, userName, isAdmin }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
      <div className="p-4 border-b border-gray-200 space-y-3">
        <span className="font-semibold text-gray-900 text-sm">
          SPS PO Audit
        </span>
        <div className="flex justify-center">
          <Image
            src="/ap-home-logo.jpg"
            alt="AP Home"
            width={64}
            height={64}
            className="rounded-sm"
            priority
          />
        </div>
      </div>

      <nav className="flex-1 p-2 space-y-0.5">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center px-3 py-2 text-sm rounded-md transition-colors",
              pathname === item.href || pathname.startsWith(item.href + "/")
                ? "bg-gray-100 text-gray-900 font-medium"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            )}
          >
            {item.label}
          </Link>
        ))}
        {isAdmin && (
          <Link
            href="/admin/users"
            className={cn(
              "flex items-center px-3 py-2 text-sm rounded-md transition-colors",
              pathname.startsWith("/admin")
                ? "bg-gray-100 text-gray-900 font-medium"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            )}
          >
            Users
          </Link>
        )}
      </nav>

      <div className="p-4 border-t border-gray-200 space-y-2">
        <div>
          <p className="text-xs font-medium text-gray-900 truncate">
            {userName ?? userEmail}
          </p>
          {userName && (
            <p className="text-xs text-gray-500 truncate">{userEmail}</p>
          )}
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
