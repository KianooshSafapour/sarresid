'use client'

import * as React from 'react'
import { api, ClientUser, getStoredUser } from '@/lib/api-client'
import { GlowCard, SectionHeader, EmptyState, RoleBadge, OrnamentDivider } from '@/components/zeytoon-ui'
import { formatMoney, toFaDigits, formatJalaliDateTime, toEnDigits } from '@/lib/jalali'
import { ROLES, canUser, PERMISSIONS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { JalaliDatePicker } from '@/components/jalali-date-picker'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  ShieldCheck, UserPlus, Users, CalendarDays, ScrollText, Settings2, Loader2,
  Trash2, RefreshCw, Pencil, Globe, Search, ChevronRight, ChevronLeft, Phone,
  Gauge, HeartPulse, Database, HardDrive, MemoryStick, Timer, Zap, FlaskConical, Eraser, PlayCircle,
  History, Download,
} from 'lucide-react'

/* =============== constants =============== */

const COLOR_PALETTE = ['#5a7d4f', '#8a6d1f', '#a35d3f', '#4f6d7d', '#7d4f6d', '#2f6d5a', '#7d2f4f', '#5a5a7d', '#6d6a2f', '#2f7d4f', '#b8860b', '#7a4f3f']

const AUDIT_ACTION_LABELS: Record<string, string> = {
  CHEQUE_CREATE: 'ثبت چک جدید',
  CHEQUE_WRITE: 'صدور چک',
  CHEQUE_SIGN: 'امضای چک',
  CHEQUE_READY: 'آماده‌سازی چک',
  CHEQUE_COLLECT: 'تحویل چک به نماینده',
  CHEQUE_DONE: 'پاس شدن چک',
  CHEQUE_REJECT: 'رد چک',
  CHEQUE_RESCHEDULE: 'ویرایش چک',
  CHEQUE_SPLIT: 'تقسیم چک',
  SALE_ORDER_CREATE: 'ثبت سفارش فروش',
  SALE_ORDER_ACCEPT: 'تأیید سفارش فروش (صندوق هلو)',
  SALE_ORDER_CASH: 'تسویه نقدی سفارش',
  CUSTOMER_CREATE: 'ثبت مشتری',
  CUSTOMER_UPDATE: 'ویرایش مشتری',
  SETTINGS_UPDATE: 'تغییر تنظیمات سامانه',
  FETCH_HOLIDAYS: 'بروزرسانی تعطیلات از اینترنت',
  CREATE_USER: 'ایجاد کاربر',
  UPDATE_USER: 'ویرایش کاربر',
  ADD_HOLIDAY: 'افزودن تعطیلی',
  DELETE_HOLIDAY: 'حذف تعطیلی',
  ORDER_CREATE: 'ثبت سفارش خرید',
  ORDER_UPDATE: 'ویرایش سفارش',
  LOGIN: 'ورود به سامانه',
}

function actionLabel(a: string): string {
  return AUDIT_ACTION_LABELS[a] || a.replaceAll('_', ' ').toLowerCase()
}

interface AdminUser {
  id: string
  name: string
  roles: string[]
  primaryRole: string
  color: string
  active: boolean
  points: number
  phone?: string | null
}

interface AuditRow {
  id: string
  userId: string
  userName: string
  action: string
  entityType: string
  entityId: string | null
  details: string | null
  createdAt: string
}

const PAGE_SIZE = 15

/* =============== main =============== */

