'use client'

import * as React from 'react'
import { api, downloadBlob } from '@/lib/api'
import { useApp } from '@/store/app'
import { useToast } from '@/hooks/use-toast'
import { SectionHeader, EmptyState, LoadingBlock, UserAvatar, ConfirmButton } from '@/components/platform/ui/shared'
import { JalaliDatePicker } from '@/components/platform/ui/jalali-date-picker'
import { formatJalali, toFaDigits } from '@/lib/jalali'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { UserCog, Plus, Loader2, Pencil, RefreshCw, CalendarDays, Trash2, ShieldCheck, KeyRound, Crown, BarChart3, Download, Activity, ChevronDown } from 'lucide-react'

interface RoleDTO {
  id: string
  key: string
  name: string
  description?: string | null
  color: string
  isManager: boolean
}

interface UserDTO {
  id: string
  username: string
  name: string
  title: string
  color: string
  phone?: string | null
  active: boolean
  points: number
  isRoot?: boolean
  isAdmin?: boolean
  roles: { key: string; name: string; isManager: boolean; color: string }[]
}

interface HolidayDTO {
  id: string
  date: string
  name: string
  source: string
}

const AVATAR_COLORS = ['#3E7C59', '#C9A227', '#D9832E', '#B33A3A', '#8A6F3C', '#5E8C61', '#7D5BA6', '#B07D2B']

const ROOT_BADGE_CLASS = 'rounded-full border border-[#c9a227]/60 bg-gradient-to-l from-[#c9a227] to-[#b07d2b] text-white text-[10px] px-2 py-0.5 font-bold'

