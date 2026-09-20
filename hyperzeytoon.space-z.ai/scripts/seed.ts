/**
 * Hyper Zeytoon — seed script (thin wrapper)
 * Run: bun run scripts/seed.ts
 * Idempotent: wipes tables then re-seeds the real Hyper Zeytoon dataset.
 * The full seeding logic lives in src/lib/demo/seed-core.ts so that the
 * platform itself can also restore real data (demo-mode exit) via API.
 */
import { PrismaClient } from '@prisma/client'
import { seedRealData } from '../src/lib/demo/seed-core'

const db = new PrismaClient()

seedRealData(db)
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