export function AdminSection({ user }: { user: ClientUser }) {
  const canUsers = canUser(user.roles, PERMISSIONS.ADMIN_USERS)
  const canAudit = canUser(user.roles, PERMISSIONS.VIEW_AUDIT)
  const canSettings = canUser(user.roles, PERMISSIONS.ADMIN_SETTINGS)

  const tabs = [
    canUsers && { key: 'users', label: 'کاربران', icon: Users },
    canUsers && { key: 'holidays', label: 'تعطیلات', icon: CalendarDays },
    canAudit && { key: 'audit', label: 'گزارش رخدادها', icon: ScrollText },
    canSettings && { key: 'settings', label: 'تنظیمات', icon: Settings2 },
    canSettings && { key: 'stress', label: 'آزمون فشار', icon: Gauge },
  ].filter(Boolean) as { key: string; label: string; icon: React.ComponentType<{ className?: string }> }[]

  const [tab, setTab] = React.useState(tabs[0]?.key || 'users')

  if (!tabs.length) {
    return (
      <div>
        <SectionHeader title="مدیریت سامانه" />
        <EmptyState icon="🔒" title="دسترسی ندارید" description="این بخش فقط برای مدیران سامانه فعال است." />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="مدیریت سامانه" subtitle="کاربران، تعطیلات رسمی، گزارش رخدادها و تنظیمات فروشگاه" />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-11 bg-card border border-gold/20 flex-wrap h-auto">
          {tabs.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="gap-1.5 px-4 data-[state=active]:bg-olive data-[state=active]:text-white">
              <t.icon className="size-4" /> {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {canUsers && <TabsContent value="users" className="mt-4"><UsersTab currentUser={user} /></TabsContent>}
        {canUsers && <TabsContent value="holidays" className="mt-4"><HolidaysTab /></TabsContent>}
        {canAudit && <TabsContent value="audit" className="mt-4"><AuditTab /></TabsContent>}
        {canSettings && <TabsContent value="settings" className="mt-4"><SettingsTab /></TabsContent>}
        {canSettings && <TabsContent value="stress" className="mt-4"><StressTab /></TabsContent>}
      </Tabs>
    </div>
  )
}

/* =============== users tab =============== */

function UsersTab({ currentUser }: { currentUser: ClientUser }) {
  const { toast } = useToast()
  const [users, setUsers] = React.useState<AdminUser[]>([])
  const [loading, setLoading] = React.useState(true)
  const [edit, setEdit] = React.useState<AdminUser | null>(null)
  const [addOpen, setAddOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [busyId, setBusyId] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    try {
      setUsers(await api.get<AdminUser[]>('/api/users'))
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'خطا در دریافت کاربران', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  React.useEffect(() => { load() }, [load])

  async function toggleActive(u: AdminUser) {
    setBusyId(u.id)
    try {
      await api.patch('/api/users', { id: u.id, active: !u.active })
      toast({ title: !u.active ? 'کاربر فعال شد ✅' : 'کاربر غیرفعال شد', description: u.name })
      load()
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'عملیات ناموفق بود', variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  const filtered = users.filter((u) => !search || u.name.includes(search.trim()))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input className="h-11 pr-9" placeholder="جستجوی نام کاربر..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button className="h-11 bg-olive hover:bg-olive/90 gap-1.5" onClick={() => setAddOpen(true)}>
          <UserPlus className="size-4.5" /> کاربر جدید
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="👥" title="کاربری پیدا نشد" />
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => (
            <GlowCard key={u.id} className="p-3.5">
              <div className="flex flex-wrap items-center gap-3">
                <div
                  className="size-10 rounded-full flex items-center justify-center text-white font-black shrink-0"
                  style={{ background: u.color }}
                >
                  {u.name.replace('خانم ', '').replace('آقای ', '').charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('font-bold', !u.active && 'line-through opacity-60')}>{u.name}</span>
                    {u.id === currentUser.id && <Badge variant="secondary" className="text-[10px]">شما</Badge>}
                    {u.phone && <span className="text-[11px] text-muted-foreground flex items-center gap-0.5"><Phone className="size-3" /><span dir="ltr">{toFaDigits(u.phone)}</span></span>}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {u.roles.map((r) => <RoleBadge key={r} roleKey={r} />)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <div className="text-sm font-black text-gold">{toFaDigits(u.points)}</div>
                    <div className="text-[10px] text-muted-foreground">امتیاز</div>
                  </div>
                  <div className="flex items-center gap-1.5" title={u.active ? 'فعال' : 'غیرفعال'}>
                    <Switch checked={u.active} disabled={busyId === u.id} onCheckedChange={() => toggleActive(u)} aria-label={`فعال/غیرفعال ${u.name}`} />
                    <span className="text-[10px] text-muted-foreground w-10">{u.active ? 'فعال' : 'غیرفعال'}</span>
                  </div>
                  <Button variant="outline" size="icon" className="size-9" aria-label={`ویرایش ${u.name}`} onClick={() => setEdit(u)}>
                    <Pencil className="size-4" />
                  </Button>
                </div>
              </div>
            </GlowCard>
          ))}
        </div>
      )}

      <UserFormDialog open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load() }} />
      <UserFormDialog open={!!edit} edit={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />
    </div>
  )
}

function UserFormDialog({ open, edit, onClose, onSaved }: {
  open: boolean
  edit?: AdminUser | null
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [busy, setBusy] = React.useState(false)
  const [name, setName] = React.useState('')
  const [roles, setRoles] = React.useState<string[]>([])
  const [primaryRole, setPrimaryRole] = React.useState('')
  const [color, setColor] = React.useState(COLOR_PALETTE[0])
  const [phone, setPhone] = React.useState('')
  const [pin, setPin] = React.useState('')

  React.useEffect(() => {
    if (open) {
      setName(edit?.name || '')
      setRoles(edit?.roles || [])
      setPrimaryRole(edit?.primaryRole || '')
      setColor(edit?.color || COLOR_PALETTE[0])
      setPhone(edit?.phone || '')
      setPin('')
    }
  }, [open, edit])

  function toggleRole(r: string) {
    setRoles((prev) => {
      const next = prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
      if (primaryRole && !next.includes(primaryRole)) setPrimaryRole(next[0] || '')
      if (!primaryRole && next.length) setPrimaryRole(next[0])
      return next
    })
  }

  async function save() {
    if (!name.trim() || !roles.length) {
      toast({ title: 'خطا', description: 'نام و حداقل یک نقش الزامی است', variant: 'destructive' })
      return
    }
    if (!edit && pin.length < 4) {
      toast({ title: 'خطا', description: 'رمز ورود (PIN) حداقل ۴ رقم است', variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      if (edit) {
        await api.patch('/api/users', {
          id: edit.id, name, roles, primaryRole: primaryRole || roles[0], color, phone: phone || null,
          ...(pin ? { pin } : {}),
        })
        toast({ title: 'ذخیره شد ✅', description: 'اطلاعات کاربر به‌روزرسانی شد.' })
      } else {
        await api.post('/api/users', { name, pin, roles, primaryRole: primaryRole || roles[0], color, phone: phone || null })
        toast({ title: 'کاربر ایجاد شد 🎉', description: `${name} می‌تواند با رمز وارد شود.` })
      }
      onSaved()
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'ذخیره ناموفق بود', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-gold" /> {edit ? `ویرایش ${edit.name}` : 'ایجاد کاربر جدید'}</DialogTitle>
          <DialogDescription>{edit ? 'تغییر نقش‌ها و اطلاعات کاربر' : 'کاربر جدید با رمز ورود ایجاد کنید'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label>نام *</Label>
            <Input className="h-11" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً خانم کریمی" />
          </div>
          <div className="space-y-1.5">
            <Label>نقش‌ها * (چند انتخابی)</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {Object.entries(ROLES).map(([key, r]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleRole(key)}
                  className={cn(
                    'rounded-lg border px-2 py-2 text-[11px] font-bold text-right transition-all',
                    roles.includes(key) ? 'text-white border-transparent shadow-sm' : 'bg-card border-gold/25 hover:border-gold/60'
                  )}
                  style={roles.includes(key) ? { background: r.color } : undefined}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
          {roles.length > 0 && (
            <div className="space-y-1.5">
              <Label>نقش اصلی (نمایش در هدر)</Label>
              <select
                className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                value={primaryRole || roles[0]}
                onChange={(e) => setPrimaryRole(e.target.value)}
              >
                {roles.map((r) => <option key={r} value={r}>{ROLES[r]?.name || r}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>رنگ کاربر</Label>
            <div className="flex flex-wrap gap-2">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`رنگ ${c}`}
                  onClick={() => setColor(c)}
                  className={cn('size-8 rounded-full transition-all', color === c ? 'ring-2 ring-offset-2 ring-gold scale-110' : 'hover:scale-105')}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>شماره تماس</Label>
              <Input className="h-11" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0913..." />
            </div>
            <div className="space-y-1.5">
              <Label>{edit ? 'تغییر رمز (خالی = بدون تغییر)' : 'رمز ورود (PIN) *'}</Label>
              <Input className="h-11" dir="ltr" inputMode="numeric" value={pin} onChange={(e) => setPin(toEnDigits(e.target.value).replace(/\D/g, '').slice(0, 6))} placeholder={edit ? '••••' : 'مثلاً 1234'} />
            </div>
          </div>
          <Button className="w-full h-12 bg-olive hover:bg-olive/90 font-bold" disabled={busy} onClick={save}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : edit ? 'ذخیره تغییرات' : 'ایجاد کاربر'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* =============== holidays tab =============== */

interface Holiday { id: string; date: string; title: string }

function HolidaysTab() {
  const { toast } = useToast()
  const [holidays, setHolidays] = React.useState<Holiday[]>([])
  const [loading, setLoading] = React.useState(true)
  const [date, setDate] = React.useState('')
  const [title, setTitle] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [fetching, setFetching] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setHolidays(await api.get<Holiday[]>('/api/holidays'))
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'خطا در دریافت تعطیلات', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  React.useEffect(() => { load() }, [load])

  async function add() {
    if (!date || !title.trim()) {
      toast({ title: 'خطا', description: 'تاریخ و عنوان تعطیلی الزامی است', variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      await api.post('/api/holidays', { date, title })
      toast({ title: 'تعطیلی اضافه شد 🎉', description: `${title} — ${toFaDigits(date)}` })
      setDate(''); setTitle('')
      load()
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'ثبت ناموفق بود', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  async function remove(h: Holiday) {
    try {
      await api.delete(`/api/holidays?id=${h.id}`)
      toast({ title: 'حذف شد', description: `${h.title} از تعطیلات حذف شد.` })
      load()
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'حذف ناموفق بود', variant: 'destructive' })
    }
  }

  async function fetchFromWeb() {
    setFetching(true)
    try {
      const res = await api.post<{ ok: boolean; message: string }>('/api/settings/fetch-holidays')
      if (res.ok) toast({ title: 'بروزرسانی موفق 🌐', description: res.message })
      else toast({ title: 'بروزرسانی خودکار انجام نشد', description: res.message })
      load()
    } catch (e) {
      toast({ title: 'بروزرسانی خودکار در دسترس نیست', description: e instanceof Error ? e.message : 'لطفاً دستی وارد کنید' })
    } finally {
      setFetching(false)
    }
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-3">
      <GlowCard className="p-4 space-y-3">
        <div className="font-extrabold flex items-center gap-2"><CalendarDays className="size-5 text-gold" /> افزودن تعطیلی رسمی</div>
        <div className="grid sm:grid-cols-[1fr_2fr_auto] gap-2 items-end">
          <div className="space-y-1.5">
            <Label>تاریخ</Label>
            <JalaliDatePicker value={date} onChange={setDate} placeholder="انتخاب تاریخ" />
          </div>
          <div className="space-y-1.5">
            <Label>عنوان</Label>
            <Input className="h-11" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً عید نوروز" onKeyDown={(e) => e.key === 'Enter' && add()} />
          </div>
          <Button className="h-11 bg-olive hover:bg-olive/90" disabled={busy} onClick={add}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : 'افزودن'}
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gold/15 pt-3">
          <div className="text-xs text-muted-foreground">تعطیلات در تقویم چک‌ها و انتخاب تاریخ‌ها با رنگ قرمز نمایش داده می‌شوند.</div>
          <Button variant="outline" className="h-10 gap-1.5" disabled={fetching} onClick={fetchFromWeb}>
            {fetching ? <Loader2 className="size-4 animate-spin" /> : <Globe className="size-4" />} بروزرسانی از اینترنت
          </Button>
        </div>
      </GlowCard>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
      ) : holidays.length === 0 ? (
        <EmptyState icon="📅" title="تعطیلی ثبت نشده است" description="اولین تعطیلی رسمی را اضافه کنید." />
      ) : (
        <div className="space-y-1.5 max-h-[480px] overflow-y-auto pl-1">
          {holidays.map((h) => {
            const past = h.date < today
            return (
              <div key={h.id} className={cn('flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5', past ? 'border-gold/10 bg-card/50 opacity-70' : 'border-gold/25 bg-card')}>
                <div className="flex items-center gap-3 min-w-0">
                  <span className={cn('font-black text-sm tabular-nums shrink-0', h.date < '1405/01/01' ? 'text-muted-foreground' : 'text-gold')} dir="ltr">{toFaDigits(h.date)}</span>
                  <span className={cn('font-bold text-sm truncate', past && 'line-through')}>{h.title}</span>
                </div>
                <Button variant="ghost" size="icon" className="size-8 text-red-500 shrink-0" aria-label={`حذف ${h.title}`} onClick={() => remove(h)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* =============== audit tab =============== */

function AuditTab() {
  const { toast } = useToast()
  const [rows, setRows] = React.useState<AuditRow[]>([])
  const [users, setUsers] = React.useState<AdminUser[]>([])
  const [loading, setLoading] = React.useState(true)
  const [userFilter, setUserFilter] = React.useState('')
  const [actionFilter, setActionFilter] = React.useState('')
  const [page, setPage] = React.useState(0)

  React.useEffect(() => {
    api.get<AdminUser[]>('/api/users').then(setUsers).catch(() => {})
  }, [])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setRows(await api.get<AuditRow[]>('/api/audit?limit=500'))
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'خطا در دریافت گزارش', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  React.useEffect(() => { load() }, [load])

  const filtered = rows.filter((r) => {
    if (userFilter && r.userId !== userFilter) return false
    if (actionFilter && r.action !== actionFilter) return false
    return true
  })

  const actions = [...new Set(rows.map((r) => r.action))].sort()
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select
          className="h-11 rounded-xl border border-input bg-background px-3 text-sm min-w-[150px]"
          value={userFilter}
          onChange={(e) => { setUserFilter(e.target.value); setPage(0) }}
        >
          <option value="">همه کاربران</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select
          className="h-11 rounded-xl border border-input bg-background px-3 text-sm min-w-[180px]"
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(0) }}
        >
          <option value="">همه عملیات</option>
          {actions.map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}
        </select>
        <Button variant="outline" className="h-11 gap-1.5" onClick={load}><RefreshCw className="size-4" /> بروزرسانی</Button>
        <div className="flex-1" />
        <div className="text-sm text-muted-foreground self-center">{toFaDigits(filtered.length)} رخداد</div>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : pageRows.length === 0 ? (
        <EmptyState icon="📜" title="رخدادی یافت نشد" description="با تغییر فیلترها دوباره تلاش کنید." />
      ) : (
        <>
          <div className="space-y-1.5">
            {pageRows.map((r) => (
              <GlowCard key={r.id} className="p-3">
                <details>
                  <summary className="flex flex-wrap items-center gap-2 cursor-pointer select-none list-none">
                    <span className="font-bold text-sm">{r.userName}</span>
                    <Badge variant="secondary" className="text-[10px]">{actionLabel(r.action)}</Badge>
                    <span className="text-[10px] text-muted-foreground bg-accent rounded-full px-2 py-0.5">{r.entityType}</span>
                    <span className="flex-1" />
                    <span className="text-[11px] text-muted-foreground">{formatJalaliDateTime(r.createdAt)}</span>
                  </summary>
                  <div className="mt-2 text-xs space-y-1 border-t border-gold/15 pt-2">
                    <div>شناسه: <span className="font-mono" dir="ltr">{r.entityId || '—'}</span></div>
                    {r.details && (
                      <pre className="bg-accent rounded-lg p-2 overflow-x-auto text-[10px] whitespace-pre-wrap" dir="ltr">
                        {JSON.stringify(JSON.parse(r.details), null, 1)}
                      </pre>
                    )}
                  </div>
                </details>
              </GlowCard>
            ))}
          </div>
          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" size="icon" className="size-9" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="صفحه قبل">
                <ChevronRight className="size-4" />
              </Button>
              <span className="text-sm font-bold">صفحه {toFaDigits(page + 1)} از {toFaDigits(pageCount)}</span>
              <Button variant="outline" size="icon" className="size-9" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)} aria-label="صفحه بعد">
                <ChevronLeft className="size-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* =============== settings tab =============== */

function SettingsTab() {
  const { toast } = useToast()
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [storeName, setStoreName] = React.useState('')
  const [lowStockAlerts, setLowStockAlerts] = React.useState(true)
  const [overlookThreshold, setOverlookThreshold] = React.useState('1000')
  const [deliveryDays, setDeliveryDays] = React.useState('1')

  React.useEffect(() => {
    api.get<Record<string, string>>('/api/settings')
      .then((s) => {
        setStoreName(s.store_name || '')
        setLowStockAlerts(s.low_stock_alerts !== 'false')
        setOverlookThreshold(s.overlook_threshold || '1000')
        setDeliveryDays(s.default_delivery_days || '1')
      })
      .catch((e) => toast({ title: 'خطا', description: e instanceof Error ? e.message : 'خطا در دریافت تنظیمات', variant: 'destructive' }))
      .finally(() => setLoading(false))
  }, [toast])

  async function save() {
    setBusy(true)
    try {
      await api.patch('/api/settings', {
        settings: {
          store_name: storeName,
          low_stock_alerts: String(lowStockAlerts),
          overlook_threshold: String(toEnDigits(overlookThreshold).replace(/\D/g, '') || '0'),
          default_delivery_days: String(toEnDigits(deliveryDays).replace(/\D/g, '') || '1'),
        },
      })
      toast({ title: 'تنظیمات ذخیره شد ✅', description: 'تغییرات برای همه تیم اعمال شد.' })
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'ذخیره ناموفق بود', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
  }

  return (
    <div className="max-w-2xl space-y-3">
      <GlowCard className="p-5 space-y-4">
        <div className="font-extrabold flex items-center gap-2"><Settings2 className="size-5 text-gold" /> تنظیمات فروشگاه</div>
        <div className="space-y-1.5">
          <Label>نام فروشگاه</Label>
          <Input className="h-11" value={storeName} onChange={(e) => setStoreName(e.target.value)} />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-gold/20 p-3.5">
          <div>
            <div className="font-bold text-sm">هشدار کمبود موجودی</div>
            <div className="text-xs text-muted-foreground mt-0.5">وقتی کالایی رو به اتمام است، در داشبورد هشدار داده شود</div>
          </div>
          <Switch checked={lowStockAlerts} onCheckedChange={setLowStockAlerts} aria-label="هشدار کمبود موجودی" />
        </div>
        <div className="space-y-1.5">
          <Label>آستانه نظارت (تومان)</Label>
          <Input className="h-11" dir="ltr" inputMode="numeric" value={overlookThreshold} onChange={(e) => setOverlookThreshold(e.target.value)} />
          <div className="text-xs text-muted-foreground">تراکنش‌های بالای این مبلغ با دقت بیشتری بررسی می‌شوند — فعلاً: {formatMoney(Number(toEnDigits(overlookThreshold).replace(/\D/g, '') || 0))} تومان</div>
        </div>
        <div className="space-y-1.5">
          <Label>مهلت پیش‌فرض تحویل سفارش (روز)</Label>
          <Input className="h-11" dir="ltr" inputMode="numeric" value={deliveryDays} onChange={(e) => setDeliveryDays(e.target.value)} />
          <div className="text-xs text-muted-foreground">در سفارش جدید، تاریخ تحویل به‌طور خودکار این چند روز بعد پیشنهاد می‌شود</div>
        </div>
        <Button className="w-full h-12 bg-olive hover:bg-olive/90 font-bold" disabled={busy} onClick={save}>
          {busy ? <Loader2 className="size-5 animate-spin" /> : 'ذخیره تنظیمات'}
        </Button>
      </GlowCard>
    </div>
  )
}

/* =============== stress test & health tab =============== */

interface StressHealth {
  counts: Record<string, number>
  census: Record<string, number>
  totalRows: number
  dbSizeBytes: number
  memory: { rssMB: number; heapMB: number }
  uptimeSec: number
  node: string
  now: string
  lastRun: { at: string; phase: string; scale?: string; totalRows?: number; totalMs?: number } | null
  history?: StressHistoryEntry[]
}

interface StressHistoryEntry {
  at: string
  atJalali: string
  scale: string
  totalRows: number
  probeMs: number
  worstP95: number
  probeCount: number
}

const SCALE_CHIP: Record<string, { label: string; cls: string }> = {
  SMALL: { label: 'کوچک', cls: 'bg-[#e8f5ec] text-[#2f7d4f]' },
  MEDIUM: { label: 'متوسط', cls: 'bg-[#fdf3e0] text-[#a06d0f]' },
  LARGE: { label: 'بزرگ', cls: 'bg-[#fdeaea] text-[#a33f3f]' },
  PROBE: { label: 'فقط سنجش', cls: 'bg-[#e8f0f5] text-[#4f6d7d]' },
}

function gradeEmoji(p95: number): string {
  return p95 < 60 ? '🌟' : p95 < 150 ? '👍' : '⚠️'
}

interface SeedStep { table: string; label: string; inserted: number; ms: number }
interface ProbeRes { key: string; label: string; avg: number; p95: number; max: number; runs: number[] }

const SCALE_CARDS: { key: string; label: string; est: number; desc: string }[] = [
  { key: 'SMALL', label: 'کوچک', est: 800, desc: 'دادهٔ سبک — بررسی سریع' },
  { key: 'MEDIUM', label: 'متوسط', est: 2500, desc: 'شبیه‌سازی یک هفته شلوغ' },
  { key: 'LARGE', label: 'بزرگ', est: 5500, desc: 'فشار سنگین — تست حدود' },
]

const TABLE_LABELS: Record<string, string> = {
  users: 'کاربران', products: 'کالاها', orders: 'سفارشات', orderItems: 'اقلام سفارش',
  cheques: 'چک‌ها', tasks: 'وظایف', activities: 'فعالیت‌ها', saleOrders: 'فروش',
  customers: 'مشتریان', warehouseRequests: 'درخواست انبار', shifts: 'شیفت‌ها',
  auditLogs: 'رخدادها', messages: 'پیام‌ها', notes: 'یادداشت‌ها',
}

function fmtBytes(b: number): string {
  if (b >= 1048576) return `${toFaDigits((b / 1048576).toFixed(1))} مگابایت`
  return `${toFaDigits(Math.round(b / 1024))} کیلوبایت`
}

function LatencyPill({ ms }: { ms: number }) {
  const ok = ms < 40, warn = ms < 120
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums',
        ok ? 'bg-[#e8f5ec] text-[#2f7d4f]' : warn ? 'bg-[#fdf3e0] text-[#a06d0f]' : 'bg-[#fdeaea] text-[#a33f3f]'
      )}
      dir="ltr"
    >
      {toFaDigits(ms)} <span className="font-bold">ms</span>
    </span>
  )
}

function StressTab() {
  const { toast } = useToast()
  const [health, setHealth] = React.useState<StressHealth | null>(null)
  const [scale, setScale] = React.useState('MEDIUM')
  const [phase, setPhase] = React.useState<'idle' | 'seeding' | 'probing' | 'done'>('idle')
  const [steps, setSteps] = React.useState<SeedStep[]>([])
  const [probes, setProbes] = React.useState<ProbeRes[]>([])
  const [totals, setTotals] = React.useState<{ rows: number; ms: number } | null>(null)
  const [cleaning, setCleaning] = React.useState(false)
  const [csvBusy, setCsvBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      setHealth(await api.get<StressHealth>('/api/admin/stress'))
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'خطا در دریافت وضعیت', variant: 'destructive' })
    }
  }, [toast])

  React.useEffect(() => { load() }, [load])

  const stressCount = health ? Object.values(health.census).reduce((a: number, b) => a + (b as number), 0) : 0
  const running = phase === 'seeding' || phase === 'probing'

  async function runSeed(): Promise<boolean> {
    setPhase('seeding')
    try {
      const r = await api.post<{ steps: SeedStep[]; totalRows: number; totalMs: number }>('/api/admin/stress', { action: 'seed', scale })
      setSteps(r.steps)
      setTotals({ rows: r.totalRows, ms: r.totalMs })
      return true
    } catch (e) {
      toast({ title: 'خطا در ساخت داده', description: e instanceof Error ? e.message : '', variant: 'destructive' })
      setPhase('idle')
      return false
    }
  }

  async function runProbe(): Promise<boolean> {
    setPhase('probing')
    try {
      const r = await api.post<{ probes: ProbeRes[]; totalMs: number }>('/api/admin/stress', { action: 'probe' })
      setProbes(r.probes)
      if (!totals) setTotals({ rows: 0, ms: r.totalMs })
      setPhase('done')
      return true
    } catch (e) {
      toast({ title: 'خطا در سنجش', description: e instanceof Error ? e.message : '', variant: 'destructive' })
      setPhase('idle')
      return false
    }
  }

  async function runFull() {
    setSteps([]); setProbes([]); setTotals(null)
    if (await runSeed()) await runProbe()
    load()
  }

  async function downloadHistoryCsv() {
    setCsvBusy(true)
    try {
      const stored = getStoredUser()
      const res = await fetch('/api/admin/stress/history-csv', { headers: { Authorization: `Bearer ${stored?.token || ''}` } })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || 'خطا در تولید فایل')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'zeytoon-stress-history.csv'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast({ title: 'خروجی CSV آماده است 🧪', description: 'روند آزمون‌های فشار دانلود شد — در آرشیو خروجی‌ها هم ثبت شد.' })
    } catch (e) {
      toast({ title: 'دریافت فایل ناموفق بود', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setCsvBusy(false)
    }
  }

  async function cleanup() {
    setCleaning(true)
    try {
      const r = await api.post<{ removed: number; totalMs: number; vacuumMs?: number }>('/api/admin/stress', { action: 'cleanup' })
      toast({ title: 'پاکسازی انجام شد 🧹', description: `${toFaDigits(r.removed)} ردیف آزمایشی در ${toFaDigits(r.totalMs)} میلی‌ثانیه حذف شد${r.vacuumMs ? ` — فشردگی پایگاه داده: ${toFaDigits(r.vacuumMs)}ms` : ''}.` })
      setSteps([]); setProbes([]); setTotals(null); setPhase('idle')
      load()
    } catch (e) {
      toast({ title: 'خطا در پاکسازی', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setCleaning(false)
    }
  }

  const maxRps = Math.max(...steps.map((s) => (s.ms > 0 ? s.inserted / (s.ms / 1000) : 0)), 1)
  const worstP95 = Math.max(...probes.map((p) => p.p95), 0)
  const grade = probes.length === 0 ? null : worstP95 < 60 ? { t: 'عالی', c: '#2f7d4f', e: '🌟' } : worstP95 < 150 ? { t: 'قابل قبول', c: '#a06d0f', e: '👍' } : { t: 'نیازمند بهبود', c: '#a33f3f', e: '⚠️' }
  const PHASES = [
    { key: 'seeding', label: 'ساخت داده', icon: FlaskConical },
    { key: 'probing', label: 'سنجش کوئری‌ها', icon: Zap },
    { key: 'done', label: 'گزارش نهایی', icon: HeartPulse },
  ]
  const phaseIdx = phase === 'idle' ? -1 : phase === 'seeding' ? 0 : phase === 'probing' ? 1 : 2

  if (!health) {
    return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
  }

  return (
    <div className="space-y-4">
      {/* health snapshot */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: HardDrive, label: 'حجم دیتابیس', value: fmtBytes(health.dbSizeBytes), tint: 'bg-olive/10 text-olive' },
          { icon: MemoryStick, label: 'حافظه سرور', value: `${toFaDigits(health.memory.rssMB)} مگابایت`, tint: 'bg-gold/10 text-gold' },
          { icon: Timer, label: 'آپ‌تایم سرویس', value: `${toFaDigits(Math.floor(health.uptimeSec / 60))} دقیقه`, tint: 'bg-[#f0e7f3] text-[#6d4f7d]' },
          { icon: Database, label: 'کل ردیف‌ها', value: toFaDigits(health.totalRows), tint: 'bg-[#e8f3f5] text-[#4f6d7d]' },
        ].map((c, i) => (
          <GlowCard key={i} className="p-4 animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex items-center gap-3">
              <span className={cn('size-10 rounded-xl grid place-items-center shrink-0', c.tint)}><c.icon className="size-5" /></span>
              <div className="min-w-0">
                <div className="text-lg font-black tabular-nums leading-tight">{c.value}</div>
                <div className="text-[11px] text-muted-foreground">{c.label}</div>
              </div>
            </div>
          </GlowCard>
        ))}
      </div>

      {/* table census */}
      <GlowCard className="p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Database className="size-4.5 text-gold" />
          <span className="font-extrabold text-sm">وضعیت جداول</span>
          <span className="text-[11px] text-muted-foreground">Node {health.node}</span>
          <span className="flex-1" />
          {health.lastRun && (
            <Badge variant="secondary" className="text-[10px] gap-1">
              آخرین آزمون: {formatJalaliDateTime(health.lastRun.at)}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(health.counts).map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1.5 rounded-full border border-gold/20 bg-accent/50 px-2.5 py-1 text-[11px]">
              {TABLE_LABELS[k] || k}
              <b className={cn('tabular-nums', v > 1000 ? 'text-gold' : 'text-olive')}>{toFaDigits(v)}</b>
            </span>
          ))}
        </div>
      </GlowCard>

      {/* stress data warning */}
      {stressCount > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 flex flex-wrap items-center gap-3 animate-in fade-in slide-in-from-top-1">
          <span className="text-xl">🧪</span>
          <div className="flex-1 min-w-[200px]">
            <div className="font-extrabold text-sm text-[#8a5a0f]">{toFaDigits(stressCount)} ردیف دادهٔ آزمایشی در پایگاه داده هست</div>
            <div className="text-xs text-[#8a5a0f]/80 mt-0.5">
              {Object.entries(health.census).filter(([, v]) => v > 0).map(([k, v]) => `${TABLE_LABELS[k] || k}: ${toFaDigits(v)}`).join(' • ')}
            </div>
          </div>
          <Button size="sm" className="h-10 gap-1.5 bg-[#a06d0f] hover:bg-[#8a5a0f]" disabled={cleaning || running} onClick={cleanup}>
            {cleaning ? <Loader2 className="size-4 animate-spin" /> : <Eraser className="size-4" />} پاکسازی فوری
          </Button>
        </div>
      )}

      {/* runner */}
      <GlowCard className="p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <FlaskConical className="size-5 text-gold" />
          <span className="font-extrabold">اجرای آزمون فشار</span>
          <span className="text-xs text-muted-foreground">— دادهٔ آزمایشی با نشان 🧪 ساخته می‌شود و بعداً به‌طور کامل قابل حذف است</span>
        </div>

        {/* scale selector */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {SCALE_CARDS.map((s) => (
            <button
              key={s.key}
              type="button"
              disabled={running}
              onClick={() => setScale(s.key)}
              aria-pressed={scale === s.key}
              className={cn(
                'relative rounded-xl border-2 p-3.5 text-right transition-all focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:outline-none',
                scale === s.key
                  ? 'border-gold bg-gold/[0.07] shadow-[0_0_14px_rgba(201,162,39,0.18)]'
                  : 'border-gold/20 bg-card hover:border-gold/50',
                running && 'opacity-60 cursor-not-allowed'
              )}
            >
              {scale === s.key && (
                <span className="absolute top-2 left-2 size-2 rounded-full bg-gold ring-4 ring-gold/20" aria-hidden />
              )}
              <div className="font-extrabold text-sm flex items-center gap-1.5">
                {s.label}
                <span className="text-[10px] font-bold text-muted-foreground">~{toFaDigits(s.est)} ردیف</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{s.desc}</div>
            </button>
          ))}
        </div>

        {/* phase stepper */}
        <div className="flex items-center gap-2 px-2">
          {PHASES.map((p, i) => (
            <React.Fragment key={p.key}>
              <div className={cn('flex items-center gap-1.5 transition-opacity', phaseIdx >= i ? 'opacity-100' : 'opacity-40')}>
                <span className={cn(
                  'size-7 rounded-full grid place-items-center border-2 transition-colors',
                  phaseIdx > i ? 'bg-olive border-olive text-white' : phaseIdx === i ? 'border-gold text-gold bg-gold/10 animate-pulse-gold' : 'border-muted-foreground/30 text-muted-foreground/50'
                )}>
                  {phaseIdx > i ? '✓' : <p.icon className="size-3.5" />}
                </span>
                <span className={cn('text-xs font-bold', phaseIdx === i && 'text-gold')}>{p.label}</span>
              </div>
              {i < PHASES.length - 1 && <div className={cn('flex-1 h-0.5 rounded-full', phaseIdx > i ? 'bg-olive' : 'bg-muted')} />}
            </React.Fragment>
          ))}
        </div>

        {/* actions */}
        <div className="flex flex-wrap gap-2">
          <Button className="h-11 gap-2 bg-olive hover:bg-olive/90 font-bold" disabled={running || cleaning} onClick={runFull}>
            {running ? <Loader2 className="size-4.5 animate-spin" /> : <PlayCircle className="size-4.5" />}
            {phase === 'seeding' ? 'در حال ساخت داده…' : phase === 'probing' ? 'در حال سنجش…' : 'اجرای کامل آزمون'}
          </Button>
          <Button variant="outline" className="h-11 gap-2 border-gold/40 text-gold hover:bg-gold/10" disabled={running || cleaning} onClick={async () => { setProbes([]); if (await runProbe()) load() }}>
            <Zap className="size-4.5" /> فقط سنجش کوئری‌ها
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="h-11 gap-2 border-red-200 text-red-600 hover:bg-red-50" disabled={running || cleaning || stressCount === 0}>
                <Eraser className="size-4.5" /> پاکسازی داده‌های آزمون
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle>حذف داده‌های آزمایشی؟</AlertDialogTitle>
                <AlertDialogDescription>
                  همهٔ ردیف‌های دارای نشان 🧪 (کالا، سفارش، فعالیت، وظیفه و…) برای همیشه حذف می‌شوند. داده‌های واقعی تیم دست‌نخورده می‌مانند.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel>انصراف</AlertDialogCancel>
                <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={cleanup}>حذف شود</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </GlowCard>

      {/* run history trend */}
      {(health.history?.length || 0) > 0 && (
        <GlowCard className="p-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <History className="size-4.5 text-gold" />
            <span className="font-extrabold text-sm">روند آزمون‌های اخیر</span>
            <span className="text-[11px] text-muted-foreground">(۱۵ اجرای آخر — برای مقایسهٔ وضعیت سرور در طول زمان)</span>
            <span className="flex-1" />
            <Badge variant="secondary" className="text-[10px]">
              بدترین p95 فعلی: {toFaDigits(Math.max(...(health.history || []).map((h) => h.worstP95), 0))}ms
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border-gold/40 text-gold hover:bg-gold/10"
              disabled={csvBusy}
              onClick={downloadHistoryCsv}
            >
              {csvBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              خروجی CSV
            </Button>
          </div>
          <div className="space-y-1.5">
            {(health.history || []).slice(0, 8).map((h, i) => {
              const maxP95 = Math.max(...(health.history || []).map((x) => x.worstP95), 1)
              const w = Math.max(5, Math.round((h.worstP95 / maxP95) * 100))
              const chip = SCALE_CHIP[h.scale] || SCALE_CHIP.PROBE
              const ok = h.worstP95 < 40, warn = h.worstP95 < 120
              return (
                <div
                  key={h.at}
                  className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-accent/40 transition-colors animate-in fade-in slide-in-from-bottom-1 duration-300"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-black shrink-0 w-16 text-center', chip.cls)}>
                    {chip.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground tabular-nums w-28 shrink-0 hidden sm:block">{h.atJalali}</span>
                  <div className="flex-1 h-2 rounded-full bg-accent overflow-hidden min-w-10" title={`بدترین p95: ${h.worstP95}ms`}>
                    <div
                      className={cn('h-full rounded-full transition-all duration-700', ok ? 'bg-olive' : warn ? 'bg-gold' : 'bg-red-500')}
                      style={{ width: `${w}%` }}
                    />
                  </div>
                  <span className={cn('text-[11px] font-black tabular-nums w-14 text-left shrink-0', ok ? 'text-olive' : warn ? 'text-gold' : 'text-red-500')}>
                    {toFaDigits(h.worstP95)}ms
                  </span>
                  <span className="text-[10px] text-muted-foreground tabular-nums w-16 shrink-0 hidden md:block">{toFaDigits(h.totalRows)} ردیف</span>
                  <span className="text-sm shrink-0" aria-hidden>{gradeEmoji(h.worstP95)}</span>
                </div>
              )
            })}
          </div>
        </GlowCard>
      )}

      {/* insert results */}
      {steps.length > 0 && (
        <GlowCard className="p-5 space-y-3 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex flex-wrap items-center gap-2">
            <FlaskConical className="size-4.5 text-gold" />
            <span className="font-extrabold text-sm">نتیجهٔ ساخت داده</span>
            <span className="flex-1" />
            {totals && totals.rows > 0 && (
              <Badge className="bg-olive text-white text-[11px]">{toFaDigits(totals.rows)} ردیف در {toFaDigits(totals.ms)} میلی‌ثانیه</Badge>
            )}
          </div>
          <div className="space-y-2">
            {steps.map((s, i) => {
              const rps = s.ms > 0 ? s.inserted / (s.ms / 1000) : 0
              const w = Math.max(6, Math.round((rps / maxRps) * 100))
              return (
                <div key={s.table} className="animate-in fade-in slide-in-from-right-2 duration-300" style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-bold">{s.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {toFaDigits(s.inserted)} ردیف • {toFaDigits(s.ms)}ms • <b className="text-gold">{toFaDigits(Math.round(rps))}</b> ردیف/ثانیه
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-accent overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-l from-gold to-olive transition-all duration-700"
                      style={{ width: `${w}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </GlowCard>
      )}

      {/* probe results */}
      {probes.length > 0 && (
        <GlowCard className="p-5 space-y-3 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex flex-wrap items-center gap-2">
            <Zap className="size-4.5 text-gold" />
            <span className="font-extrabold text-sm">سنجش سرعت کوئری‌ها</span>
            <span className="text-[11px] text-muted-foreground">(۶ بار اجرا برای هر سناریو)</span>
            <span className="flex-1" />
            {grade && (
              <Badge className="text-white text-[11px] gap-1" style={{ background: grade.c }}>
                {grade.e} ارزیابی کلی: {grade.t}
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {probes.map((p, i) => (
              <div
                key={p.key}
                className="rounded-xl border border-gold/15 bg-accent/30 p-3 flex items-center gap-3 animate-in fade-in slide-in-from-left-2 duration-300"
                style={{ animationDelay: `${i * 45}ms` }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold truncate">{p.label}</div>
                  <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">حداکثر: {toFaDigits(p.max)}ms</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <LatencyPill ms={p.avg} />
                  <span className="text-[9px] text-muted-foreground">p95: <LatencyPill ms={p.p95} /></span>
                </div>
              </div>
            ))}
          </div>
          <OrnamentDivider className="!my-1" />
          <p className="text-[11px] text-muted-foreground text-center">
            معیار سلامت: میانگین زیر ۴۰ms سبز • زیر ۱۲۰ms طلایی • بالاتر نیازمند بهبود ایندکس — سرور SQLite محلی است
          </p>
        </GlowCard>
      )}
    </div>
  )
}
