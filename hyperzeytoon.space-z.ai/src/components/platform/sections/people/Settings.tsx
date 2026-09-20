'use client'

import * as React from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/store/app'
import { useToast } from '@/hooks/use-toast'
import { SectionHeader, UserAvatar, EmptyState, LoadingBlock, ConfirmButton } from '@/components/platform/ui/shared'
import { JalaliDatePicker } from '@/components/platform/ui/jalali-date-picker'
import { toFaDigits, isoDay, addDays, formatJalaliFull } from '@/lib/jalali'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Settings as SettingsIcon, KeyRound, Loader2, Palette, Store, Sun, CalendarDays, Trash2, RefreshCw, Plus, Award, ListChecks, CheckCircle2, TrendingUp, Medal } from 'lucide-react'

const AVATAR_COLORS = ['#3E7C59', '#C9A227', '#D9832E', '#B33A3A', '#8A6F3C', '#5E8C61', '#7D5BA6', '#B07D2B']

interface SettingsMap {
  store_name?: string
  store_city?: string
  tax_rate_default?: string
  tolerance_toman?: string
  low_stock_alerts?: string
}

interface HolidayDTO {
  id: string
  date: string
  name: string
  source: string
}
interface MyStats {
  openTasks: number
  inProgressTasks: number
  doneToday: number
  overdueTasks: number
  awardsCount: number
  rank: number | null
}

