import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS } from '@/lib/constants'

export const dynamic = 'force-dynamic'

// GET /api/sale-orders/products?q=شیر&limit=30
// Fallback product picker for the sales section (minimal fields).
// The client tries GET /api/products first (owned by the products module);
// this route reads db.product directly as a reliable fallback.
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.SALES_FLOOR) && !canUser(session.roles, PERMISSIONS.CASHIER)) {
    return Response.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  }
  const sp = new URL(req.url).searchParams
  const q = sp.get('q')?.trim()
  const limit = Math.min(+(sp.get('limit') || 30), 100)

  const products = await db.product.findMany({
    where: {
      active: true,
      mergedInto: null,
      ...(q ? { OR: [{ name: { contains: q } }, { barcode: { contains: q } }] } : {}),
    },
    select: { id: true, name: true, price: true, stock: true, unit: true, barcode: true, image: true },
    orderBy: { name: 'asc' },
    take: limit,
  })
  return Response.json(products)
}
