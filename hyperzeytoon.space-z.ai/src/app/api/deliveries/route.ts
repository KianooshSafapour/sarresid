import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok } from '@/lib/server-utils'
import { isoDay } from '@/lib/jalali'

// ---------- GET: delivery queue grouped by receiving date ----------
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)

  const todayIso = isoDay(new Date())
  const orders = await db.order.findMany({
    where: { status: { in: ['APPROVED', 'SENT', 'RECEIVING'] } },
    orderBy: { receivingDate: 'asc' },
    include: {
      _count: { select: { items: true } },
      provider: { select: { color: true } },
    },
  })

  const map = (o: (typeof orders)[number]) => ({
    id: o.id,
    code: o.code,
    providerName: o.providerName,
    providerColor: o.provider?.color ?? '#8A6F3C',
    status: o.status,
    paymentType: o.paymentType,
    receivingDate: o.receivingDate,
    finalAmount: o.finalAmount,
    note: o.note,
    itemsCount: o._count.items,
  })

  const today: ReturnType<typeof map>[] = []
  const overdue: ReturnType<typeof map>[] = []
  const upcoming: ReturnType<typeof map>[] = []

  for (const o of orders) {
    const day = isoDay(o.receivingDate)
    if (day === todayIso) today.push(map(o))
    else if (day < todayIso) overdue.push(map(o))
    else upcoming.push(map(o))
  }

  // today / overdue / upcoming are already sorted by receivingDate asc
  return ok({ today, overdue, upcoming })
}
