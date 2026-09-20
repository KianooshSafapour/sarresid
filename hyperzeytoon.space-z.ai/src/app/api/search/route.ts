import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok } from '@/lib/server-utils'

interface SearchHit {
  type: 'product' | 'order' | 'customer' | 'staff' | 'cheque' | 'action' | 'stockcount'
  id: string
  title: string
  subtitle?: string
  section: string
}

// Global quick search — products, orders, customers, staff, cheques + quick actions
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const q = (new URL(req.url).searchParams.get('q') || '').trim()
  if (q.length < 2) return ok({ hits: [] as SearchHit[] })

  const [products, orders, customers, staff, cheques, stockCounts] = await Promise.all([
    db.product.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { name: { contains: q } },
          { altName: { contains: q } },
          { brand: { contains: q } },
          { barcodes: { some: { code: { contains: q } } } },
        ],
      },
      include: { barcodes: true },
      take: 6,
      orderBy: { name: 'asc' },
    }),
    db.order.findMany({
      where: {
        OR: [{ code: { contains: q } }, { providerName: { contains: q } }],
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
    }),
    db.customer.findMany({
      where: {
        OR: [{ name: { contains: q } }, { phone: { contains: q } }],
      },
      take: 4,
      orderBy: { name: 'asc' },
    }),
    // staff visible only to managers (privacy)
    user.isManager
      ? db.user.findMany({
          where: { active: true, OR: [{ name: { contains: q } }, { title: { contains: q } }, { username: { contains: q } }] },
          take: 4,
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([]),
    user.isManager
      ? db.cheque.findMany({
          where: { OR: [{ number: { contains: q } }, { payeeName: { contains: q } }] },
          take: 4,
          orderBy: { dueDate: 'asc' },
        })
      : Promise.resolve([]),
    // count sessions (inventory + managers) — by code or category
    user.isManager || user.roleKeys.includes('inventory')
      ? db.stockCount.findMany({
          where: { OR: [{ code: { contains: q } }, { category: { contains: q } }] },
          take: 3,
          orderBy: { createdAt: 'desc' },
          select: { id: true, code: true, status: true, scope: true, category: true },
        })
      : Promise.resolve([]),
  ])

  const hits: SearchHit[] = [
    ...products.map((p) => ({
      type: 'product' as const,
      id: p.id,
      title: p.name,
      subtitle: `${p.category}${p.brand ? ' — ' + p.brand : ''} · موجودی ${p.stock}`,
      section: 'products',
    })),
    ...orders.map((o) => ({
      type: 'order' as const,
      id: o.id,
      title: o.code,
      subtitle: `${o.providerName} · ${o.status === 'DONE' ? 'تکمیل شده' : 'در جریان'}`,
      section: 'orders',
    })),
    ...customers.map((c) => ({
      type: 'customer' as const,
      id: c.id,
      title: c.name,
      subtitle: c.phone ?? 'مشتری',
      section: 'customers',
    })),
    ...staff.map((s) => ({
      type: 'staff' as const,
      id: s.id,
      title: s.name,
      subtitle: s.title,
      section: 'team',
    })),
    ...cheques.map((c) => ({
      type: 'cheque' as const,
      id: c.id,
      title: `چک ${c.number}`,
      subtitle: `${c.payeeName}`,
      section: 'payments',
    })),
    ...stockCounts.map((s) => ({
      type: 'stockcount' as const,
      id: s.id,
      title: `جرد ${s.code}`,
      subtitle: `${s.scope === 'CATEGORY' ? `دسته ${s.category}` : 'همه محصولات'} · ${s.status === 'IN_PROGRESS' ? 'در جریان' : s.status === 'COMMITTED' ? 'بسته‌شده' : 'لغوشده'}`,
      section: 'stock-count',
    })),
  ]

  // quick actions matching the query
  const actions: { match: string[]; hit: SearchHit }[] = [
    { match: ['سفارش'], hit: { type: 'action', id: 'new-order', title: 'ثبت سفارش جدید', subtitle: 'سفارش‌ساز سه‌مرحله‌ای', section: 'orders' } },
    { match: ['تحویل'], hit: { type: 'action', id: 'deliveries', title: 'تحویل‌های امروز', subtitle: 'صف دریافت توزیع', section: 'deliveries' } },
    { match: ['چک', 'پرداخت'], hit: { type: 'action', id: 'cheques', title: 'تقویم چک‌ها', subtitle: 'سررسیدها و امضاها', section: 'payments' } },
    { match: ['گزارش', 'آمار', 'فروش'], hit: { type: 'action', id: 'reports', title: 'گزارش‌ها و تحلیل', subtitle: 'نمودارهای فروش و عملکرد', section: 'reports' } },
    { match: ['کار'], hit: { type: 'action', id: 'tasks', title: 'کارهای من', subtitle: 'وظایف واگذارشده', section: 'tasks' } },
    ...(user.isManager || user.roleKeys.includes('inventory')
      ? [{ match: ['جرد', 'شمارش'], hit: { type: 'action' as const, id: 'stock-count', title: 'جرد انبار', subtitle: 'شمارش و اصلاح موجودی', section: 'stock-count' } }]
      : []),
  ]
  for (const a of actions) {
    if (a.match.some((m) => q.includes(m))) hits.unshift(a.hit)
  }

  return ok({ hits: hits.slice(0, 14) })
}
