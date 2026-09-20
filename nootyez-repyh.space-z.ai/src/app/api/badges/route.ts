import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

const ZERO = { orders: 0, deliveries: 0, tasksMine: 0, messagesUnread: 0, cheques: 0, notifications: 0 }

// GET /api/badges?userId= → per-user live counts for sidebar badge pills.
// Never 500: invalid/missing userId or any DB error returns zeros (safe for logged-out transitions).
export async function GET(request: Request) {
  try {
    const userId = Number(new URL(request.url).searchParams.get('userId'))
    if (!Number.isFinite(userId) || userId <= 0) return NextResponse.json(ZERO)

    const now = new Date()
    const in7Days = new Date(now.getTime() + 7 * 24 * 3600 * 1000)

    const [orders, deliveries, tasksMine, messagesUnread, cheques, notifications] = await Promise.all([
      // active pipeline (not yet received)
      db.order.count({ where: { status: { in: ['DRAFT', 'SUBMITTED', 'APPROVED'] } } }),
      // needs receiving / confirming
      db.order.count({ where: { status: { in: ['APPROVED', 'RECEIVED'] } } }),
      db.task.count({ where: { assignedToId: userId, status: { in: ['OPEN', 'IN_PROGRESS', 'PAUSED'] } } }),
      db.message.count({
        where: {
          readAt: null,
          senderId: { not: userId },
          conversation: { is: { OR: [{ userAId: userId }, { userBId: userId }] } },
        },
      }),
      db.cheque.count({
        where: {
          OR: [
            { status: 'PENDING_APPROVAL' },
            { status: { in: ['WRITTEN', 'SIGNED', 'GIVEN'] }, dueDate: { lte: in7Days } },
          ],
        },
      }),
      db.notification.count({ where: { userId, readAt: null } }),
    ])

    return NextResponse.json({ orders, deliveries, tasksMine, messagesUnread, cheques, notifications })
  } catch {
    return NextResponse.json(ZERO)
  }
}
