import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/companies → companies with products + suppliers
export async function GET() {
  try {
    const companies = await db.company.findMany({
      include: {
        products: {
          select: { id: true, name: true, stock: true, minStock: true, sellPrice: true, imageUrl: true, active: true },
          orderBy: { name: 'asc' },
        },
        suppliers: { include: { supplier: true } },
      },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ companies })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// POST /api/companies {name, note?}
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const name = String(body?.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'نام شرکت الزامی است' }, { status: 400 })
    const company = await db.company.create({
      data: { name, note: body?.note ? String(body.note) : null },
    })
    await db.auditLog.create({
      data: {
        userId: Number(body?.userId ?? 0),
        userName: String(body?.userName ?? 'سیستم'),
        action: 'COMPANY_CREATE',
        entity: 'Company',
        entityId: company.id,
        detail: `شرکت جدید: ${company.name}`,
      },
    })
    return NextResponse.json(company)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}

// PATCH /api/companies {id, name, note?}
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const id = Number(body?.id)
    if (!id) return NextResponse.json({ error: 'شناسه شرکت الزامی است' }, { status: 400 })
    const existing = await db.company.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'شرکت یافت نشد' }, { status: 404 })
    const data: Record<string, unknown> = {}
    if (body?.name !== undefined) data.name = String(body.name).trim()
    if (body?.note !== undefined) data.note = body.note ? String(body.note) : null
    const company = await db.company.update({ where: { id }, data })
    await db.auditLog.create({
      data: {
        userId: Number(body?.userId ?? 0),
        userName: String(body?.userName ?? 'سیستم'),
        action: 'COMPANY_UPDATE',
        entity: 'Company',
        entityId: id,
        detail: `ویرایش شرکت ${existing.name} → ${company.name}`,
      },
    })
    return NextResponse.json(company)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
