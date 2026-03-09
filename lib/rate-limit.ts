// In-memory login rate limiter.
// Keyed by "ip:email" — survives hot-reloads in dev via globalThis.

const WINDOW_MS = 15 * 60 * 1000 // 15 minutes
export const MAX_LOGIN_ATTEMPTS = 5

type Entry = { count: number; resetAt: number }

const g = globalThis as typeof globalThis & { __loginAttempts?: Map<string, Entry> }
if (!g.__loginAttempts) g.__loginAttempts = new Map()
const store = g.__loginAttempts

// Periodic cleanup so the map doesn't grow unbounded
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key)
  }
}, 60 * 60 * 1000 /* hourly */)

export function makeLoginKey(ip: string, email: string): string {
  return `${ip}:${email.toLowerCase().trim()}`
}

/** Record one attempt. Returns true if the attempt is allowed (under the limit). */
export function recordLoginAttempt(key: string): boolean {
  const now = Date.now()
  let entry = store.get(key)
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + WINDOW_MS }
    store.set(key, entry)
  }
  entry.count++
  return entry.count <= MAX_LOGIN_ATTEMPTS
}

/** Check without incrementing — is this key currently locked out? */
export function isLoginRateLimited(key: string): boolean {
  const now = Date.now()
  const entry = store.get(key)
  if (!entry || entry.resetAt <= now) return false
  return entry.count >= MAX_LOGIN_ATTEMPTS
}

/** Reset the counter after a successful login. */
export function resetLoginAttempts(key: string): void {
  store.delete(key)
}
