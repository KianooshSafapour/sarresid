import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/products?q=&category=&supplierId=&low=1&limit=500
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim() ?? ''
    const category = searchParams.get('category')?.trim() ?? ''
    const supplierId = searchParams.get('supplierId')?.trim() ?? ''
    const low = searchParams.get('low') === '1'
    const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? 500) || 500, 1), 5000)

    const where: Record<string, unknown> = {}
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { nameFa: { contains: q } },
        { barcode: { contains: q } },
      ]
    }
    if (category) where.category = category
    if (supplierId) where.supplierId = Number(supplierId)
    // low stock can't compare two columns in Prisma filter — post-filter below

    const products = await db.product.findMany({
      where,
      include: { company: { select: { id: true, name: true } }, supplier: { select: { id: true, name: true } } },
      orderBy: { id: 'asc' },
      take: low ? 2000 : limit,
    })

    const filtered = low
      ? products.filter((p) => !p.mergedInto && p.stock <= p.minStock).slice(0, limit)
      : products

    const catRows = await db.product.findMany({
      where: { category: { not: null } },
      select: { category: true },
      distinct: ['category'],
    })
    const categories = catRows.map((r) => r.category as string).sort((a, b) => a.localeCompare(b, 'fa'))

    return NextResponse.json({ products: filtered, categories })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// POST /api/products {name,barcode,buyPrice,sellPrice,...}
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const name = String(body?.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'نام محصول الزامی است' }, { status: 400 })
    const product = await db.product.create({
      data: {
        name,
        nameFa: body?.nameFa ? String(body.nameFa) : null,
        barcode: body?.barcode ? String(body.barcode) : null,
        companyId: body?.companyId ? Number(body.companyId) : null,
        supplierId: body?.supplierId ? Number(body.supplierId) : null,
        buyPrice: Number(body?.buyPrice ?? 0),
        sellPrice: Number(body?.sellPrice ?? 0),
        sellPrice2: body?.sellPrice2 != null ? Number(body.sellPrice2) : null,
        shelfLifeDays: body?.shelfLifeDays != null && Number(body.shelfLifeDays) > 0 ? Math.round(Number(body.shelfLifeDays)) : null,
        unit: String(body?.unit ?? 'عدد'),
        stock: Number(body?.stock ?? 0),
        minStock: Number(body?.minStock ?? 10),
        imageUrl: body?.imageUrl ? String(body.imageUrl) : null,
        category: body?.category ? String(body.category) : null,
        active: body?.active === undefined ? true : Boolean(body.active),
      },
    })
    await db.auditLog.create({
      data: {
        userId: Number(body?.userId ?? 0),
        userName: String(body?.userName ?? 'سیستم'),
        action: 'PRODUCT_CREATE',
        entity: 'Product',
        entityId: product.id,
        detail: `محصول جدید: ${product.name}`,
      },
    })
    return NextResponse.json(product)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}

// PATCH /api/products {id, ...fields}
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const id = Number(body?.id)
    if (!id) return NextResponse.json({ error: 'شناسه محصول الزامی است' }, { status: 400 })
    const existing = await db.product.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'محصول یافت نشد' }, { status: 404 })
    const data: Record<string, unknown> = {}
    if (body?.name !== undefined) data.name = String(body.name).trim()
    if (body?.nameFa !== undefined) data.nameFa = body.nameFa ? String(body.nameFa) : null
    if (body?.barcode !== undefined) data.barcode = body.barcode ? String(body.barcode) : null
    if (body?.companyId !== undefined) data.companyId = body.companyId ? Number(body.companyId) : null
    if (body?.supplierId !== undefined) data.supplierId = body.supplierId ? Number(body.supplierId) : null
    if (body?.buyPrice !== undefined) data.buyPrice = Number(body.buyPrice)
    if (body?.sellPrice !== undefined) data.sellPrice = Number(body.sellPrice)
    if (body?.sellPrice2 !== undefined) data.sellPrice2 = body.sellPrice2 != null ? Number(body.sellPrice2) : null
    if (body?.unit !== undefined) data.unit = String(body.unit)
    if (body?.stock !== undefined) data.stock = Number(body.stock)
    if (body?.minStock !== undefined) data.minStock = Number(body.minStock)
    if (body?.imageUrl !== undefined) data.imageUrl = body.imageUrl ? String(body.imageUrl) : null
    if (body?.category !== undefined) data.category = body.category ? String(body.category) : null
    if (body?.active !== undefined) data.active = Boolean(body.active)
    if (body?.mergedInto !== undefined) data.mergedInto = body.mergedInto ? Number(body.mergedInto) : null
    if (body?.shelfLifeDays !== undefined) data.shelfLifeDays = body.shelfLifeDays != null && Number(body.shelfLifeDays) > 0 ? Math.round(Number(body.shelfLifeDays)) : null
    const product = await db.product.update({ where: { id }, data })
    await db.auditLog.create({
      data: {
        userId: Number(body?.userId ?? 0),
        userName: String(body?.userName ?? 'سیستم'),
        action: 'PRODUCT_UPDATE',
        entity: 'Product',
        entityId: id,
        detail: `ویرایش محصول ${existing.name}`,
      },
    })
    return NextResponse.json(product)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
