'use client'
import * as React from 'react'
import { api } from '@/lib/api'
import { hasRole, ROLES, ROLE_LABELS } from '@/lib/types'
import type { PUser } from '@/lib/types'
import { fmtJalali, isoToJalali, toFaDigits } from '@/lib/jalali'
import {
  Avatar, Badge, Card, EmptyState, Field, GhostButton, Loading, Modal, PrimaryButton,
  RoleBadge, SectionHeader, TableWrap, Tabs, Td, Th, inputCls,
} from './kit'
import { JalaliDateField } from './JalaliCalendar'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import {
  Users, Settings, CalendarDays, Plus, Pencil, Save, Globe, Trash2, UserPlus, Info,
} from 'lucide-react'

type UserRow = {
  id: number
  name: string
  roles: string
  color: string
  active: boolean
  points: number
  createdAt?: string
}

const COLOR_PRESETS = ['#3E6B4A', '#5F8F55', '#93C572', '#B8860B', '#DAA520', '#9A3B3B']

const SETTING_ROWS: { key: string; label: string; hint: string; type?: 'text' | 'toggle' }[] = [
  { key: 'storeName', label: 'نام فروشگاه', hint: 'نام فروشگاه در فاکتورها، خروجی‌ها و گزارش‌ها استفاده می‌شود' },
  { key: 'taxPercent', label: 'درصد مالیات', hint: 'درصد مالیات محاسبه‌شده روی سفارش‌ها' },
  { key: 'vatPercent', label: 'درصد ارزش افزوده (VAT)', hint: 'درصد ارزش افزوده هنگام دریافت کالا و تسویه سفارش' },
  { key: 'profitMinRed', label: 'حداقل سود — قرمز', hint: 'اگر حاشیه سود محصول کمتر از این درصد باشد با رنگ قرمز هشدار داده می‌شود' },
  { key: 'profitMinYellow', label: 'حداقل سود — زرد', hint: 'اگر حاشیه سود کمتر از این درصد باشد با رنگ زرد هشدار داده می‌شود' },
  { key: 'lowStockDefault', label: 'حداقل موجودی پیش‌فرض', hint: 'هنگام افزودن محصول جدید، این عدد به‌عنوان حداقل موجودی ثبت می‌شود' },
  { key: 'minMarginPercent', label: 'حداقل حاشیه سود مجاز', hint: 'کمترین حاشیه سود مجاز برای فروش؛ زیر این عدد فروش نیازمند تایید است' },
  { key: 'holidayCheckEnabled', label: 'بررسی تعطیلات چک‌ها', hint: 'اگر روشن باشد، سررسید چک‌ها با تعطیلات واقعی ایران کنترل می‌شود', type: 'toggle' },
]

type HolidayT = { id: number; date: string; title: string; source: string }

