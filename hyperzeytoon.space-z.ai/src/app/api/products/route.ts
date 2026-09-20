import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity } from '@/lib/server-utils'
import { canEditCatalog, createProductCore, normalizeName } from './shared'
import type { Prisma } from '@prisma/client'

// GET /api/products — list with filters + distinct categories
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)

  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim() || ''
  const category = url.searchParams.get('category')?.trim() || ''
  const status = url.searchParams.get('status')?.trim() || 'ACTIVE'
  const lowStock = url.searchParams.get('lowStock') === '1'
  const sort = url.searchParams.get('sort') || 'newest'
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 200, 1), 500)

  const where: Prisma.ProductWhereInput = {}
  if (status !== 'ALL') where.status = status
  if (category) where.category = category
  if (lowStock) where.stock = { lte: db.product.fields.minStock }
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { altName: { contains: q } },
      { brand: { contains: q } },
      { barcodes: { some: { code: { contains: q } } } },
    ]
  }

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    sort === 'name'
      ? { name: 'asc' }
      : sort === 'stock'
        ? { stock: 'asc' }
        : sort === 'price'
          ? { sellPrice: 'desc' }
          : { createdAt: 'desc' }

  const [products, cats] = await Promise.all([
    db.product.findMany({
      where,
      include: { barcodes: { orderBy: { isPrimary: 'desc' } } },
      orderBy,
      take: limit,
    }),
    db.product.findMany({
      where: { status: 'ACTIVE' },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    }),
  ])

  return ok({
    products,
    categories: cats.map((c) => c.category),
    total: products.length,
  })
}

// POST /api/products — create product (managers + accountant + inventory)
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user || !canEditCatalog(user)) return fail('دسترسی غیرمجاز', 403)

  const body = (await req.json()) as {
    name?: string
    category?: string
    brand?: string
    unit?: string
    sellPrice?: number
    sellPrice2?: number
    buyPrice?: number
    taxRate?: number
    stock?: number
    minStock?: number
    barcodes?: string[]
    notes?: string
  }

  const name = (body.name ?? '').trim()
  if (!name) return fail('نام کالا الزامی است')

  const result = await createProductCore(
    {
      name,
      category: body.category,
      brand: body.brand,
      unit: body.unit,
      sellPrice: body.sellPrice,
      sellPrice2: body.sellPrice2,
      buyPrice: body.buyPrice,
      taxRate: body.taxRate,
      stock: body.stock,
      minStock: body.minStock,
      barcodes: body.barcodes,
      notes: body.notes,
    },
    { id: user.id, name: user.name }
  )
  if (!result.ok) return fail(result.error || 'خطا در ایجاد کالا')

  // warn (but don't block) when an active same-name product exists
  const sameName = await db.product.findFirst({
    where: { status: 'ACTIVE', id: { not: result.id! } },
    select: { id: true, name: true },
  })
  if (sameName && normalizeName(sameName.name) === normalizeName(name)) {
    // keep both but record in notes context of activity
    await logActivity(user.id, user.name, 'هشدار کالای هم‌نام', 'Product', result.id!, sameName.name)
  }

  await logActivity(user.id, user.name, 'ایجاد کالا', 'Product', result.id!, name)
  return ok({ success: true, id: result.id })
}
