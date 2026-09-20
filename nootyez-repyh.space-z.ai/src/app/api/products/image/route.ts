import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PATCH /api/products/image {id, imageUrl}
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const id = Number(body?.id)
    if (!id) return NextResponse.json({ error: 'شناسه محصول الزامی است' }, { status: 400 })
    const existing = await db.product.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'محصول یافت نشد' }, { status: 404 })
    const imageUrl = body?.imageUrl ? String(body.imageUrl) : null
    const product = await db.product.update({ where: { id }, data: { imageUrl } })
    await db.auditLog.create({
      data: {
        userId: Number(body?.userId ?? 0),
        userName: String(body?.userName ?? 'سیستم'),
        action: 'PRODUCT_IMAGE',
        entity: 'Product',
        entityId: id,
        detail: `تصویر محصول ${existing.name} بروزرسانی شد`,
      },
    })
    return NextResponse.json(product)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