export default function AdminSection({ user }: { user: PUser }) {
  const canUsers = hasRole(user, 'IT_ADMIN') || hasRole(user, 'OPERATION_MANAGER') || hasRole(user, 'OWNER')
  const [tab, setTab] = React.useState(canUsers ? 'users' : 'settings')

  return (
    <div>
      <SectionHeader
        title="مدیریت سیستم"
        subtitle="کاربران، تنظیمات و تعطیلات"
        icon={<Settings size={20} />}
      />
      <Tabs
        tabs={[
          ...(canUsers ? [{ key: 'users', label: 'کاربران', icon: <Users size={15} /> }] : []),
          { key: 'settings', label: 'تنظیمات', icon: <Settings size={15} /> },
          { key: 'holidays', label: 'تعطیلات', icon: <CalendarDays size={15} /> },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'users' && canUsers && <UsersTab user={user} />}
      {tab === 'settings' && <SettingsTab user={user} />}
      {tab === 'holidays' && <HolidaysTab user={user} />}
    </div>
  )
}

/* ==================== USERS ==================== */

function UsersTab({ user }: { user: PUser }) {
  const [users, setUsers] = React.useState<UserRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [editing, setEditing] = React.useState<UserRow | 'new' | null>(null)

  const load = React.useCallback(async () => {
    try {
      const r = await api.get<{ users: UserRow[] }>('/api/users')
      setUsers(r.users)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در دریافت کاربران')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-[#4A5A44]">{toFaDigits(users.length)} کاربر</span>
        <PrimaryButton onClick={() => setEditing('new')} className="min-h-[44px]">
          <UserPlus size={16} /> کاربر جدید
        </PrimaryButton>
      </div>

      {loading ? <Loading /> : (
        <TableWrap>
          <thead>
            <tr>
              <Th>کاربر</Th>
              <Th>نقش‌ها</Th>
              <Th>امتیاز</Th>
              <Th>وضعیت</Th>
              <Th className="w-16"></Th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="transition hover:bg-[#FBF9F3]">
                <Td>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={u.name} color={u.color} size={36} />
                    <span className="font-bold text-[#253A2A]">{u.name}</span>
                  </div>
                </Td>
                <Td><RoleBadge roles={u.roles} /></Td>
                <Td><span className="font-bold tabular-nums text-[#8A6508]">⭐ {toFaDigits(u.points)}</span></Td>
                <Td>
                  <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold', u.active ? 'text-emerald-700' : 'text-rose-600')}>
                    <span className={cn('h-2 w-2 rounded-full', u.active ? 'bg-emerald-500' : 'bg-rose-500')} />
                    {u.active ? 'فعال' : 'غیرفعال'}
                  </span>
                </Td>
                <Td>
                  <button
                    onClick={() => setEditing(u)}
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-[#8A9884] transition hover:bg-[#F3F7EF] hover:text-[#3E6B4A]"
                    aria-label={`ویرایش ${u.name}`}
                  >
                    <Pencil size={15} />
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <UserEditorModal
        open={editing !== null}
        target={editing === 'new' ? null : editing}
        actor={user}
        onClose={() => setEditing(null)}
        onDone={load}
      />
    </div>
  )
}

function UserEditorModal({ open, target, actor, onClose, onDone }: {
  open: boolean; target: UserRow | null; actor: PUser; onClose: () => void; onDone: () => void
}) {
  const [name, setName] = React.useState('')
  const [pin, setPin] = React.useState('')
  const [roles, setRoles] = React.useState<string[]>([])
  const [color, setColor] = React.useState(COLOR_PRESETS[0])
  const [active, setActive] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setName(target?.name ?? '')
      setPin('')
      setRoles((target?.roles ?? 'SALESPERSON').split(',').map((r) => r.trim()).filter(Boolean))
      setColor(target?.color ?? COLOR_PRESETS[0])
      setActive(target?.active ?? true)
    }
  }, [open, target])

  const toggleRole = (r: string) => {
    setRoles((arr) => (arr.includes(r) ? arr.filter((x) => x !== r) : [...arr, r]))
  }

  const save = async () => {
    if (!name.trim()) { toast.error('نام کاربر الزامی است'); return }
    if (roles.length === 0) { toast.error('حداقل یک نقش انتخاب کنید'); return }
    if (pin && !/^\d{4}$/.test(pin)) { toast.error('کد ورود باید ۴ رقم باشد'); return }
    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        ...(pin ? { pin } : {}),
        roles: roles.join(','),
        color,
        active,
        userId: actor.id,
        userName: actor.name,
      }
      if (target) {
        await api.patch('/api/users', { id: target.id, ...payload })
        toast.success('کاربر ویرایش شد ✅')
      } else {
        await api.post('/api/users', payload)
        toast.success('کاربر جدید ساخته شد ✅')
      }
      onClose()
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ذخیره ناموفق بود')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={target ? `ویرایش کاربر — ${target.name}` : 'کاربر جدید'} wide>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="نام و نام خانوادگی" required>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="مثلاً: علی محمدی" />
          </Field>
          <Field label="کد ورود (PIN)" hint={target ? '۴ رقم — خالی بگذارید تا تغییر نکند' : '۴ رقم — اگر خالی باشد ۱۲۳۴ ثبت می‌شود'}>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              className={cn(inputCls, 'text-center tracking-[0.4em]')}
              placeholder='— — — —'
              dir="ltr"
            />
          </Field>
        </div>

        <Field label="نقش‌ها" required>
          <div className="grid grid-cols-1 gap-1.5 rounded-xl border border-[#E4DCC8] bg-white p-3 sm:grid-cols-2">
            {ROLES.map((r) => (
              <label key={r} className="flex min-h-[36px] cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs transition hover:bg-[#F3F7EF]">
                <input
                  type="checkbox"
                  checked={roles.includes(r)}
                  onChange={() => toggleRole(r)}
                  className="h-4 w-4 accent-[#3E6B4A]"
                />
                <span className="font-semibold text-[#33402F]">{ROLE_LABELS[r] ?? r}</span>
                <span className="text-[9px] text-[#A8A28C]">{r}</span>
              </label>
            ))}
          </div>
        </Field>

        <Field label="رنگ پروفایل">
          <div className="flex flex-wrap gap-2">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-xl transition-all',
                  color === c ? 'ring-2 ring-[#3E6B4A] ring-offset-2 ring-offset-[#FBF9F3]' : 'hover:scale-105'
                )}
                style={{ background: c }}
                aria-label={`رنگ ${c}`}
              >
                {color === c && <span className="text-sm text-white">✓</span>}
              </button>
            ))}
          </div>
        </Field>

        <div className="flex items-center justify-between rounded-xl border border-[#E4DCC8] bg-white px-4 py-3">
          <div>
            <div className="text-xs font-bold text-[#33402F]">وضعیت حساب</div>
            <div className="text-[10px] text-[#8A9884]">کاربر غیرفعال نمی‌تواند وارد سیستم شود</div>
          </div>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>

        <div className="flex justify-end gap-2">
          <GhostButton onClick={onClose} className="min-h-[44px]">انصراف</GhostButton>
          <PrimaryButton onClick={save} disabled={saving} className="min-h-[44px]">
            <Save size={15} /> {saving ? 'در حال ذخیره…' : 'ذخیره'}
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  )
}