export function Admin() {
  const { toast } = useToast()
  const me = useApp((s) => s.user)
  const isRootViewer = me?.isRoot === true
  const [users, setUsers] = React.useState<UserDTO[] | null>(null)
  const [roles, setRoles] = React.useState<RoleDTO[] | null>(null)
  const [userEditor, setUserEditor] = React.useState<{ open: boolean; user: UserDTO | null }>({ open: false, user: null })
  const [roleEditor, setRoleEditor] = React.useState<{ open: boolean; role: RoleDTO | null }>({ open: false, role: null })

  const load = React.useCallback(async () => {
    try {
      const d = await api<{ users: UserDTO[]; roles: RoleDTO[] }>('/api/users')
      setUsers(d.users)
      setRoles(d.roles)
    } catch {
      setUsers([])
      setRoles([])
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  const toggleActive = async (u: UserDTO) => {
    try {
      await api('/api/users', { method: 'PATCH', body: { id: u.id, active: !u.active } })
      toast({ title: u.active ? 'دسترسی همکار موقتاً متوقف شد' : 'دسترسی همکار فعال شد 🌿' })
      load()
    } catch (e) {
      toast({ title: 'انجام نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="کاربران و نقش‌ها"
        subtitle="حساب‌ها، دسترسی‌ها و روزهای تعطیل — همه در یک‌جا"
        icon={<UserCog className="h-5 w-5" />}
        actions={
          <Button size="sm" className="gap-1.5" onClick={() => setUserEditor({ open: true, user: null })}>
            <Plus className="h-4 w-4" /> کاربر جدید
          </Button>
        }
      />

      <Tabs defaultValue="users" dir="rtl">
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="users" className="flex-1 md:flex-none">همکاران</TabsTrigger>
          <TabsTrigger value="roles" className="flex-1 md:flex-none">نقش‌ها</TabsTrigger>
          <TabsTrigger value="holidays" className="flex-1 md:flex-none">تعطیلات</TabsTrigger>
          {isRootViewer && <TabsTrigger value="analytics" className="flex-1 md:flex-none gap-1"><BarChart3 className="h-3.5 w-3.5" /> تحلیل تعامل</TabsTrigger>}
        </TabsList>

        <TabsContent value="users" className="mt-3">
          {!users ? <LoadingBlock rows={4} /> : users.length === 0 ? (
            <EmptyState icon={<UserCog />} title="هنوز کاربری نیست" />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="max-h-[65vh] overflow-y-auto nice-scroll">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead className="text-right">همکار</TableHead>
                        <TableHead className="text-right hidden md:table-cell">نام کاربری</TableHead>
                        <TableHead className="text-right">نقش‌ها</TableHead>
                        <TableHead className="text-right hidden lg:table-cell">امتیاز</TableHead>
                        <TableHead className="text-right">فعال</TableHead>
                        <TableHead className="text-left">عملیات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => (
                        <TableRow key={u.id} className={!u.active ? 'opacity-50' : ''}>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <UserAvatar name={u.name} color={u.color} size={34} />
                              <div>
                                <p className="text-sm font-bold flex items-center gap-1.5 flex-wrap">
                                  {u.name}
                                  {u.isRoot && <span className={ROOT_BADGE_CLASS}>مدیر ارشد سامانه</span>}
                                </p>
                                <p className="text-[11px] text-muted-foreground">{u.title}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-xs num" dir="ltr">{u.username}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {u.roles.map((r) => (
                                <span
                                  key={r.key}
                                  className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                                  style={{ backgroundColor: `${r.color}1a`, color: r.color }}
                                >
                                  {r.name}{r.isManager && ' ★'}
                                </span>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell num text-xs">{toFaDigits(u.points)}</TableCell>
                          <TableCell>
                            <Switch checked={u.active} onCheckedChange={() => toggleActive(u)} />
                          </TableCell>
                          <TableCell className="text-left">
                            <Button size="sm" variant="ghost" className="h-9" onClick={() => setUserEditor({ open: true, user: u })}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          <ManagersCard users={users} isRootViewer={isRootViewer} meId={me?.id ?? null} onChanged={load} />
        </TabsContent>

        <TabsContent value="roles" className="mt-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-muted-foreground">نقش‌ها تعیین می‌کنند هر همکار چه بخش‌هایی می‌بیند. نقش‌های ستاره‌دار مدیریتی هستند.</p>
            <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setRoleEditor({ open: true, role: null })}>
              <Plus className="h-4 w-4" /> نقش جدید
            </Button>
          </div>
          {!roles ? <LoadingBlock rows={3} /> : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {roles.map((r) => (
                <button key={r.id} className="text-right" onClick={() => setRoleEditor({ open: true, role: r })}>
                  <Card className="transition-transform hover:-translate-y-0.5">
                    <CardContent className="p-4 flex items-start gap-3">
                      <span className="h-10 w-10 rounded-xl shrink-0 flex items-center justify-center" style={{ backgroundColor: `${r.color}1a`, color: r.color }}>
                        <ShieldCheck className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-sm flex items-center gap-1.5">
                          {r.name}
                          {r.isManager && <Badge className="rounded-full bg-gold/20 text-gold text-[10px]">مدیریتی</Badge>}
                        </p>
                        <p className="text-[11px] text-muted-foreground num mt-0.5" dir="ltr">{r.key}</p>
                        {r.description && <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{r.description}</p>}
                      </div>
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="holidays" className="mt-3">
          <HolidaysTab />
        </TabsContent>

        {isRootViewer && (
          <TabsContent value="analytics" className="mt-3">
            <AnalyticsTab />
          </TabsContent>
        )}
      </Tabs>

      <UserEditorDialog
        open={userEditor.open}
        user={userEditor.user}
        roles={roles ?? []}
        onClose={() => setUserEditor({ open: false, user: null })}
        onSaved={() => { setUserEditor({ open: false, user: null }); load() }}
      />
      <RoleEditorDialog
        open={roleEditor.open}
        role={roleEditor.role}
        onClose={() => setRoleEditor({ open: false, role: null })}
        onSaved={() => { setRoleEditor({ open: false, role: null }); load() }}
      />
    </div>
  )
}

// ---------- user create/edit ----------
function UserEditorDialog({
  open, user, roles, onClose, onSaved,
}: {
  open: boolean
  user: UserDTO | null
  roles: RoleDTO[]
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [username, setUsername] = React.useState('')
  const [name, setName] = React.useState('')
  const [title, setTitle] = React.useState('')
  const [pin, setPin] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [gender, setGender] = React.useState<'MALE' | 'FEMALE'>('MALE')
  const [color, setColor] = React.useState(AVATAR_COLORS[0])
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [active, setActive] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setUsername(user?.username ?? '')
      setName(user?.name ?? '')
      setTitle(user?.title ?? '')
      setPin('')
      setPhone(user?.phone ?? '')
      setGender((user as { gender?: string } | null)?.gender === 'FEMALE' ? 'FEMALE' : 'MALE')
      setColor(user?.color ?? AVATAR_COLORS[0])
      setSelected(new Set(user?.roles.map((r) => r.key) ?? []))
      setActive(user?.active ?? true)
    }
  }, [open, user])

  const toggleRole = (key: string) =>
    setSelected((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })

  const save = async () => {
    if (!name.trim() || (!user && (!username.trim() || pin.length !== 4))) return
    setSaving(true)
    try {
      if (user) {
        await api('/api/users', {
          method: 'PATCH',
          body: { id: user.id, name, title, phone, color, gender, active, roleKeys: Array.from(selected), ...(pin.length === 4 ? { pin } : {}) },
        })
        toast({ title: 'همکار بروز شد 🌿', description: pin ? 'رمز جدید فعال شد' : undefined })
      } else {
        await api('/api/users', {
          body: { username, name, title, pin, phone, color, gender, roleKeys: Array.from(selected) },
        })
        toast({ title: 'همکار جدید اضافه شد 🎉', description: 'رمز اولیه را به او بگویید' })
      }
      onSaved()
    } catch (e) {
      toast({ title: 'ذخیره نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{user ? 'ویرایش همکار' : 'همکار جدید'}</DialogTitle>
          <DialogDescription>
            {user ? 'تغییرات بلافاصله اعمال می‌شود.' : 'رمز چهاررقمی اولیه را انتخاب کن؛ همکار می‌تواند بعداً عوضش کند.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>نام و نام خانوادگی</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>نام کاربری</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} dir="ltr" className="text-left" disabled={!!user} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>عنوان شغلی</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: قفسه‌چین" />
            </div>
            <div className="space-y-1.5">
              <Label>تلفن</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" dir="ltr" className="num text-left" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>عنوان شغلی</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: قفسه‌چین" />
            </div>
            <div className="space-y-1.5">
              <Label>خطاب رسمی</Label>
              <div className="flex h-9 items-center gap-4 rounded-md border border-input bg-transparent px-3">
                <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                  <input type="radio" checked={gender === 'MALE'} onChange={() => setGender('MALE')} className="accent-[#3E7C59]" />
                  جناب آقای
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                  <input type="radio" checked={gender === 'FEMALE'} onChange={() => setGender('FEMALE')} className="accent-[#3E7C59]" />
                  سرکار خانم
                </label>
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{user ? 'رمز جدید (اختیاری — ۴ رقم)' : 'رمز ورود (۴ رقم)'}</Label>
            <div className="flex items-center gap-2">
              <Input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric" dir="ltr" className="num text-left tracking-[0.4em]" placeholder="••••"
              />
              {user && <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>رنگ آواتار</Label>
            <div className="flex gap-2">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c} type="button" onClick={() => setColor(c)} aria-label={`رنگ ${c}`}
                  className={`h-9 w-9 rounded-xl transition-transform ${color === c ? 'ring-2 ring-offset-2 ring-foreground scale-105' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>نقش‌ها</Label>
            <div className="flex flex-wrap gap-1.5">
              {roles.map((r) => (
                <button
                  key={r.key} type="button" onClick={() => toggleRole(r.key)}
                  className={`rounded-full px-3 py-1.5 text-xs border transition-colors min-h-9 ${
                    selected.has(r.key) ? 'text-white border-transparent' : 'bg-card hover:bg-accent'
                  }`}
                  style={selected.has(r.key) ? { backgroundColor: r.color } : { borderColor: `${r.color}55` }}
                >
                  {r.name}{r.isManager && ' ★'}
                </button>
              ))}
            </div>
          </div>
          {user && (
            <div className="flex items-center justify-between rounded-xl border p-3">
              <span className="text-sm">حساب فعال باشد</span>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>انصراف</Button>
            <Button onClick={save} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} ذخیره
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------- role create/edit ----------
function RoleEditorDialog({ open, role, onClose, onSaved }: { open: boolean; role: RoleDTO | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [key, setKey] = React.useState('')
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [color, setColor] = React.useState('#3E7C59')
  const [isManager, setIsManager] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setKey(role?.key ?? '')
      setName(role?.name ?? '')
      setDescription(role?.description ?? '')
      setColor(role?.color ?? '#3E7C59')
      setIsManager(role?.isManager ?? false)
    }
  }, [open, role])

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await api('/api/users', {
        method: 'PUT',
        body: { id: role?.id, key: key || undefined, name, description, color, isManager },
      })
      toast({ title: role ? 'نقش بروز شد 🌿' : 'نقش جدید ثبت شد 🎉' })
      onSaved()
    } catch (e) {
      toast({ title: 'ذخیره نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{role ? 'ویرایش نقش' : 'نقش جدید'}</DialogTitle>
          <DialogDescription>کلید نقش را در تعریف‌های داخلی استفاده می‌کنیم (انگلیسی، بدون فاصله).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>کلید</Label>
              <Input value={key} onChange={(e) => setKey(e.target.value)} dir="ltr" className="text-left" disabled={!!role} placeholder="e.g. baker" />
            </div>
            <div className="space-y-1.5">
              <Label>نام نمایشی</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>توضیح</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>رنگ</Label>
            <div className="flex gap-2">
              {['#3E7C59', '#C9A227', '#D9832E', '#B33A3A', '#8A6F3C', '#5E8C61', '#7D5BA6', '#B07D2B'].map((c) => (
                <button
                  key={c} type="button" onClick={() => setColor(c)} aria-label={`رنگ ${c}`}
                  className={`h-9 w-9 rounded-xl ${color === c ? 'ring-2 ring-offset-2 ring-foreground' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border p-3">
            <div>
              <p className="text-sm font-bold">نقش مدیریتی</p>
              <p className="text-[11px] text-muted-foreground">دسترسی به بخش‌های مدیریت و تأییدها</p>
            </div>
            <Switch checked={isManager} onCheckedChange={setIsManager} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>انصراف</Button>
            <Button onClick={save} disabled={saving || !name.trim()} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} ذخیره
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------- holidays ----------
function HolidaysTab() {
  const { toast } = useToast()
  const [holidays, setHolidays] = React.useState<HolidayDTO[] | null>(null)
  const [date, setDate] = React.useState<Date | null>(null)
  const [name, setName] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [syncing, setSyncing] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const d = await api<HolidayDTO[]>('/api/holidays')
      setHolidays(d)
    } catch {
      setHolidays([])
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  const add = async () => {
    if (!date || !name.trim()) return
    setSaving(true)
    try {
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      await api('/api/holidays', { body: { date: iso, name } })
      toast({ title: 'روز تعطیل ثبت شد 🌿' })
      setName('')
      setDate(null)
      load()
    } catch (e) {
      toast({ title: 'ثبت نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (h: HolidayDTO) => {
    try {
      await api(`/api/holidays?date=${h.date}`, { method: 'DELETE' })
      load()
    } catch (e) {
      toast({ title: 'حذف نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }

  const sync = async () => {
    setSyncing(true)
    try {
      const d = await api<{ added: number }>('/api/holidays', { method: 'PUT' })
      toast({ title: 'همگام‌سازی انجام شد ✅', description: d.added > 0 ? `${toFaDigits(d.added)} روز جدید از منابع رسمی اضافه شد` : 'فهرست به‌روز بود' })
      load()
    } catch (e) {
      toast({ title: 'همگام‌سازی نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="grid md:grid-cols-[20rem_1fr] gap-4 items-start">
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-bold flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" /> روز تعطیل جدید
          </p>
          <div className="space-y-1.5">
            <Label>تاریخ</Label>
            <JalaliDatePicker value={date} onChange={setDate} placeholder="انتخاب روز تعطیل" />
          </div>
          <div className="space-y-1.5">
            <Label>عنوان</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: عید سعید قربان" />
          </div>
          <Button className="w-full h-11 gap-1.5" onClick={add} disabled={!date || !name.trim() || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} ثبت تعطیلی
          </Button>
          <Button variant="outline" className="w-full h-11 gap-1.5" onClick={sync} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} همگام‌سازی از منابع رسمی
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-bold mb-3">تعطیلات پیش‌رو</p>
          {!holidays ? <LoadingBlock rows={3} /> : holidays.length === 0 ? (
            <EmptyState icon={<CalendarDays />} title="تعطیلی ثبت نشده" description="با همگام‌سازی، فهرست رسمی را برمی‌گردانیم." />
          ) : (
            <div className="space-y-1.5 max-h-96 overflow-y-auto nice-scroll">
              {holidays.map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-2 rounded-xl border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{h.name}</p>
                    <p className="text-[11px] text-muted-foreground num">{formatJalali(h.date)} · {h.source === 'TIME_IR' ? 'منبع رسمی' : h.source === 'MANUAL' ? 'دستی' : 'سیستم'}</p>
                  </div>
                  <ConfirmButton onConfirm={() => remove(h)} confirmText="حذف؟" variant="ghost" className="h-9 text-pomegranate shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </ConfirmButton>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------- مدیران سامانه (it_admin) — grant/revoke is root-only ----------
const ADMIN_ACTION_FA: Record<string, string> = {
  POST: 'ایجاد',
  PATCH: 'ویرایش',
  PUT: 'بروزرسانی',
  DELETE: 'حذف',
  section_view: 'مشاهده بخش',
}

function ManagersCard({
  users,
  isRootViewer,
  meId,
  onChanged,
}: {
  users: UserDTO[] | null
  isRootViewer: boolean
  meId: string | null
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [busyId, setBusyId] = React.useState<string | null>(null)

  const admins = (users ?? []).filter((u) => u.isAdmin)
  const grantees = isRootViewer ? (users ?? []).filter((u) => !u.isAdmin && u.active && u.roles.some((r) => r.isManager)) : []
  const busy = busyId !== null

  const toggle = async (u: UserDTO, next: boolean) => {
    setBusyId(u.id)
    try {
      await api('/api/users', { method: 'PATCH', body: { id: u.id, action: next ? 'grant_admin' : 'revoke_admin' } })
      toast({
        title: next ? 'دسترسی مدیریت سامانه اعطا شد 🌿' : 'دسترسی مدیریت سامانه سلب شد',
        description: `${u.name} — ${next ? 'از این پس تحلیل‌های سامانه و گزارش فعالیت را می‌بیند.' : 'دسترسی‌های مدیریتی دیگر او بدون تغییر باقی می‌ماند.'}`,
      })
      onChanged()
    } catch (e) {
      toast({ title: 'انجام نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  const row = (u: UserDTO, grantable: boolean) => {
    const locked = !isRootViewer || busy || u.isRoot === true || u.id === meId
    return (
      <div key={u.id} className="flex items-center gap-3 rounded-xl border p-3">
        <UserAvatar name={u.name} color={u.color} size={34} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold flex items-center gap-1.5 flex-wrap">
            {u.name}
            {u.isRoot && <span className={ROOT_BADGE_CLASS}>مدیر ارشد سامانه</span>}
            {!u.isRoot && u.isAdmin && (
              <span className="rounded-full bg-primary/10 text-primary text-[10px] px-2 py-0.5 font-bold">مدیر سامانه</span>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            {u.title} · {u.roles.map((r) => r.name).join('، ')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-muted-foreground hidden sm:inline">
            {u.isAdmin ? 'دسترسی دارد' : grantable ? 'قابل اعطا' : 'بدون دسترسی'}
          </span>
          <Switch
            checked={!!u.isAdmin}
            disabled={locked}
            onCheckedChange={(v) => toggle(u, v)}
            aria-label={`دسترسی مدیریت سامانه برای ${u.name}`}
          />
        </div>
      </div>
    )
  }

  return (
    <Card className="mt-4">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-bold text-sm flex items-center gap-2">
              <Crown className="h-4 w-4 text-[#8a6d13] dark:text-[#e0bc4a]" /> مدیران سامانه
            </p>
            <p className="text-[11px] text-muted-foreground leading-5 mt-1">
              مدیر سامانه به گزارش فعالیت و تحلیل تعامل با سامانه دسترسی دارد.
              {isRootViewer
                ? ' اعطا و سلب این دسترسی تنها از سوی مدیر ارشد سامانه انجام می‌شود.'
                : ' تغییر این دسترسی تنها از سوی مدیر ارشد سامانه امکان‌پذیر است.'}
            </p>
          </div>
        </div>
        {!users ? (
          <LoadingBlock rows={2} />
        ) : admins.length === 0 && grantees.length === 0 ? (
          <EmptyState icon={<Crown />} title="مدیر سامانه‌ای ثبت نشده" description="با هماهنگی مدیر ارشد سامانه، دسترسی مربوطه اعطا شود." />
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto nice-scroll">
            {admins.map((u) => row(u, false))}
            {grantees.length > 0 && (
              <p className="text-[11px] text-muted-foreground pt-2 px-1">مدیران دیگر (قابل اعطای دسترسی):</p>
            )}
            {grantees.map((u) => row(u, true))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------- تحلیل تعامل با سامانه — root administrator only ----------

const SECTION_FA: Record<string, string> = {
  dashboard: 'داشبورد', orders: 'سفارش‌ها', deliveries: 'تحویل‌ها', accounting: 'حسابداری و هولو',
  payments: 'چک‌ها و پرداخت‌ها', cheques: 'چک‌ها', products: 'محصولات', providers: 'تأمین‌کنندگان',
  companies: 'شرکت‌ها', inventory: 'انبار و موجودی', 'stock-counts': 'جرد انبار', planogram: 'چیدمان قفسه',
  customers: 'مشتریان', 'customer-orders': 'سبدهای فروش', floor: 'عملیات فروشگاه', wall: 'دیوار همکاری',
  chat: 'پیام‌ها', notes: 'یادداشت‌ها', feedback: 'بازخورد و ایده‌ها', ideas: 'ایده‌ها', tasks: 'کارها',
  checklists: 'چک‌لیست‌ها', sops: 'رویه‌ها', team: 'تیم و عملکرد', help: 'راهنمای پلتفرم', reports: 'گزارش‌ها',
  users: 'کاربران و نقش‌ها', activity: 'گزارش فعالیت', settings: 'تنظیمات', notifications: 'اعلان‌ها',
  awards: 'امتیازها', holidays: 'تعطیلات', auth: 'ورود و خروج', reorders: 'درخواست کالا',
  'stock-requests': 'کالاهای درخواستی', 'warehouse-requests': 'درخواست انبار', search: 'جستجو',
  demo: 'حالت نمایشی', suggestions: 'پیشنهاد کالا', staff: 'فهرست همکاران',
}

function sectionFa(key: string): string {
  return SECTION_FA[key] ?? key
}

interface PlatformEventDTO {
  id: string
  userName?: string | null
  section: string
  action: string
  detail?: string | null
  createdAt: string
}

interface EventsResponse {
  events: PlatformEventDTO[]
  total: number
  page: number
  pageSize: number
  summary: {
    topSections: { section: string; count: number }[]
    topUsers: { userName: string; count: number }[]
    dailyCounts: { day: string; count: number }[]
  }
}

function AnalyticsTab() {
  const { toast } = useToast()
  const [data, setData] = React.useState<EventsResponse | null>(null)
  const [page, setPage] = React.useState(1)
  const [events, setEvents] = React.useState<PlatformEventDTO[]>([])
  const [purging, setPurging] = React.useState(false)
  const [exporting, setExporting] = React.useState(false)

  const load = React.useCallback(async (p: number) => {
    try {
      const d = await api<EventsResponse>(`/api/platform-events?page=${p}`)
      setData(d)
      setEvents((prev) => (p === 1 ? d.events : [...prev, ...d.events]))
    } catch (e) {
      toast({ title: 'دریافت تحلیل‌ها ناموفق بود', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }, [toast])

  React.useEffect(() => { load(page) }, [page, load])

  const exportCsv = async () => {
    setExporting(true)
    try {
      await downloadBlob('/api/platform-events/export', 'platform-events.csv')
      toast({ title: 'خروجی CSV دانلود شد 🌿' })
    } catch (e) {
      toast({ title: 'خروجی گرفتن ناموفق بود', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }

  const purge = async () => {
    setPurging(true)
    try {
      const d = await api<{ success: boolean; deleted: number }>('/api/platform-events', { method: 'DELETE' })
      toast({ title: 'پاک‌سازی انجام شد 🌿', description: `${toFaDigits(d.deleted)} رخداد قدیمی حذف شد.` })
      setPage(1)
      load(1)
    } catch (e) {
      toast({ title: 'پاک‌سازی ناموفق بود', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setPurging(false)
    }
  }

  const maxSection = data?.summary.topSections[0]?.count ?? 1
  const totalEvents = data?.total ?? 0

  return (
    <div className="space-y-4">
      <Card className="border-[#c9a227]/50">
        <CardContent className="p-4 space-y-1">
          <p className="font-bold text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-[#8a6d13] dark:text-[#e0bc4a]" /> تحلیل تعامل با سامانه
          </p>
          <p className="text-[11px] text-muted-foreground leading-5">
            این بخش تنها برای مدیر ارشد سامانه نمایان است؛ هر تعامل همکاران با بخش‌های پلتفرم (بدون محتوای پیام‌ها و یادداشت‌ها)
            برای شناخت بهتر میزان استفاده و آموزش تیم جمع‌آوری می‌شود.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="rounded-full bg-[#c9a227]/15 text-[#8a6d13] dark:text-[#e0bc4a] text-xs font-bold px-3 py-1 num">
              {toFaDigits(totalEvents)} رخداد ثبت‌شده
            </span>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setPage(1); load(1) }}>
              <RefreshCw className="h-3.5 w-3.5" /> بروزرسانی
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" disabled={exporting} onClick={exportCsv}>
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} خروجی CSV
            </Button>
            <ConfirmButton
              onConfirm={purge}
              confirmText="پاک‌سازی قدیمی‌تر از ۹۰ روز؟"
              variant="ghost"
              className="h-9 text-pomegranate gap-1.5 text-xs"
            >
              {purging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} پاک‌سازی رخدادهای قدیمی
            </ConfirmButton>
          </div>
        </CardContent>
      </Card>

      {!data ? (
        <LoadingBlock rows={5} />
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-3">
            {/* top sections */}
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-bold mb-3">پرکاربردترین بخش‌ها</p>
                {data.summary.topSections.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">هنوز رخدادی ثبت نشده است.</p>
                ) : (
                  <div className="space-y-2.5">
                    {data.summary.topSections.map((s) => (
                      <div key={s.section}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-bold">{sectionFa(s.section)}</span>
                          <span className="num text-muted-foreground">{toFaDigits(s.count)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${Math.max(4, (s.count / maxSection) * 100)}%`, background: 'linear-gradient(90deg,#c9a227,#8a6f3c)' }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* top users */}
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-bold mb-3">فعال‌ترین همکاران</p>
                {data.summary.topUsers.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">هنوز رخدادی ثبت نشده است.</p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto nice-scroll">
                    {data.summary.topUsers.map((u, i) => (
                      <div key={u.userName ?? i} className="flex items-center gap-2.5">
                        <span className="h-7 w-7 rounded-lg bg-[#c9a227]/15 text-[#8a6d13] dark:text-[#e0bc4a] text-[11px] font-black flex items-center justify-center num shrink-0">
                          {toFaDigits(i + 1)}
                        </span>
                        <p className="text-sm font-bold flex-1 truncate">{u.userName}</p>
                        <span className="text-xs text-muted-foreground num">{toFaDigits(u.count)} تعامل</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* recent events */}
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <p className="text-sm font-bold">آخرین رخدادها</p>
                <span className="text-[11px] text-muted-foreground num">
                  صفحهٔ {toFaDigits(data.page)} از {toFaDigits(Math.max(1, Math.ceil(data.total / data.pageSize)))}
                </span>
              </div>
              {events.length === 0 ? (
                <EmptyState icon={<Activity />} title="رخدادی ثبت نشده" description="با کار همکاران در بخش‌ها، تعامل‌ها این‌جا جمع می‌شود." />
              ) : (
                <div className="max-h-96 overflow-y-auto nice-scroll">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead className="text-right">زمان</TableHead>
                        <TableHead className="text-right">همکار</TableHead>
                        <TableHead className="text-right">بخش</TableHead>
                        <TableHead className="text-right">عمل</TableHead>
                        <TableHead className="text-right hidden md:table-cell">جزئیات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {events.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-[11px] num whitespace-nowrap">{formatJalaliDateTime(e.createdAt)}</TableCell>
                          <TableCell className="text-xs font-bold">{e.userName ?? '—'}</TableCell>
                          <TableCell className="text-xs">{sectionFa(e.section)}</TableCell>
                          <TableCell className="text-xs">
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold">
                              {ADMIN_ACTION_FA[e.action] ?? e.action}
                            </span>
                          </TableCell>
                          <TableCell className="text-[11px] text-muted-foreground hidden md:table-cell max-w-56 truncate" dir="ltr">
                            {e.detail ?? '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {data.page * data.pageSize < data.total && (
                <div className="flex justify-center py-2 border-t">
                  <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setPage((p) => p + 1)}>
                    <ChevronDown className="h-4 w-4" /> نمایش رخدادهای بیشتر
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
