import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Keep pdf-parse out of the webpack bundle — it reads test files at import
  // time which breaks in bundled environments. Marking it external lets Node
  // require() it normally at runtime in API routes.
  serverExternalPackages: ["pdf-parse", "exceljs"],
}

export default nextConfig