/* ==================== SETTINGS ==================== */

function SettingsTab({ user }: { user: PUser }) {
  const [settings, setSettings] = React.useState<Record<string, string>>({})
  const [drafts, setDrafts] = React.useState<Record<string, string>>({})
  const [loading, setLoading] = React.useState(true)
  const [savingKey, setSavingKey] = React.useState<string | null>(null)

  React.useEffect(() => {
    api.get<{ settings: Record<string, string> }>('/api/settings')
      .then((r) => { setSettings(r.settings); setDrafts(r.settings) })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'خطا در دریافت تنظیمات'))
      .finally(() => setLoading(false))
  }, [])

  const save = async (key: string) => {
    const value = drafts[key] ?? ''
    setSavingKey(key)
    try {
      await api.patch('/api/settings', { key, value, userId: user.id })
      setSettings((s) => ({ ...s, [key]: value }))
      toast.success(`تنظیم «${SETTING_ROWS.find((r) => r.key === key)?.label ?? key}» ذخیره شد ✅`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ذخیره ناموفق بود')
    } finally {
      setSavingKey(null)
    }
  }

  const setToggle = async (key: string, on: boolean) => {
    const value = on ? 'true' : 'false'
    setDrafts((d) => ({ ...d, [key]: value }))
    setSavingKey(key)
    try {
      await api.patch('/api/settings', { key, value, userId: user.id })
      setSettings((s) => ({ ...s, [key]: value }))
      toast.success('تنظیم ذخیره شد ✅')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ذخیره ناموفق بود')
    } finally {
      setSavingKey(null)
    }
  }

  if (loading) return <Loading />

  return (
    <div className="space-y-3">
      {SETTING_ROWS.map((row) => {
        const dirty = (drafts[row.key] ?? '') !== (settings[row.key] ?? '')
        return (
          <Card key={row.key} className="p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-[220px] flex-1">
                <div className="mb-0.5 text-sm font-bold text-[#253A2A]">{row.label}</div>
                <p className="mb-2 text-[11px] leading-relaxed text-[#8A9884]">{row.hint}</p>
                {row.type === 'toggle' ? (
                  <div className="flex items-center gap-2 pt-1">
                    <Switch
                      checked={(drafts[row.key] ?? 'false') === 'true'}
                      onCheckedChange={(v) => setToggle(row.key, v)}
                      disabled={savingKey === row.key}
                    />
                    <span className="text-xs font-semibold text-[#4A5A44]">
                      {(drafts[row.key] ?? 'false') === 'true' ? 'فعال' : 'غیرفعال'}
                    </span>
                  </div>
                ) : (
                  <input
                    value={drafts[row.key] ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [row.key]: e.target.value }))}
                    className={cn(inputCls, 'max-w-xs')}
                    dir={row.key === 'storeName' ? 'rtl' : 'ltr'}
                  />
                )}
              </div>
              {row.type !== 'toggle' && (
                <PrimaryButton
                  onClick={() => save(row.key)}
                  disabled={!dirty || savingKey === row.key}
                  className="min-h-[44px]"
                >
                  <Save size={15} /> ذخیره
                </PrimaryButton>
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

/* ==================== HOLIDAYS ==================== */

function HolidaysTab({ user }: { user: PUser }) {
  const [holidays, setHolidays] = React.useState<HolidayT[]>([])
  const [loading, setLoading] = React.useState(true)
  const [date, setDate] = React.useState<string | null>(null)
  const [title, setTitle] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [fetching, setFetching] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const r = await api.get<{ holidays: HolidayT[] }>('/api/holidays')
      setHolidays(r.holidays)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در دریافت تعطیلات')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  const grouped = React.useMemo(() => {
    const g = new Map<number, HolidayT[]>()
    for (const h of holidays) {
      const jy = isoToJalali(h.date).jy
      if (!g.has(jy)) g.set(jy, [])
      g.get(jy)!.push(h)
    }
    return [...g.entries()].sort((a, b) => b[0] - a[0])
  }, [holidays])

  const add = async () => {
    if (!date) { toast.error('تاریخ تعطیلی را انتخاب کنید'); return }
    if (!title.trim()) { toast.error('عنوان تعطیلی الزامی است'); return }
    setSaving(true)
    try {
      await api.post('/api/holidays', { date, title: title.trim(), userId: user.id })
      toast.success('تعطیلی ثبت شد ✅')
      setDate(null); setTitle('')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ثبت ناموفق بود')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (h: HolidayT) => {
    try {
      await api.del(`/api/holidays?date=${h.date}&userId=${user.id}`)
      toast.success('تعطیلی حذف شد')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'حذف ناموفق بود')
    }
  }

  const fetchWeb = async () => {
    setFetching(true)
    try {
      const r = await api.post<{ added: number; source: string; error?: string }>('/api/holidays/fetch', { userId: user.id })
      if (r.added > 0) toast.success(`${toFaDigits(r.added)} تعطیلی از اینترنت به‌روزرسانی شد (منبع: ${r.source}) 🌐`)
      else toast.info(r.error ? 'دریافت از اینترنت ناموفق بود — بعداً دوباره تلاش کنید' : 'تعطیلی جدیدی از اینترنت پیدا نشد')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'به‌روزرسانی ناموفق بود')
    } finally {
      setFetching(false)
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#EAD9A8] bg-gradient-to-l from-[#FBF4DE] to-[#FBF9F3] px-4 py-3">
        <Info size={18} className="mt-0.5 shrink-0 text-[#8A6508]" />
        <p className="text-xs leading-relaxed text-[#6B5A20] sm:text-sm">
          تقویم چک‌ها با تعطیلات واقعی ایران به‌روز می‌ماند — سررسیدی که تعطیل باشد به‌صورت خودکار هشدار داده می‌شود.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="w-full sm:w-52">
          <JalaliDateField value={date} onChange={setDate} label="تاریخ تعطیل" />
        </div>
        <div className="min-w-[200px] flex-1">
          <Field label="عنوان تعطیل">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="مثلاً: عید نوروز" />
          </Field>
        </div>
        <PrimaryButton onClick={add} disabled={saving} className="min-h-[44px]">
          <Plus size={16} /> افزودن
        </PrimaryButton>
        <PrimaryButton onClick={fetchWeb} disabled={fetching} className="min-h-[44px] bg-gradient-to-b from-[#3E6B4A] to-[#2F4A36]">
          <Globe size={16} className={fetching ? 'animate-spin' : ''} />
          {fetching ? 'در حال دریافت…' : 'به‌روزرسانی از اینترنت 🌐'}
        </PrimaryButton>
      </div>

      {loading ? <Loading /> : holidays.length === 0 ? (
        <EmptyState icon={<CalendarDays size={38} />} title="هیچ تعطیلی ثبت نشده" hint="با دکمه «به‌روزرسانی از اینترنت» تعطیلات رسمی را دریافت کنید" />
      ) : (
        <div className="pz-scroll max-h-[60vh] space-y-4 overflow-y-auto">
          {grouped.map(([jy, rows]) => (
            <Card key={jy} className="overflow-hidden">
              <div className="border-b border-[#E4DCC8] bg-[#F5F2E8] px-4 py-2.5 text-sm font-black text-[#4A5A44]">
                سال {toFaDigits(jy)} <span className="text-xs font-normal text-[#8A9884]">({toFaDigits(rows.length)} روز تعطیل)</span>
              </div>
              <div className="divide-y divide-[#EFEAD8]">
                {rows.map((h) => (
                  <div key={h.id} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-[#FBF9F3]">
                    <span className="w-28 shrink-0 text-xs font-bold tabular-nums text-[#3E6B4A]">{fmtJalali(h.date)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-[#33402F]">{h.title}</span>
                    <Badge className={cn(
                      'shrink-0',
                      h.source === 'WEB'
                        ? 'border-[#C8D8C0] bg-[#F3F7EF] text-[#3E6B4A]'
                        : 'border-[#EAD9A8] bg-[#FBF4DE] text-[#8A6508]'
                    )}>
                      {h.source === 'WEB' ? 'اینترنت 🌐' : 'دستی ✍️'}
                    </Badge>
                    <button
                      onClick={() => remove(h)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#A8A28C] transition hover:bg-rose-50 hover:text-rose-600"
                      aria-label={`حذف ${h.title}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
