'use client'
import * as React from 'react'
import { api } from '@/lib/api'
import { hasRole } from '@/lib/types'
import type { PUser, Role } from '@/lib/types'
import { fmtJalaliTime, toFaDigits } from '@/lib/jalali'
import {
  Avatar, Badge, Card, EmptyState, GhostButton, Loading, SectionHeader, StatCard, TableWrap, Td, Th, TimeAgo, inputCls,
} from './kit'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { ScrollText, Users, Boxes, Activity, Search, RefreshCw, ShieldCheck } from 'lucide-react'

type AuditLogT = {
  id: number
  userId: number
  userName: string
  action: string
  entity: string
  entityId: number | null
  detail: string | null
  createdAt: string
}
type AuditStats = { stats: { userName: string; count: number }[]; entities: { entity: string; count: number }[] }
type UserLite = { id: number; name: string; color: string }

const ALLOWED = ['GENERAL_MANAGER', 'OPERATION_MANAGER', 'IT_ADMIN', 'OWNER']

function actionChipCls(action: string): string {
  if (/DELETE|REMOVE|CANCEL|REJECT|BOUNCE|BREAK/.test(action)) return 'border-rose-200 bg-rose-50 text-rose-700'
  if (/CREATE|ADD|IMPORT|ACCEPT|APPROVE|DONE|LOGIN/.test(action)) return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (/UPDATE|EDIT|PATCH|PREPARE|SEND|RESCHEDULE|CORRECT/.test(action)) return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-[#D8E2D0] bg-[#F3F7EF] text-[#3E6B4A]'
}

/** Persian verb for each audit action (fallback: raw code) */
const ACTION_FA: Record<string, string> = {
  LOGIN: 'ورود به سامانه',
  ORDER_CREATE: 'ثبت سفارش',
  ORDER_UPDATE: 'ویرایش سفارش',
  ORDER_SUBMIT: 'ارسال برای تایید',
  ORDER_APPROVE: 'تایید سفارش',
  ORDER_RECEIVE: 'دریافت کالا',
  ORDER_CONFIRM: 'تایید نهایی انبار',
  ORDER_DONE: 'بستن سفارش',
  ORDER_CORRECTION: 'اصلاحیه سفارش',
  ORDER_CANCEL: 'لغو سفارش',
  ORDER_EXPORT: 'خروجی اکسل سفارش',
  ORDER_BARCODE: 'ثبت بارکد کالا',
  CHEQUE_CREATE: 'ثبت چک',
  CHEQUE_APPROVE: 'تایید چک',
  CHEQUE_EXPORT: 'خروجی دفتر چک',
  CHEQUES_EXPORT: 'خروجی دفتر چک',
  CHEQUE_WRITE: 'نوشتن چک',
  CHEQUE_SIGN: 'امضای چک',
  CHEQUE_GIVE: 'تحویل چک',
  CHEQUE_COLLECT: 'وصول چک',
  CHEQUE_BOUNCE: 'برگشت چک',
  CHEQUE_REJECT: 'رد چک',
  PRODUCT_CREATE: 'ثبت کالای جدید',
  PRODUCT_UPDATE: 'ویرایش کالا',
  PRODUCT_IMPORT: 'ورود گروهی کالا',
  PRODUCT_PRICE_IMPORT: 'ورود گروهی قیمت',
  PRODUCT_IMAGE: 'ثبت تصویر کالا',
  SALE_CREATE: 'ثبت فروش',
  SALE_DELETE: 'حذف فروش',
  SALES_IMPORT: 'ورود فروش از هولو',
  PREORDER_PREPARE: 'آماده‌سازی پیش‌فروش',
  PREORDER_DONE: 'تکمیل پیش‌فروش',
  SUPPLIER_CREATE: 'ثبت تأمین‌کننده',
  SUPPLIER_UPDATE: 'ویرایش تأمین‌کننده',
  USER_UPDATE: 'ویرایش کاربر',
  MESSAGE_SEND: 'ارسال پیام',
  TASK_CREATE: 'ثبت کار',
  TASK_UPDATE: 'ویرایش کار',
  TASK_DONE: 'انجام کار',
  WAREHOUSE_REQUEST: 'درخواست انبار',
  WAREHOUSE_PREPARE: 'آماده‌سازی انبار',
  WAREHOUSE_RECEIVE: 'دریافت انبار',
  CUSTOMER_REQUEST: 'درخواست مشتری',
  FEEDBACK: 'بازخورد',
  IDEA: 'ثبت ایده',
  HOLIDAY_ADD: 'ثبت تعطیلی',
  POINTS_AWARD: 'اعطای امتیاز',
  PINGOGRAM_UPDATE: 'ویرایش پلانوگرام',
  PLANOGRAM_UPDATE: 'ویرایش پلانوگرام',
  SETTINGS_UPDATE: 'تغییر تنظیمات',
}

function actionFa(action: string): string {
  return ACTION_FA[action] ?? ACTION_FA[action.toUpperCase()] ?? action
}

export default function AuditSection({ user }: { user: PUser }) {
  const allowed = ALLOWED.some((r) => hasRole(user, r as Role))
  return allowed ? <AuditBody user={user} /> : <NoAccess />
}

function NoAccess() {
  return (
    <div>
      <SectionHeader title="گزارش فعالیت‌ها" subtitle="ردپای کامل اقدامات تیم" icon={<ScrollText size={20} />} />
      <EmptyState
        icon={<ShieldCheck size={40} />}
        title="دسترسی محدود"
        hint="این بخش فقط برای مدیران و مالک در دسترس است"
      />
    </div>
  )
}

function AuditBody({ user }: { user: PUser }) {
  const [logs, setLogs] = React.useState<AuditLogT[]>([])
  const [stats, setStats] = React.useState<AuditStats>({ stats: [], entities: [] })
  const [users, setUsers] = React.useState<UserLite[]>([])
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)

  const [fUser, setFUser] = React.useState('')
  const [fEntity, setFEntity] = React.useState('')
  const [q, setQ] = React.useState('')

  const load = React.useCallback(async (userIdFilter: string, entityFilter: string) => {
    try {
      const params = new URLSearchParams({ limit: '200' })
      if (userIdFilter) params.set('userId', userIdFilter)
      if (entityFilter) params.set('entity', entityFilter)
      const [a, s] = await Promise.all([
        api.get<{ logs: AuditLogT[] }>(`/api/audit?${params.toString()}`),
        api.get<AuditStats>('/api/audit?stats=1'),
      ])
      setLogs(a.logs)
      setStats(s)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در دریافت گزارش')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  React.useEffect(() => {
    api.get<{ users: UserLite[] }>('/api/users').then((r) => setUsers(r.users)).catch(() => {})
  }, [])

  React.useEffect(() => {
    load(fUser, fEntity)
  }, [fUser, fEntity, load])

  const refresh = () => {
    setRefreshing(true)
    load(fUser, fEntity)
  }

  const todayKey = new Date().toDateString()
  const todayCount = logs.filter((l) => new Date(l.createdAt).toDateString() === todayKey).length
  const topActor = stats.stats[0]

  const filtered = React.useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return logs
    return logs.filter((l) =>
      l.action.toLowerCase().includes(query) ||
      actionFa(l.action).includes(query) ||
      l.userName.toLowerCase().includes(query) ||
      l.entity.toLowerCase().includes(query) ||
      (l.detail ?? '').toLowerCase().includes(query))
  }, [logs, q])

  const usersMap = React.useMemo(() => new Map(users.map((u) => [u.id, u])), [users])

  return (
    <div>
      <SectionHeader
        title="گزارش فعالیت‌ها"
        subtitle="ردپای کامل اقدامات تیم برای شفافیت"
        icon={<ScrollText size={20} />}
        actions={
          <GhostButton onClick={refresh} className="min-h-[44px]">
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> به‌روزرسانی
          </GhostButton>
        }
      />

      {/* trust framing */}
      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#C8D8C0] bg-gradient-to-l from-[#F3F7EF] to-[#FBF9F3] px-4 py-3">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#3E6B4A]" />
        <p className="text-xs font-semibold leading-relaxed text-[#3E6B4A] sm:text-sm">
          این گزارش برای شفافیت و یادگیری است، نه سرزنش
        </p>
      </div>

      {/* stat cards */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="اقدامات امروز (از ۲۰۰ ردیف اخیر)"
          value={toFaDigits(todayCount)}
          icon={<Activity size={18} />}
          tone="olive"
        />
        <StatCard
          label="فعال‌ترین کاربر"
          value={topActor ? topActor.userName : '—'}
          sub={topActor ? `${toFaDigits(topActor.count)} اقدام ثبت‌شده` : undefined}
          icon={<Users size={18} />}
          tone="gold"
        />
        <StatCard
          label="موجودیت‌های تحت ردیابی"
          value={toFaDigits(stats.entities.length)}
          sub={stats.entities.slice(0, 3).map((e) => e.entity).join(' · ')}
          icon={<Boxes size={18} />}
          tone="olive"
        />
      </div>

      {/* quick actor chips (top 6 from stats) */}
      {stats.stats.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-[#8A9884]">فیلتر سریع:</span>
          <button
            type="button"
            onClick={() => setFUser('')}
            aria-pressed={fUser === ''}
            className={`min-h-[32px] rounded-full border px-3 text-[11px] font-bold transition ${fUser === '' ? 'border-[#3E6B4A] bg-[#3E6B4A] text-white' : 'border-[#E4DCC8] bg-white text-[#4A5A44] hover:border-[#93C572]'}`}
          >
            همه
          </button>
          {stats.stats.slice(0, 6).map((s) => {
            const u = users.find((x) => x.name === s.userName)
            const active = fUser !== '' && usersMap.get(Number(fUser))?.name === s.userName
            return (
              <button
                key={s.userName}
                type="button"
                onClick={() => setFUser(active ? '' : String(u?.id ?? ''))}
                aria-pressed={active}
                className={cn(
                  'flex min-h-[32px] items-center gap-1.5 rounded-full border py-0.5 pl-1 pr-2.5 text-[11px] font-bold transition',
                  active ? 'border-[#3E6B4A] bg-[#3E6B4A] text-white' : 'border-[#E4DCC8] bg-white text-[#4A5A44] hover:border-[#93C572]'
                )}
              >
                <Avatar name={s.userName} color={u?.color ?? '#5F7A4E'} size={20} />
                {s.userName.split('(')[0].trim()}
                <span className={cn('tabular-nums', active ? 'text-white/80' : 'text-[#A8A28C]')}>{toFaDigits(s.count)}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={fUser}
          onChange={(e) => setFUser(e.target.value)}
          className={cn(inputCls, 'w-auto min-w-[170px]')}
          aria-label="فیلتر کاربر"
        >
          <option value="">همه کاربران</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <select
          value={fEntity}
          onChange={(e) => setFEntity(e.target.value)}
          className={cn(inputCls, 'w-auto min-w-[170px]')}
          aria-label="فیلتر موجودیت"
        >
          <option value="">همه موجودیت‌ها</option>
          {stats.entities.map((e) => (
            <option key={e.entity} value={e.entity}>{e.entity} ({toFaDigits(e.count)})</option>
          ))}
        </select>
        <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-[#D8D2BC] bg-white px-3">
          <Search size={15} className="shrink-0 text-[#8A9884]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجو در اقدام، توضیح، نام…"
            className="min-h-[44px] w-full bg-transparent text-sm outline-none placeholder:text-[#A8A28C]"
            aria-label="جستجو در گزارش"
          />
        </div>
      </div>

      {/* table */}
      {loading ? <Loading /> : filtered.length === 0 ? (
        <EmptyState icon={<ScrollText size={38} />} title="ردیفی با این فیلترها پیدا نشد" hint="فیلترها را تغییر دهید یا گزارش را به‌روزرسانی کنید" />
      ) : (
        <Card className="p-0">
          <div className="pz-scroll max-h-[65vh] overflow-y-auto rounded-2xl">
            <TableWrap className="rounded-none border-0">
              <thead className="sticky top-0 z-10">
                <tr>
                  <Th className="w-40">زمان</Th>
                  <Th>کاربر</Th>
                  <Th className="w-40">اقدام</Th>
                  <Th className="w-36">موجودیت</Th>
                  <Th>توضیح</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => {
                  const u = usersMap.get(l.userId)
                  return (
                    <tr key={l.id} className="transition hover:bg-[#FBF9F3]">
                      <Td>
                        <TimeAgo iso={l.createdAt} />
                        <div className="mt-0.5 text-[10px] tabular-nums text-[#A8A28C]">{fmtJalaliTime(l.createdAt)}</div>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <Avatar name={l.userName} color={u?.color ?? '#5F7A4E'} size={30} />
                          <span className="truncate text-xs font-bold text-[#253A2A]">{l.userName}</span>
                        </div>
                      </Td>
                      <Td>
                        <span title={l.action}>
                          <Badge className={cn('text-[10px]', actionChipCls(l.action))}>{actionFa(l.action)}</Badge>
                        </span>
                      </Td>
                      <Td>
                        <span className="text-xs font-semibold text-[#4A5A44]">{l.entity}</span>
                        {l.entityId != null && <span className="mr-1 text-[10px] tabular-nums text-[#A8A28C]">#{toFaDigits(l.entityId)}</span>}
                      </Td>
                      <Td>
                        <span className="line-clamp-2 block max-w-xs text-xs text-[#6B7A66]">{l.detail ?? '—'}</span>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </TableWrap>
          </div>
        </Card>
      )}
    </div>
  )
}
