import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, ok, fail } from '@/lib/server-utils'

// GET /api/archive/stats — آمار بایگانی بر پایه گروه موضوعی (ISO 15489: طبقه‌بندی کارکردی)
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)

  const [binders, docs] = await Promise.all([
    db.archiveBinder.findMany({
      select: { id: true, category: true, active: true, _count: { select: { documents: true } } },
    }),
    db.archiveDocument.findMany({
      select: {
        id: true, pocket: true, docType: true, title: true, docDate: true, amount: true,
        createdAt: true, binderId: true, provider: { select: { name: true, color: true } },
        binder: { select: { code: true, title: true, color: true, location: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    }),
  ])

  // دسته‌ها از روی بایندرها (شامل بایندرهای بدون سند)
  const catMap = new Map<string, { category: string; binderCount: number; docCount: number; totalAmount: number }>()
  for (const b of binders) {
    const c = catMap.get(b.category) ?? { category: b.category, binderCount: 0, docCount: 0, totalAmount: 0 }
    if (b.active) c.binderCount += 1
    c.docCount += b._count.documents
    catMap.set(b.category, c)
  }
  const binderById = new Map(binders.map((b) => [b.id, b]))
  for (const d of docs) {
    const b = binderById.get(d.binderId)
    if (!b) continue
    const c = catMap.get(b.category)
    if (c && d.amount) c.totalAmount += d.amount
  }
  const perCategory = Array.from(catMap.values()).sort((a, b) => b.docCount - a.docCount)

  const activeBinders = binders.filter((b) => b.active).length
  const totalValue = docs.reduce((s, d) => s + (d.amount ?? 0), 0)

  const recent = docs.slice(0, 8).map((d) => ({
    id: d.id,
    pocket: d.pocket,
    docType: d.docType,
    title: d.title,
    docDate: d.docDate,
    amount: d.amount,
    createdAt: d.createdAt,
    providerName: d.provider?.name ?? null,
    binderCode: d.binder.code,
    binderTitle: d.binder.title,
    binderColor: d.binder.color,
    binderLocation: d.binder.location,
  }))

  return ok({
    totals: {
      binderCount: binders.length,
      activeBinders,
      docCount: docs.length,
      totalValue,
    },
    perCategory,
    recent,
  })
}
