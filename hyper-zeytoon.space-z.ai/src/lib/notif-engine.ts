/** موتور اعلان‌های قاعده‌محور (visual workflow) — یک قاعده در DB، همهٔ بخش‌ها از همین منتشر می‌کنند.
 *  الگو: Camunda escalation boundary — notify (غیرقطع‌کننده) و reassign (قطع‌کننده) */
import { db } from '@/lib/db'
import { safeParse } from '@/lib/api-helpers'

export type NotifSeverity = 'critical' | 'important' | 'info'

export type EmitInput = {
  event: string // e.g. 'leave.requested'
  title: string
  detail?: string
  go?: string // hash route like '#/leaves'
  severity?: NotifSeverity
  icon?: string
  actor?: { id: string; name: string } | null
  /** مقصدهای پویا که قاعده ارجاع می‌دهد: submitter | approver | zoneOwner | oversight */
  fieldRefs?: Record<string, string[]> // name → user ids
  dedupeId?: string // شناسهٔ یکتا برای جلوگیری از اسپم (مثلاً leaveId)
  payload?: Record<string, unknown>
}

/** قاعدهٔ event را می‌خواند، مقصدها را حل می‌کند و NotifOutbox می‌سازد (با dedupe) */
export async function emitNotif(input: EmitInput): Promise<{ sent: boolean; ruleKey?: string }> {
  try {
    const rule = await db.notifRule.findUnique({ where: { key: input.event } })
    if (rule && !rule.enabled) return { sent: false }
    const targets = safeParse<{ roles?: string[]; users?: string[]; fieldRef?: string }>(rule?.targets || '{}', {})
    const severity = (input.severity || (rule?.severity as NotifSeverity) || 'important') as NotifSeverity
    const icon = input.icon || '🔔'

    const userIds = new Set<string>(targets.users || [])
    for (const ref of Object.keys(input.fieldRefs || {})) {
      if ((targets.fieldRef || '') === ref || targets.fieldRef === ref) {
        for (const id of input.fieldRefs?.[ref] || []) userIds.add(id)
      }
    }
    const roles = targets.roles || []

    const dedupeKey = input.dedupeId ? `${input.event}:${input.dedupeId}` : ''
    if (dedupeKey) {
      const since = new Date(Date.now() - (rule?.dedupeHours ?? 12) * 3600_000)
      const dup = await db.notifOutbox.findFirst({ where: { dedupeKey, createdAt: { gte: since } } })
      if (dup) return { sent: false, ruleKey: input.event }
    }

    await db.notifOutbox.create({
      data: {
        ruleKey: input.event,
        severity,
        icon,
        title: input.title.slice(0, 180),
        detail: (input.detail || '').slice(0, 600),
        go: input.go || '',
        targetRoles: JSON.stringify(roles),
        targetUsers: JSON.stringify(Array.from(userIds)),
        dedupeKey,
      },
    })
    return { sent: true, ruleKey: input.event }
  } catch {
    return { sent: false } // never block business flow on notification failure
  }
}

/** کاربران دارای نقش‌های مشخص (برای مقصدهای نقش‌محور) */
export async function usersWithRoles(roles: string[]): Promise<string[]> {
  if (!roles.length) return []
  const users = await db.user.findMany({ where: { active: true, hidden: false }, select: { id: true, role: true, secondaryRoles: true, roleIds: true } })
  return users
    .filter((u) => roles.includes(u.role) || safeParse<string[]>(u.secondaryRoles, []).some((s) => roles.includes(s)) || safeParse<string[]>(u.roleIds || '[]', []).some((s) => roles.includes(s)))
    .map((u) => u.id)
}

/** ناظران یک دامنه (مدل Oversight — ادمین تعیین می‌کند چه کسی تأیید کند) */
export async function oversightUsers(domain: string): Promise<string[]> {
  const o = await db.oversight.findUnique({ where: { domain } })
  return o ? safeParse<string[]>(o.userIds, []) : []
}
