import { auth } from "@/lib/auth"

export default auth

export const config = {
  // Protect everything except: NextAuth routes, Next.js internals, favicon, and login page
  matcher: ["/((?!api/auth|_next|favicon.ico|login).*)"],
}
