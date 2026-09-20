import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity, notify } from '@/lib/server-utils'
import { isoDay } from '@/lib/jalali'

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const url = new URL(req.url)
  const mine = url.searchParams.get('mine') === '1'

  const where = mine ? { assignedToId: user.id } : {}
  const tasks = await db.task.findMany({
    where,
    include: {
      assignee: { select: { name: true, color: true } },
      updates: { orderBy: { createdAt: 'desc' }, take: 3 },
    },
    orderBy: [{ createdAt: 'desc' }],
    take: 300,
  })

  // stats over the returned scope (personal when mine=1, global for managers)
  const scopedWhere = mine ? { assignedToId: user.id } : {}
  const [open, inProgress, doneToday, overdue] = await Promise.all([
    db.task.count({ where: { ...scopedWhere, status: 'TODO' } }),
    db.task.count({ where: { ...scopedWhere, status: { in: ['IN_PROGRESS', 'FOLLOW_UP'] } } }),
    db.task.count({ where: { ...scopedWhere, status: 'DONE', updatedAt: { gte: startOfToday() } } }),
    db.task.count({
      where: { ...scopedWhere, status: { not: 'DONE' }, dueDate: { lt: new Date() } },
    }),
  ])

  // active tasks first, then by due date
  const sorted = [...tasks].sort((a, b) => {
    const ad = a.status === 'DONE' ? 1 : 0
    const bd = b.status === 'DONE' ? 1 : 0
    if (ad !== bd) return ad - bd
    if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    if (a.dueDate) return -1
    if (b.dueDate) return 1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return ok({
    tasks: sorted.map((t) => ({
      ...t,
      assigneeName: t.assignee?.name ?? null,
      assigneeColor: t.assignee?.color ?? null,
      assignee: undefined,
    })),
    stats: { open, inProgress, doneToday, overdue },
    today: isoDay(new Date()),
  })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  // managers or the store owner can create tasks
  const isOwner = user.roleKeys.includes('owner')
  if (!user.isManager && !isOwner) return fail('دسترسی غیرمجاز', 403)

  const body = (await req.json().catch(() => ({}))) as {
    title?: string
    description?: string
    category?: string
    priority?: string
    assignedToId?: string
    dueDate?: string
    sopId?: string
  }
  if (!body.title?.trim()) return fail('عنوان کار الزامی است')

  const created = await db.task.create({
    data: {
      title: body.title.trim(),
      description: body.description?.trim() || null,
      category: body.category?.trim() || 'عمومی',
      priority: body.priority || 'MEDIUM',
      fromOwner: isOwner,
      createdById: user.id,
      assignedToId: body.assignedToId || null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      sopId: body.sopId || null,
    },
  })

  if (created.assignedToId && created.assignedToId !== user.id) {
    await notify(created.assignedToId, 'کار جدید برای شما 🌿', `${created.title}`, 'INFO', 'tasks')
  }
  await logActivity(user.id, user.name, 'ایجاد کار', 'Task', created.id, created.title)
  return ok({ success: true, id: created.id })
}
