import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const db = new PrismaClient()

async function main() {
  const passwordHash = await bcrypt.hash("changeme123", 12)

  const admin = await db.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      name: "Admin",
      passwordHash,
    },
  })

  console.log("✓ Seeded user:", admin.email)
  console.log("  Default password: changeme123")
  console.log("  Change this before sharing access with anyone.")
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
