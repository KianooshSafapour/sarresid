import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { canUser, PERMISSIONS } from '@/lib/constants'

/** GET /api/tasks?scope=mine|all */
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const scope = req.nextUrl.searchParams.get('scope') || 'mine'
  if (scope === 'all' && !canUser(session.roles, PERMISSIONS.MANAGE_TASKS)) {
    return Response.json({ error: 'فقط مدیران می‌توانند همه وظایف را ببینند' }, { status: 403 })
  }
  const tasks = scope === 'all'
    ? await db.task.findMany({ orderBy: { createdAt: 'desc' } })
    : await db.task.findMany({
        where: {
          OR: [
            { assigneeType: 'USER', assignedTo: session.id },
            { assigneeType: 'ROLE', assignedTo: { in: session.roles } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      })

  // names for display
  const users = await db.user.findMany({ select: { id: true, name: true } })
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name

  return Response.json(tasks.map((t) => ({
    ...t,
    createdByName: nameOf(t.createdById) || t.createdById,
    assigneeName: t.assigneeType === 'USER' ? nameOf(t.assignedTo) || t.assignedTo : t.assignedTo,
  })))
}

/** POST /api/tasks — create (manager with MANAGE_TASKS) */
export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.MANAGE_TASKS)) {
    return Response.json({ error: 'فقط مدیران می‌توانند وظیفه ثبت کنند' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as {
    title?: string
    description?: string
    assignedTo?: string
    assigneeType?: string
    priority?: string
    dueDate?: string
    checklist?: { text?: string }[]
  } | null

  if (!body?.title?.trim() || !body.assignedTo) {
    return Response.json({ error: 'عنوان و گیرنده الزامی است' }, { status: 400 })
  }

  const task = await db.task.create({
    data: {
      title: body.title.trim(),
      description: body.description?.trim() || null,
      assignedTo: body.assignedTo,
      assigneeType: body.assigneeType === 'ROLE' ? 'ROLE' : 'USER',
      priority: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(body.priority || '') ? body.priority! : 'MEDIUM',
      dueDate: body.dueDate?.trim() || null,
      checklist: Array.isArray(body.checklist)
        ? JSON.stringify(body.checklist.filter((c) => c?.text?.trim()).map((c) => ({ text: c.text!.trim(), done: false })))
        : null,
      createdById: session.id,
    },
  })

  await logAudit(session.id, session.name, 'TASK_CREATE', 'TASK', task.id, { title: task.title, assignedTo: task.assignedTo, assigneeType: task.assigneeType })
  return Response.json({ task }, { status: 201 })
}
