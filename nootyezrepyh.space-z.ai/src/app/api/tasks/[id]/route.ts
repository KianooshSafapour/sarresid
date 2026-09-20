import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit, logHistory } from '@/lib/audit'
import { canUser, PERMISSIONS, ACTIVITY_TYPES } from '@/lib/constants'

type Params = { params: Promise<{ id: string }> }

const VALID_STATUSES = ['TODO', 'IN_PROGRESS', 'FOLLOW_UP', 'DONE']

/** PATCH /api/tasks/[id]
 * body: { status?, blockedNote?, checklist?, title?, description?, priority?, dueDate?, assignedTo?, assigneeType? }
 * - status DONE → creates TASK_DONE Activity + increments user.points + TASK_HISTORY
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  const { id } = await params

  const task = await db.task.findUnique({ where: { id } })
  if (!task) return Response.json({ error: 'وظیفه یافت نشد' }, { status: 404 })

  const isManager = canUser(session.roles, PERMISSIONS.MANAGE_TASKS)
  const isAssignee = task.assigneeType === 'USER' ? task.assignedTo === session.id : session.roles.includes(task.assignedTo)
  if (!isManager && !isAssignee) {
    return Response.json({ error: 'اجازه تغییر این وظیفه را ندارید' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as {
    status?: string
    blockedNote?: string
    checklist?: { text?: string; done?: boolean }[]
    title?: string
    description?: string
    priority?: string
    dueDate?: string
    assignedTo?: string
    assigneeType?: string
  } | null
  if (!body) return Response.json({ error: 'بدنه درخواست نامعتبر' }, { status: 400 })

  const data: Record<string, unknown> = {}
  let pointsAwarded = 0

  // --- status change ---
  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return Response.json({ error: 'وضعیت نامعتبر' }, { status: 400 })
    }
    if (body.status === 'FOLLOW_UP' && !body.blockedNote?.trim() && !task.blockedNote) {
      return Response.json({ error: 'برای پیگیری، توضیح مشکل لازم است' }, { status: 400 })
    }
    data.status = body.status
    if (body.status === 'DONE' && task.status !== 'DONE') {
      data.completedAt = new Date()
    }
    if (body.status === 'TODO' || body.status === 'IN_PROGRESS' || body.status === 'DONE') {
      if (body.blockedNote !== undefined) data.blockedNote = body.blockedNote.trim() || null
      else if (body.status !== 'DONE') data.blockedNote = null
    }
    if (body.blockedNote !== undefined) data.blockedNote = body.blockedNote.trim() || null

    // celebration: award points + activity + history (server-side truth)
    if (body.status === 'DONE' && task.status !== 'DONE') {
      const points = ACTIVITY_TYPES.TASK_DONE.defaultPoints
      const activity = await db.activity.create({
        data: {
          userId: session.id,
          type: 'TASK_DONE',
          title: `انجام وظیفه: ${task.title}`,
          points,
        },
      })
      await db.user.update({ where: { id: session.id }, data: { points: { increment: points } } })
      pointsAwarded = points
      await logAudit(session.id, session.name, 'ACTIVITY_CREATE', 'ACTIVITY', activity.id, { type: 'TASK_DONE', points, taskId: task.id })
      await logHistory('TASK', task.id, session.id, session.name, 'انجام شد', { status: 'DONE', points })
    } else if (body.status !== task.status) {
      await logHistory('TASK', task.id, session.id, session.name, 'تغییر وضعیت', { from: task.status, to: body.status, blockedNote: data.blockedNote ?? task.blockedNote })
    }
  }

  // --- checklist ---
  if (body.checklist !== undefined) {
    if (!Array.isArray(body.checklist)) return Response.json({ error: 'چک‌لیست نامعتبر' }, { status: 400 })
    data.checklist = JSON.stringify(body.checklist.filter((c) => c?.text?.trim()).map((c) => ({ text: c.text!.trim(), done: !!c.done })))
  }

  // --- manager edits ---
  if (isManager) {
    if (body.title !== undefined) data.title = body.title.trim()
    if (body.description !== undefined) data.description = body.description.trim() || null
    if (body.priority !== undefined && ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(body.priority)) data.priority = body.priority
    if (body.dueDate !== undefined) data.dueDate = body.dueDate.trim() || null
    if (body.assignedTo !== undefined && body.assignedTo.trim()) data.assignedTo = body.assignedTo.trim()
    if (body.assigneeType !== undefined) data.assigneeType = body.assigneeType === 'ROLE' ? 'ROLE' : 'USER'
  }

  if (Object.keys(data).length === 0) {
    return Response.json({ error: 'تغییری ارسال نشده' }, { status: 400 })
  }

  const updated = await db.task.update({ where: { id }, data })
  await logAudit(session.id, session.name, 'TASK_UPDATE', 'TASK', id, { keys: Object.keys(data) })

  return Response.json({ task: updated, pointsAwarded })
}

/** DELETE /api/tasks/[id] — manager or task creator */
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  const { id } = await params

  const task = await db.task.findUnique({ where: { id } })
  if (!task) return Response.json({ error: 'وظیفه یافت نشد' }, { status: 404 })

  const isManager = canUser(session.roles, PERMISSIONS.MANAGE_TASKS)
  if (!isManager && task.createdById !== session.id) {
    return Response.json({ error: 'اجازه حذف این وظیفه را ندارید' }, { status: 403 })
  }

  await db.task.delete({ where: { id } })
  await logAudit(session.id, session.name, 'TASK_DELETE', 'TASK', id, { title: task.title })
  return Response.json({ ok: true })
}
