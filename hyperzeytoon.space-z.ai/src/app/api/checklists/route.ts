import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, requireManager, fail, ok, logActivity, notify } from '@/lib/server-utils'
import { jalaliKey } from '@/lib/jalali'

async function grantAward(userId: string, points: number, reason: string) {
  await db.award.create({ data: { userId, points, reason } })
  await db.user.update({ where: { id: userId }, data: { points: { increment: points } } })
}

function parseItems(raw: string): { text: string }[] {
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

// GET ?day=1404-08-12 → visible checklists + my run state for that day
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const url = new URL(req.url)
  const day = url.searchParams.get('day') || jalaliKey(new Date())

  const checklists = await db.checklist.findMany({ where: { active: true }, orderBy: { createdAt: 'asc' } })
  const visible = checklists.filter(
    (c) => !c.roleKey || c.roleKey.trim() === '' || user.isManager || user.roleKeys.includes(c.roleKey)
  )
  const runs = await db.checklistRun.findMany({ where: { userId: user.id, day, checklistId: { in: visible.map((c) => c.id) } } })

  return ok({
    day,
    checklists: visible.map((c) => {
      const run = runs.find((r) => r.checklistId === c.id)
      let state: { text: string; done: boolean }[] = []
      if (run) {
        try {
          state = JSON.parse(run.state)
        } catch {
          state = []
        }
      }
      return {
        id: c.id,
        title: c.title,
        roleKey: c.roleKey,
        items: parseItems(c.items),
        state,
        completedAt: run?.completedAt ?? null,
      }
    }),
  })
}

// managers create checklist {title, roleKey, items:[text]}
export async function POST(req: NextRequest) {
  const user = await requireManager(req)
  if (!user) return fail('دسترسی غیرمجاز', 403)
  const body = (await req.json().catch(() => ({}))) as { title?: string; roleKey?: string; items?: string[] }
  if (!body.title?.trim() || !body.items?.length) return fail('عنوان و آیتم‌ها الزامی است')
  const created = await db.checklist.create({
    data: {
      title: body.title.trim(),
      roleKey: body.roleKey?.trim() || null,
      items: JSON.stringify(body.items.filter((t) => t.trim()).map((text) => ({ text: text.trim() }))),
    },
  })
  await logActivity(user.id, user.name, 'ایجاد چک‌لیست', 'Checklist', created.id, created.title)
  return ok({ success: true, id: created.id })
}

// self save run state; when all done → completedAt + Award +2
export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const body = (await req.json().catch(() => ({}))) as {
    id?: string
    day?: string
    state?: { text: string; done: boolean }[]
  }
  if (!body.id || !body.day || !Array.isArray(body.state)) return fail('داده ناقص است')
  const checklist = await db.checklist.findUnique({ where: { id: body.id } })
  if (!checklist) return fail('چک‌لیست یافت نشد', 404)

  const allDone = body.state.length > 0 && body.state.every((s) => s.done)
  const prevRun = await db.checklistRun.findFirst({
    where: { checklistId: body.id, userId: user.id, day: body.day },
  })

  const completedAt = allDone && !prevRun?.completedAt ? new Date() : prevRun?.completedAt ?? null
  if (prevRun) {
    await db.checklistRun.update({
      where: { id: prevRun.id },
      data: { state: JSON.stringify(body.state), completedAt },
    })
  } else {
    await db.checklistRun.create({
      data: {
        checklistId: body.id,
        userId: user.id,
        day: body.day,
        state: JSON.stringify(body.state),
        completedAt,
      },
    })
  }

  if (completedAt && !prevRun?.completedAt) {
    await grantAward(user.id, 2, 'چک‌لیست روزانه کامل شد')
    await notify(user.id, 'آفرین! +۲ امتیاز ⭐', `${checklist.title} امروز کامل شد`, 'SUCCESS', 'tasks')
  }
  await logActivity(user.id, user.name, 'ثبت چک‌لیست روزانه', 'ChecklistRun', body.id, `${checklist.title} (${body.day})`)
  return ok({ success: true, completedAt })
}

export async function DELETE(req: NextRequest) {
  const user = await requireManager(req)
  if (!user) return fail('دسترسی غیرمجاز', 403)
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return fail('شناسه الزامی است')
  const c = await db.checklist.findUnique({ where: { id } })
  if (!c) return fail('چک‌لیست یافت نشد', 404)
  await db.checklist.update({ where: { id }, data: { active: false } })
  await logActivity(user.id, user.name, 'حذف چک‌لیست', 'Checklist', id, c.title)
  return ok({ success: true })
}
