import { PrismaClient } from '@prisma/client'
import { createRequire } from 'module'
import path from 'path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

/**
 * Schema-drift guard for a long-running dev process (Task 12-a).
 *
 * When `prisma db push + generate` runs WHILE the dev server is already up,
 * the running process keeps the previously generated client in its module
 * cache — new models (e.g. DemoCompany, ShrinkageLog) stay `undefined` on the
 * cached instance and queries 500. Restarting the server fixes it, but to
 * avoid disrupting a shared hot-reloading environment, this helper detects the
 * missing model, busts the Node require-cache for the generated client, loads
 * the fresh one from disk and reuses it (stored on globalThis so later
 * consumers share the same instance).
 *
 * Usage in routes that touch NEW models:
 *   const conn = ensurePrismaModel('demoCompany')   // returns db if fresh
 *   await conn.demoCompany.findFirst(...)
 */
export function ensurePrismaModel(model: string): PrismaClient {
  for (const candidate of [globalForPrisma.prisma, db]) {
    if (candidate && typeof (candidate as unknown as Record<string, unknown>)[model] === 'object' && (candidate as unknown as Record<string, unknown>)[model] !== null) {
      return candidate
    }
  }
  try {
    const nodeRequire = createRequire(path.join(process.cwd(), 'package.json'))
    for (const key of Object.keys(nodeRequire.cache)) {
      if (key.includes('.prisma/client') || key.includes('@prisma/client')) {
        delete nodeRequire.cache[key]
      }
    }
    const fresh = new (nodeRequire('@prisma/client') as typeof import('@prisma/client')).PrismaClient({
      log: ['query'],
    })
    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = fresh
    return fresh
  } catch {
    // best effort — fall back to the cached client
    return db
  }
}
