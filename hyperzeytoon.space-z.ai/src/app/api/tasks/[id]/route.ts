import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity, notify } from '@/lib/server-utils'

type Ctx = { params: Promise<{ id: string }> }

const ASSIGNEE_STATUSES = ['IN_PROGRESS', 'FOLLOW_UP', 'PAUSED', 'DONE']

async function grantAward(userId: string, points: number, reason: string, grantedById?: string) {
  await db.award.create({ data: { userId, points, reason, grantedById: grantedById ?? null } })
  await db.user.update({ where: { id: userId }, data: { points: { increment: points } } })
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const { id } = await ctx.params
  const task = await db.task.findUnique({
    where: { id },
    include: {
      assignee: { select: { name: true, color: true } },
      updates: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!task) return fail('کار یافت نشد', 404)
  if (!user.isManager && task.assignedToId !== user.id && task.createdById !== user.id)
    return fail('دسترسی غیرمجاز', 403)
  return ok({
    task: {
      ...task,
      assigneeName: task.assignee?.name ?? null,
      assigneeColor: task.assignee?.color ?? null,
      assignee: undefined,
    },
  })
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const { id } = await ctx.params
  const task = await db.task.findUnique({ where: { id } })
  if (!task) return fail('کار یافت نشد', 404)

  const isAssignee = task.assignedToId === user.id
  const isCreator = task.createdById === user.id
  if (!user.isManager && !isAssignee && !isCreator) return fail('دسترسی غیرمجاز', 403)

  const body = (await req.json().catch(() => ({}))) as {
    status?: string
    pauseReason?: string
    assignedToId?: string
    dueDate?: string | null
    priority?: string
    title?: string
    description?: string
    updateContent?: string
  }

  const data: Record<string, unknown> = {}

  // task update thread (comment)
  if (body.updateContent?.trim()) {
    await db.taskUpdate.create({
      data: { taskId: task.id, userId: user.id, userName: user.name, content: body.updateContent.trim() },
    })
    // inform the other side of the conversation
    const otherId = isAssignee ? task.createdById : task.assignedToId
    if (otherId && otherId !== user.id) {
      await notify(otherId, 'یادداشت جدید روی کار 💬', `${task.title}: ${body.updateContent.trim().slice(0, 60)}`, 'INFO', 'tasks')
    }
  }

  if (body.status !== undefined) {
    if (user.isManager) {
      data.status = body.status
      if (body.status !== 'PAUSED') data.pauseReason = null
      else if (body.pauseReason) data.pauseReason = body.pauseReason
    } else if (isAssignee) {
      if (!ASSIGNEE_STATUSES.includes(body.status)) return fail('این وضعیت برای شما مجاز نیست', 403)
      data.status = body.status
      if (body.status === 'PAUSED') {
        if (!body.pauseReason?.trim()) return fail('برای توقف کار، دلیل آن را بنویسید')
        data.pauseReason = body.pauseReason.trim()
      } else {
        data.pauseReason = null
      }
    } else {
      return fail('فقط مجری کار می‌تواند وضعیت را تغییر دهد', 403)
    }
  }

  // managers can edit everything
  if (user.isManager) {
    if (body.assignedToId !== undefined) data.assignedToId = body.assignedToId || null
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null
    if (body.priority) data.priority = body.priority
    if (body.title?.trim()) data.title = body.title.trim()
    if (body.description !== undefined) data.description = body.description?.trim() || null
  } else if (isAssignee && body.dueDate !== undefined && !isCreator) {
    return fail('تغییر موعد کار فقط توسط مدیران ممکن است', 403)
  }

  const wasDone = task.status === 'DONE'
  const updated = await db.task.update({ where: { id: task.id }, data })

  // celebration: first time moving to DONE → award +5 to the assignee
  if (!wasDone && updated.status === 'DONE' && updated.assignedToId) {
    await grantAward(updated.assignedToId, 5, `تکمیل کار: ${updated.title}`, user.id)
    await notify(updated.assignedToId, 'آفرین! +۵ امتیاز ⭐', `${updated.title} با موفقیت انجام شد`, 'SUCCESS', 'team')
    if (updated.createdById && updated.createdById !== user.id) {
      await notify(updated.createdById, 'کار انجام شد ✅', `${updated.title} توسط مجری تکمیل شد`, 'SUCCESS', 'tasks')
    }
  }

  await logActivity(
    user.id,
    user.name,
    body.updateContent ? 'ثبت یادداشت کار' : 'بروزرسانی کار',
    'Task',
    task.id,
    data.status ? `${task.title} → ${data.status}` : task.title
  )
  return ok({ success: true })
}
