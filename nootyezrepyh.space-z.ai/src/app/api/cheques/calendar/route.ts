import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { dateToJalali, jalaliMonthLength, pad2 } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

// GET /api/cheques/calendar?jy=1404&jm=8
// Returns cheques of the Jalali month grouped by day for the calendar view
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.VIEW_CHEQUES)) { // read-level: MANAGE/APPROVE/ACCOUNTING/VIEW all imply read
    return Response.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  }
  const sp = new URL(req.url).searchParams
  const today = dateToJalali()
  const jy = Number(sp.get('jy')) || today.jy
  const jm = Number(sp.get('jm')) || today.jm

  const prefix = `${jy}/${pad2(jm)}/`
  const cheques = await db.cheque.findMany({
    where: {
      dueDate: { startsWith: prefix },
      status: { notIn: ['REJECTED'] },
    },
    select: {
      id: true, amount: true, dueDate: true, status: true,
      payeeName: true, purpose: true,
    },
    orderBy: { dueDate: 'asc' },
  })

  const days: Record<string, { date: string; total: number; count: number; cheques: typeof cheques }> = {}
  for (const c of cheques) {
    if (!days[c.dueDate]) days[c.dueDate] = { date: c.dueDate, total: 0, count: 0, cheques: [] }
    days[c.dueDate].total += c.amount
    days[c.dueDate].count += 1
    days[c.dueDate].cheques.push(c)
  }

  return Response.json({
    jy,
    jm,
    monthLength: jalaliMonthLength(jy, jm),
    days: Object.values(days),
    monthTotal: cheques.reduce((s, c) => s + c.amount, 0),
  })
}
