import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// ---------- helpers ----------
const PRIORITY_ORDER: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

async function audit(
  userId: number | null | undefined,
  action: string,
  entity: string,
  entityId: number | null,
  detail?: string
) {
  let userName = 'سیستم'
  if (userId) {
    const u = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
    if (u) userName = u.name
  }
  await db.auditLog.create({
    data: { userId: userId ?? 0, userName, action, entity, entityId, detail: detail ?? null },
  })
}

async function notifyUsers(userIds: Array<number | null | undefined>, title: string, body?: string, type = 'INFO') {
  const ids = userIds.filter((x): x is number => typeof x === 'number' && x > 0)
  if (!ids.length) return
  await db.notification.createMany({ data: ids.map((userId) => ({ userId, title, body: body ?? null, type })) })
}

async function awardPoints(userId: number, points: number, reason: string, awardedById?: number | null) {
  await db.pointsLog.create({ data: { userId, points, reason, awardedById: awardedById ?? null } })
  await db.user.update({ where: { id: userId }, data: { points: { increment: points } } })
}

// attach assignedTo / createdBy users
async function withUsers<T extends { assignedToId: number; createdById: number }>(tasks: T[]) {
  const ids = [...new Set(tasks.flatMap((t) => [t.assignedToId, t.createdById]))]
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, color: true } })
  const umap = new Map(users.map((u) => [u.id, u]))
  return tasks.map((t) => ({
    ...t,
    assignedTo: umap.get(t.assignedToId) ?? null,
    createdBy: umap.get(t.createdById) ?? null,
  }))
}