export function Settings() {
  const { user, setUser } = useApp()
  const { toast } = useToast()
  const isManager = !!user?.isManager

  const [color, setColor] = React.useState(user?.color ?? AVATAR_COLORS[0])
  const [savingColor, setSavingColor] = React.useState(false)
  const [pinOpen, setPinOpen] = React.useState(false)
  const [currentPin, setCurrentPin] = React.useState('')
  const [newPin, setNewPin] = React.useState('')
  const [savingPin, setSavingPin] = React.useState(false)

  const [phone, setPhone] = React.useState<string | null>(null)
  const [phoneDraft, setPhoneDraft] = React.useState('')
  const [savingPhone, setSavingPhone] = React.useState(false)

  const [settings, setSettings] = React.useState<SettingsMap | null>(null)
  const [savingSettings, setSavingSettings] = React.useState(false)

  // holidays manager
  const [holidays, setHolidays] = React.useState<HolidayDTO[] | null>(null)
  const [holidayDate, setHolidayDate] = React.useState<Date | null>(null)
  const [holidayName, setHolidayName] = React.useState('')
  const [savingHoliday, setSavingHoliday] = React.useState(false)
  const [syncingHolidays, setSyncingHolidays] = React.useState(false)

  // personal stats
  const [myStats, setMyStats] = React.useState<MyStats | null>(null)

  React.useEffect(() => {
    api<SettingsMap>('/api/settings')
      .then(setSettings)
      .catch(() => setSettings({}))
  }, [])

  const loadHolidays = React.useCallback(() => {
    api<HolidayDTO[]>(`/api/holidays?from=${isoDay(addDays(new Date(), -7))}&to=${isoDay(addDays(new Date(), 365))}`)
      .then(setHolidays)
      .catch(() => setHolidays([]))
  }, [])

  React.useEffect(() => {
    loadHolidays()
  }, [loadHolidays])

  React.useEffect(() => {
    if (!user) return
    let alive = true
    Promise.all([
      api<{ stats: { open: number; inProgress: number; doneToday: number; overdue: number } }>('/api/tasks?mine=1'),
      api<{ awards: unknown[]; rank: number | null }>(`/api/awards?userId=${user.id}`).catch(() => null),
    ])
      .then(([t, a]) => {
        if (!alive) return
        setMyStats({
          openTasks: t.stats.open,
          inProgressTasks: t.stats.inProgress,
          doneToday: t.stats.doneToday,
          overdueTasks: t.stats.overdue,
          awardsCount: a?.awards?.length ?? 0,
          rank: a?.rank ?? null,
        })
      })
      .catch(() => {
        if (alive) setMyStats(null)
      })
    return () => {
      alive = false
    }
  }, [user])

  const addHoliday = async () => {
    if (!holidayDate || !holidayName.trim()) {
      toast({ title: 'تاریخ و نام تعطیلی الزامی است', variant: 'destructive' })
      return
    }
    setSavingHoliday(true)
    try {
      await api('/api/holidays', { body: { date: isoDay(holidayDate), name: holidayName.trim() } })
      toast({ title: 'روز تعطیل ثبت شد', description: `${holidayName.trim()} — ${toFaDigits(formatJalaliFull(holidayDate))}` })
      setHolidayDate(null)
      setHolidayName('')
      loadHolidays()
    } catch (e) {
      toast({ title: 'ثبت تعطیلی ناموفق', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSavingHoliday(false)
    }
  }

  const deleteHoliday = async (date: string, name: string) => {
    try {
      await api(`/api/holidays?date=${date}`, { method: 'DELETE' })
      toast({ title: 'تعطیلی حذف شد', description: name })
      loadHolidays()
    } catch (e) {
      toast({ title: 'حذف ناموفق', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }

  const syncHolidays = async () => {
    setSyncingHolidays(true)
    try {
      const res = await api<{ added: number }>('/api/holidays', { method: 'PUT', body: {} })
      toast({ title: 'همگام‌سازی انجام شد', description: `${toFaDigits(res.added)} روز تعطیل جدید اضافه شد` })
      loadHolidays()
    } catch (e) {
      toast({ title: 'همگام‌سازی ناموفق', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSyncingHolidays(false)
    }
  }

  // session user carries no phone — read it from the users directory (own record)
  React.useEffect(() => {
    if (!user) return
    api<{ users: { id: string; phone?: string | null }[] }>('/api/users')
      .then((d) => {
        const me = d.users.find((u) => u.id === user.id)
        setPhone(me?.phone ?? '')
        setPhoneDraft(me?.phone ?? '')
      })
      .catch(() => setPhone(''))
  }, [user])

  const savePhone = async () => {
    if (!user) return
    setSavingPhone(true)
    try {
      await api('/api/users', { method: 'PATCH', body: { id: user.id, phone: phoneDraft.trim() } })
      setPhone(phoneDraft.trim())
      toast({ title: 'شماره‌ات بروز شد 🌿' })
    } catch (e) {
      toast({ title: 'ذخیره نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSavingPhone(false)
    }
  }

  const saveColor = async (c: string) => {
    if (!user) return
    setColor(c)
    setSavingColor(true)
    try {
      await api('/api/users', { method: 'PATCH', body: { id: user.id, color: c } })
      setUser({ ...user, color: c })
      toast({ title: 'رنگ آواتارت عوض شد 🎨' })
    } catch (e) {
      toast({ title: 'ذخیره نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSavingColor(false)
    }
  }

  const changePin = async () => {
    if (currentPin.length !== 4 || newPin.length !== 4) return
    setSavingPin(true)
    try {
      await api('/api/auth/login', { body: { username: user?.username, pin: currentPin } })
    } catch {
      toast({ title: 'رمز فعلی درست نیست', variant: 'destructive' })
      setSavingPin(false)
      return
    }
    try {
      await api('/api/users', { method: 'PATCH', body: { id: user?.id, pin: newPin } })
      toast({ title: 'رمزت عوض شد ✅', description: 'از این به بعد با رمز جدید وارد شو' })
      setPinOpen(false)
      setCurrentPin('')
      setNewPin('')
    } catch (e) {
      toast({ title: 'تغییر رمز نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSavingPin(false)
    }
  }

  const saveSettings = async () => {
    if (!settings) return
    setSavingSettings(true)
    try {
      await api('/api/settings', {
        method: 'PATCH',
        body: {
          store_name: settings.store_name ?? '',
          store_city: settings.store_city ?? '',
          tax_rate_default: settings.tax_rate_default ?? '9',
          tolerance_toman: settings.tolerance_toman ?? '0',
          low_stock_alerts: settings.low_stock_alerts ?? '1',
        },
      })
      toast({ title: 'تنظیمات ذخیره شد 🌿' })
    } catch (e) {
      toast({ title: 'ذخیره نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSavingSettings(false)
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="تنظیمات"
        subtitle="حساب خودت و تنظیمات فروشگاه"
        icon={<SettingsIcon className="h-5 w-5" />}
      />

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        {/* profile */}
        <Card className="glow-border-static">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-4">
              <UserAvatar name={user?.name ?? ''} color={user?.color ?? '#3E7C59'} size={56} />
              <div>
                <p className="font-bold text-lg">{user?.name}</p>
                <p className="text-sm text-muted-foreground">{user?.title}</p>
                <p className="text-xs text-muted-foreground num mt-0.5" dir="ltr">{phone && phone.trim() ? toFaDigits(phone) : '—'}</p>
              </div>
            </div>
            <div className="flex items-end gap-2">
              <div className="space-y-1.5 flex-1">
                <Label htmlFor="my-phone">شماره تلفن من</Label>
                <Input
                  id="my-phone"
                  value={phoneDraft}
                  onChange={(e) => setPhoneDraft(e.target.value)}
                  inputMode="numeric"
                  dir="ltr"
                  className="num text-left"
                  placeholder="0913…"
                />
              </div>
              <Button
                size="sm" variant="outline" className="h-10 shrink-0"
                disabled={savingPhone || phoneDraft.trim() === (phone ?? '')}
                onClick={savePhone}
              >
                {savingPhone && <Loader2 className="h-4 w-4 animate-spin" />} ذخیره
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Palette className="h-3.5 w-3.5" /> رنگ آواتار من</Label>
              <div className="flex gap-2 flex-wrap">
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c} type="button" disabled={savingColor} onClick={() => saveColor(c)} aria-label={`رنگ ${c}`}
                    className={`h-10 w-10 rounded-xl transition-transform active:scale-95 ${color === c ? 'ring-2 ring-offset-2 ring-foreground scale-105' : ''}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-bold flex items-center gap-1.5"><KeyRound className="h-4 w-4 text-primary" /> تغییر رمز ورود</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">رمز چهاررقمی فعلی و رمز جدید</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setPinOpen(true)}>تغییر</Button>
            </div>

            {/* personal performance strip */}
            <div className="rounded-xl border border-[#C9A227]/30 bg-gradient-to-l from-[#C9A227]/[0.07] to-transparent p-3">
              <p className="text-xs font-bold flex items-center gap-1.5 mb-2"><TrendingUp className="h-3.5 w-3.5 text-[#C9A227]" /> کارنامه من</p>
              {!myStats ? (
                <p className="text-[11px] text-muted-foreground">در حال محاسبه…</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <MiniStat icon={<ListChecks className="h-3.5 w-3.5" />} label="کار باز" value={toFaDigits(myStats.openTasks)} color="#2E6E8E" />
                  <MiniStat icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="انجام‌شده امروز" value={toFaDigits(myStats.doneToday)} color="#3E7C59" />
                  <MiniStat icon={<Award className="h-3.5 w-3.5" />} label="افتخارات" value={toFaDigits(myStats.awardsCount)} color="#C9A227" />
                  {myStats.overdueTasks > 0 && (
                    <MiniStat icon={<ListChecks className="h-3.5 w-3.5" />} label="عقب‌افتاده" value={toFaDigits(myStats.overdueTasks)} color="#B33A3A" />
                  )}
                  <MiniStat icon={<Medal className="h-3.5 w-3.5" />} label="رتبه در تیم" value={myStats.rank ? toFaDigits(myStats.rank) : '—'} color="#8A6F3C" />
                  <MiniStat icon={<Award className="h-3.5 w-3.5" />} label="امتیاز کل" value={toFaDigits(user?.points ?? 0)} color="#5E8C61" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* store settings */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <p className="font-bold flex items-center gap-2">
              <Store className="h-4 w-4 text-primary" /> تنظیمات فروشگاه
              {!isManager && <span className="text-[11px] text-muted-foreground font-normal">(فقط مدیریت)</span>}
            </p>
            {!settings ? <LoadingBlock rows={3} /> : (
              <div className={`space-y-3 ${!isManager ? 'opacity-60 pointer-events-none select-none' : ''}`}>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label>نام فروشگاه</Label>
                    <Input
                      value={settings.store_name ?? ''}
                      onChange={(e) => setSettings({ ...settings, store_name: e.target.value })}
                      disabled={!isManager}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>شهر</Label>
                    <Input
                      value={settings.store_city ?? ''}
                      onChange={(e) => setSettings({ ...settings, store_city: e.target.value })}
                      disabled={!isManager}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label>نرخ مالیات پیش‌فرض (٪)</Label>
                    <Input
                      value={settings.tax_rate_default ?? '9'}
                      onChange={(e) => setSettings({ ...settings, tax_rate_default: e.target.value })}
                      inputMode="decimal" className="num" disabled={!isManager}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>تحمل کسری (تومان)</Label>
                    <Input
                      value={settings.tolerance_toman ?? '0'}
                      onChange={(e) => setSettings({ ...settings, tolerance_toman: e.target.value })}
                      inputMode="numeric" className="num" disabled={!isManager}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl border p-3">
                  <div>
                    <p className="text-sm font-bold">هشدار کمبود موجودی</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">وقتی کالا به حد بحرانی رسید، اعلان بده</p>
                  </div>
                  <Switch
                    checked={(settings.low_stock_alerts ?? '1') === '1'}
                    onCheckedChange={(v) => setSettings({ ...settings, low_stock_alerts: v ? '1' : '0' })}
                    disabled={!isManager}
                  />
                </div>
                {isManager && (
                  <Button className="w-full h-11 gap-1.5" onClick={saveSettings} disabled={savingSettings}>
                    {savingSettings && <Loader2 className="h-4 w-4 animate-spin" />} ذخیره تنظیمات
                  </Button>
                )}
              </div>
            )}
            <div className="rounded-xl bg-accent p-3 text-[11px] text-muted-foreground flex items-center gap-2">
              <Sun className="h-3.5 w-3.5 shrink-0" />
              پوسته روشن/تاریک از آیکون ماه/خورشید در نوار بالای صفحه قابل تغییر است.
            </div>
          </CardContent>
        </Card>

        {/* holidays manager — full width */}
        <Card className="glow-border-static lg:col-span-2">
          <CardContent className="p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" /> تقویم تعطیلات رسمی
                <span className="text-[11px] text-muted-foreground font-normal">— مبنای محاسبه سررسید چک‌ها و تاریخ تحویل سفارش‌ها</span>
              </p>
              {isManager && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={syncHolidays} disabled={syncingHolidays}>
                  {syncingHolidays ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  همگام‌سازی تعطیلات ثابت
                </Button>
              )}
            </div>

            {!holidays ? (
              <LoadingBlock rows={3} />
            ) : (
              <>
                {isManager && (
                  <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border p-3 bg-accent/30">
                    <div className="space-y-1">
                      <Label className="text-xs">تاریخ تعطیلی</Label>
                      <JalaliDatePicker value={holidayDate} onChange={setHolidayDate} placeholder="انتخاب روز…" />
                    </div>
                    <div className="space-y-1 flex-1 min-w-40">
                      <Label className="text-xs">عنوان (مثلاً عید نوروز)</Label>
                      <Input
                        value={holidayName}
                        onChange={(e) => setHolidayName(e.target.value)}
                        placeholder="نام مناسبت…"
                      />
                    </div>
                    <Button onClick={addHoliday} disabled={savingHoliday} className="min-h-10 gap-1.5">
                      {savingHoliday ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} ثبت تعطیلی
                    </Button>
                  </div>
                )}
                {holidays.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">تعطیلی پیش‌رو ثبت نشده است</p>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto pl-1">
                    {holidays.map((h) => {
                      const past = h.date < isoDay(new Date())
                      const srcLabel = h.source === 'TIME_IR' ? 'منبع رسمی' : h.source === 'MANUAL' ? 'دستی' : 'پایه'
                      const srcColor = h.source === 'MANUAL' ? '#7D5BA6' : h.source === 'TIME_IR' ? '#3E7C59' : '#8A8F98'
                      return (
                        <div
                          key={h.id}
                          className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 ${past ? 'opacity-55' : ''} ${h.date === isoDay(new Date()) ? 'border-[#B33A3A]/60 bg-[#B33A3A]/[0.06]' : 'border-border'}`}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{h.name}</p>
                            <p className="text-[11px] text-muted-foreground num mt-0.5">
                              {toFaDigits(formatJalaliFull(new Date(h.date)))}
                              {h.date === isoDay(new Date()) && <span className="text-[#B33A3A] font-bold"> — امروز</span>}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `${srcColor}1a`, color: srcColor }}>
                              {srcLabel}
                            </span>
                            {isManager && (
                              <ConfirmButton
                                variant="ghost"
                                confirmText="حذف؟"
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                onConfirm={() => deleteHoliday(h.date, h.name)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </ConfirmButton>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* PIN dialog */}
      <Dialog open={pinOpen} onOpenChange={setPinOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>تغییر رمز ورود</DialogTitle>
            <DialogDescription>رمز چهاررقمی فعلی را تأیید کن و رمز جدید را انتخاب کن.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>رمز فعلی</Label>
              <Input
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric" dir="ltr" className="num text-left tracking-[0.4em]" type="password"
              />
            </div>
            <div className="space-y-1.5">
              <Label>رمز جدید (۴ رقم)</Label>
              <Input
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric" dir="ltr" className="num text-left tracking-[0.4em]" type="password"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPinOpen(false)}>انصراف</Button>
              <Button onClick={changePin} disabled={savingPin || currentPin.length !== 4 || newPin.length !== 4} className="gap-1.5">
                {savingPin && <Loader2 className="h-4 w-4 animate-spin" />} ثبت رمز جدید
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {!user && <EmptyState title="برای تنظیمات، اول وارد شو" />}
    </div>
  )
}

function MiniStat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-card/80 border border-border px-2.5 py-2">
      <span className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1a`, color }}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-extrabold num leading-none" style={{ color }}>{value}</span>
        <span className="block text-[10px] text-muted-foreground mt-0.5 truncate">{label}</span>
      </span>
    </div>
  )
}