// GET /api/tasks?userId=&mine=1&status=
export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams
    const userId = sp.get('userId') ? Number(sp.get('userId')) : null
    const status = sp.get('status')
    const where: { assignedToId?: number; status?: string } = {}
    if (userId) where.assignedToId = userId
    if (status) where.status = status

    const tasks = await db.task.findMany({ where, orderBy: { createdAt: 'desc' } })
    // sort: OPEN first, then priority (URGENT > HIGH > MEDIUM > LOW), then dueDate asc
    tasks.sort((a, b) => {
      const oa = a.status === 'OPEN' ? 0 : 1
      const ob = b.status === 'OPEN' ? 0 : 1
      if (oa !== ob) return oa - ob
      const pa = PRIORITY_ORDER[a.priority] ?? 2
      const pb = PRIORITY_ORDER[b.priority] ?? 2
      if (pa !== pb) return pa - pb
      const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
      const dbb = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
      return da - dbb
    })
    return NextResponse.json({ tasks: await withUsers(tasks) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// POST /api/tasks {title,description?,priority?,assignedToId,createdById,dueDate?}
export async function POST(request: Request) {
  try {
    const b = await request.json()
    const title = String(b?.title ?? '').trim()
    if (!title) return NextResponse.json({ error: 'عنوان تسک الزامی است' }, { status: 400 })
    const assignedToId = Number(b?.assignedToId)
    const createdById = Number(b?.createdById)
    if (!assignedToId || !createdById)
      return NextResponse.json({ error: 'واگذارشونده و ایجادکننده الزامی است' }, { status: 400 })
    const dueDate = b?.dueDate ? new Date(b.dueDate) : null

    const task = await db.task.create({
      data: {
        title,
        description: b?.description ? String(b.description) : null,
        priority: b?.priority ? String(b.priority) : 'MEDIUM',
        assignedToId,
        createdById,
        dueDate: dueDate && !isNaN(dueDate.getTime()) ? dueDate : null,
      },
    })
    await notifyUsers([assignedToId], 'تسک جدید به شما واگذار شد', title, 'INFO')
    await audit(createdById, 'TASK_CREATE', 'Task', task.id, `${title} — واگذار به #${assignedToId} (اولویت ${task.priority})`)
    const [withU] = await withUsers([task])
    return NextResponse.json({ task: withU })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}

// PATCH /api/tasks {id, action, userId, ...}
// actions: start | pause {pauseReason} | done | reopen | cancel | edit {title,description,priority,dueDate,assignedToId}
export async function PATCH(request: Request) {
  try {
    const b = await request.json()
    const id = Number(b?.id)
    if (!id) return NextResponse.json({ error: 'شناسه تسک الزامی است' }, { status: 400 })
    const userId = Number(b?.userId ?? 0)
    const task = await db.task.findUnique({ where: { id } })
    if (!task) return NextResponse.json({ error: 'تسک یافت نشد' }, { status: 400 })

    const action = String(b?.action ?? '')
    const now = new Date()
    let data: Record<string, unknown> = {}
    let auditAction = 'TASK_UPDATE'
    let detail = ''
    const notify: Array<{ userId: number; title: string; body?: string; type?: string }> = []

    switch (action) {
      case 'start': {
        if (task.status !== 'OPEN') return NextResponse.json({ error: 'فقط تسک باز قابل شروع است' }, { status: 400 })
        data = { status: 'IN_PROGRESS' }
        auditAction = 'TASK_START'
        detail = `شروع تسک: ${task.title}`
        if (userId !== task.assignedToId)
          notify.push({ userId: task.assignedToId, title: 'تسک شما شروع شد', body: task.title, type: 'INFO' })
        break
      }
      case 'pause': {
        if (task.status !== 'IN_PROGRESS')
          return NextResponse.json({ error: 'فقط تسک در حال اجرا قابل توقف است' }, { status: 400 })
        const pauseReason = b?.pauseReason ? String(b.pauseReason) : null
        data = { status: 'PAUSED', pauseReason }
        auditAction = 'TASK_PAUSE'
        detail = `توقف تسک: ${task.title}${pauseReason ? ` — دلیل: ${pauseReason}` : ''}`
        if (userId !== task.createdById)
          notify.push({ userId: task.createdById, title: 'تسک متوقف شد', body: `${task.title}${pauseReason ? ` — ${pauseReason}` : ''}`, type: 'WARNING' })
        break
      }
      case 'done': {
        if (task.status === 'DONE') return NextResponse.json({ error: 'این تسک قبلا انجام شده است' }, { status: 400 })
        data = { status: 'DONE', completedAt: now, pauseReason: null }
        auditAction = 'TASK_DONE'
        const pts = task.priority === 'URGENT' ? 5 : 3
        await awardPoints(task.assignedToId, pts, `انجام تسک: ${task.title}`, userId)
        detail = `انجام تسک: ${task.title} (+${pts} امتیاز)`
        if (userId !== task.createdById)
          notify.push({ userId: task.createdById, title: 'تسک انجام شد', body: `${task.title} (+${pts} امتیاز)`, type: 'SUCCESS' })
        break
      }
      case 'reopen': {
        data = { status: 'OPEN', completedAt: null, pauseReason: null }
        auditAction = 'TASK_REOPEN'
        detail = `بازگشایی تسک: ${task.title}`
        break
      }
      case 'cancel': {
        data = { status: 'CANCELLED' }
        auditAction = 'TASK_CANCEL'
        detail = `لغو تسک: ${task.title}`
        if (userId !== task.assignedToId)
          notify.push({ userId: task.assignedToId, title: 'تسک لغو شد', body: task.title, type: 'WARNING' })
        break
      }
      case 'edit': {
        const nd: Record<string, unknown> = {}
        if (b?.title !== undefined) nd.title = String(b.title).trim() || task.title
        if (b?.description !== undefined) nd.description = b.description ? String(b.description) : null
        if (b?.priority !== undefined) nd.priority = String(b.priority)
        if (b?.dueDate !== undefined) {
          const d = b.dueDate ? new Date(b.dueDate) : null
          nd.dueDate = d && !isNaN(d.getTime()) ? d : null
        }
        let newAssignee: number | null = null
        if (b?.assignedToId !== undefined && Number(b.assignedToId) && Number(b.assignedToId) !== task.assignedToId) {
          nd.assignedToId = Number(b.assignedToId)
          newAssignee = Number(b.assignedToId)
        }
        data = nd
        auditAction = 'TASK_EDIT'
        detail = `ویرایش تسک: ${String(nd.title ?? task.title)}${newAssignee ? ` — واگذاری جدید به #${newAssignee}` : ''}`
        if (newAssignee)
          notify.push({ userId: newAssignee, title: 'تسک جدید به شما واگذار شد', body: String(nd.title ?? task.title), type: 'INFO' })
        break
      }
      default:
        return NextResponse.json({ error: 'اکشن نامعتبر است' }, { status: 400 })
    }

    const updated = await db.task.update({ where: { id }, data })
    if (notify.length)
      await db.notification.createMany({
        data: notify.map((n) => ({ userId: n.userId, title: n.title, body: n.body ?? null, type: n.type ?? 'INFO' })),
      })
    await audit(userId, auditAction, 'Task', id, detail)
    const [withU] = await withUsers([updated])
    return NextResponse.json({ task: withU })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
