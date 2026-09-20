'use client'

import * as React from 'react'
import { api, type ClientUser } from '@/lib/api-client'
import { canUser, PERMISSIONS, ACTIVITY_TYPES } from '@/lib/constants'
import { toFaDigits, formatJalaliDateTime } from '@/lib/jalali'
import { GlowCard, SectionHeader, EmptyState, OrnamentDivider } from '@/components/zeytoon-ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Toaster } from '@/components/ui/toaster'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Trophy, Loader2, Medal, Sparkles, ClipboardCheck, Hourglass, Timer } from 'lucide-react'

interface Activity {
  id: string
  userId: string
  type: string
  title: string
  points: number
  note: string | null
  awardedById: string | null
  createdAt: string
  awardedByName?: string
  userName?: string
  userColor?: string
}

interface StaffMember { id: string; name: string; color: string; primaryRole: string; active: boolean; points: number }

const SELF_REPORT_TYPES = ['CLEANING', 'HELP', 'SHELF_STOCK', 'CUSTOMER_SERVICE', 'OTHER']

export function RewardsSection({ user }: { user: ClientUser }) {
  const isManager = canUser(user.roles, PERMISSIONS.AWARD_POINTS)
  const [tab, setTab] = React.useState<'log' | 'board'>('log')
  const [refreshKey, setRefreshKey] = React.useState(0)

  return (
    <div className="max-w-3xl mx-auto">
      <SectionHeader
        title="عملکرد و پاداش"
        subtitle="هر کار خوبی این‌جا دیده می‌شه — این کتابچه امتیازت است 🏆"
        actions={
          <div className="flex rounded-xl border border-gold/25 bg-card p-1 gap-1">
            <button onClick={() => setTab('log')} className={cn('px-4 h-9 rounded-lg text-[13px] font-bold transition-colors', tab === 'log' ? 'bg-olive text-white' : 'text-muted-foreground hover:bg-accent')}>کارهای من</button>
            <button onClick={() => setTab('board')} className={cn('px-4 h-9 rounded-lg text-[13px] font-bold transition-colors', tab === 'board' ? 'bg-olive text-white' : 'text-muted-foreground hover:bg-accent')}>جدول امتیازات</button>
          </div>
        }
      />

      {/* My stats — always visible */}
      <StatsCard user={user} refreshKey={refreshKey} />

      {tab === 'log' ? (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            <SelfReportButton onDone={() => setRefreshKey((k) => k + 1)} />
          </div>
          <ActivityLog userId={user.id} userName={user.name} refreshKey={refreshKey} />
        </>
      ) : (
        <Leaderboard userId={user.id} />
      )}

      {isManager && <ManagerPanel onDone={() => setRefreshKey((k) => k + 1)} />}
      <Toaster />
    </div>
  )
}

/* ==================== STATS ==================== */

function tierMessage(points: number): { title: string; sub: string } {
  if (points >= 200) return { title: 'ستاره فروشگاه ⭐', sub: 'تو دیگه یه اسطوره‌ای! هممون بهت افتخار می‌کنیم.' }
  if (points >= 100) return { title: 'قهرمان تیم 🏆', sub: 'دقیقاً همین کاری که می‌کنی، فروشگاه رو سرپا نگه می‌داره.' }
  if (points >= 50) return { title: 'نیروی اصلی تیم 💪', sub: 'آفرین! مسیر قهرمانی رو خوب اومدی.' }
  if (points >= 20) return { title: 'رو به رشد 🌱', sub: 'تو عالی‌ای — هر امتیاز یه قدم جلوئه.' }
  return { title: 'تازه شروع کردی ✨', sub: 'اولین امتیازها راه افتاده؛ از این به بعد سرگرم‌کننده می‌شه!' }
}

function StatsCard({ user, refreshKey }: { user: ClientUser; refreshKey: number }) {
  const [leaderboard, setLeaderboard] = React.useState<StaffMember[] | null>(null)

  React.useEffect(() => {
    api.get<StaffMember[]>('/api/activities?scope=leaderboard').then(setLeaderboard).catch(() => setLeaderboard([]))
  }, [refreshKey])

  const rank = leaderboard ? leaderboard.findIndex((u) => u.id === user.id) + 1 : 0
  const total = leaderboard ? leaderboard.length : 0
  const tier = tierMessage(user.points)

  return (
    <GlowCard className="p-5 md:p-6 mb-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="size-16 shrink-0 rounded-3xl bg-gradient-to-br from-gold to-gold/60 flex items-center justify-center shadow-lg shadow-gold/30 rotate-3">
            <Trophy className="size-8 text-white" />
          </div>
          <div>
            <div className="text-3xl font-black gold-shimmer tabular-nums">{toFaDigits(user.points)} <span className="text-sm font-bold text-muted-foreground">امتیاز</span></div>
            <div className="text-sm font-extrabold mt-0.5">{tier.title}</div>
            <p className="text-[13px] text-muted-foreground mt-0.5">{tier.sub}</p>
          </div>
        </div>
        {rank > 0 && (
          <div className="text-center px-5 py-3 rounded-2xl bg-olive/10 border border-olive/20">
            <div className="text-2xl font-black text-olive">
              {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : toFaDigits(rank)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">رتبه {toFaDigits(rank)} از {toFaDigits(total)} نفر تیم</div>
          </div>
        )}
      </div>
    </GlowCard>
  )
}

/* ==================== ACTIVITY LOG ==================== */

function ActivityLog({ userId, userName, refreshKey }: { userId: string; userName: string; refreshKey: number }) {
  const [activities, setActivities] = React.useState<Activity[] | null>(null)

  React.useEffect(() => {
    api.get<Activity[]>('/api/activities?scope=mine').then(setActivities).catch(() => setActivities([]))
  }, [refreshKey])

  return (
    <div>
      <div className="font-extrabold mb-3 flex items-center gap-2"><Sparkles className="size-4 text-gold" /> کارنامه من</div>
      {!activities ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
      ) : activities.length === 0 ? (
        <EmptyState icon="🌱" title="هنوز کارنامه‌ای نساختی" description="وظیفه انجام بده یا «کار فراموش‌نشدنی» ثبت کن تا امتیاز جمع کنی!" />
      ) : (
        <div className="relative space-y-3 before:absolute before:right-[27px] before:top-3 before:bottom-3 before:w-px before:bg-gold/25">
          {activities.map((a) => {
            const t = ACTIVITY_TYPES[a.type] || ACTIVITY_TYPES.OTHER
            const pending = !!a.note?.startsWith('⏳')
            return (
              <div key={a.id} className="relative flex gap-3 pr-1">
                <div className="size-14 shrink-0 rounded-2xl bg-card border border-gold/25 flex items-center justify-center text-2xl shadow-sm z-10">
                  {t.icon}
                </div>
                <div className={cn('flex-1 rounded-2xl border p-3.5', pending ? 'bg-amber-50/70 border-amber-200' : 'glow-card')}>
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <div className="font-bold text-sm">{a.title}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {t.label} · {toFaDigits(formatJalaliDateTime(a.createdAt))}
                        {a.awardedByName && a.awardedByName !== userName && <> · از سوی {a.awardedByName}</>}
                      </div>
                    </div>
                    <span className={cn(
                      'shrink-0 rounded-full px-3 py-1 text-xs font-black tabular-nums',
                      pending ? 'bg-amber-100 text-amber-700' : a.points > 0 ? 'bg-gold/15 text-gold animate-pulse-gold' : 'bg-accent text-muted-foreground'
                    )}>
                      {pending ? '⏳ در انتظار تأیید مدیر' : a.points > 0 ? `+${toFaDigits(a.points)} امتیاز` : 'ثبت شد'}
                    </span>
                  </div>
                  {a.note && !pending && <div className="text-[12px] text-muted-foreground mt-1.5">{a.note}</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <OrnamentDivider className="my-5" />
    </div>
  )
}

/* ==================== LEADERBOARD ==================== */

function Leaderboard({ userId }: { userId: string }) {
  const [board, setBoard] = React.useState<StaffMember[] | null>(null)

  React.useEffect(() => {
    api.get<StaffMember[]>('/api/activities?scope=leaderboard').then(setBoard).catch(() => setBoard([]))
  }, [])

  const top = (board || []).slice(0, 10)
  const medals = ['🥇', '🥈', '🥉']

  return (
    <div>
      <div className="font-extrabold mb-3 flex items-center gap-2"><Medal className="size-4 text-gold" /> نفرات برتر تیم</div>
      {!board ? (
        <div className="space-y-2.5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}</div>
      ) : top.length === 0 ? (
        <EmptyState icon="🏅" title="هنوز امتیازی ثبت نشده" />
      ) : (
        <div className="space-y-2.5">
          {top.map((u, i) => {
            const isMe = u.id === userId
            return (
              <div key={u.id} className={cn('flex items-center gap-3 rounded-2xl border p-3.5 transition-all', isMe ? 'border-gold bg-gold/10 shadow-sm ring-1 ring-gold/40' : 'glow-card')}>
                <div className="w-9 text-center text-xl font-black shrink-0">
                  {i < 3 ? medals[i] : <span className="text-muted-foreground text-base">{toFaDigits(i + 1)}</span>}
                </div>
                <div className="size-10 shrink-0 rounded-full flex items-center justify-center text-white font-black" style={{ background: u.color }}>
                  {u.name.replace('خانم ', '').replace('آقای ', '').charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">
                    {u.name}
                    {isMe && <span className="text-gold text-[11px] font-black mr-1.5">(تو! 🎯)</span>}
                  </div>
                </div>
                <div className="text-lg font-black text-gold tabular-nums shrink-0">{toFaDigits(u.points)} <span className="text-[10px] font-bold text-muted-foreground">امتیاز</span></div>
              </div>
            )
          })}
          {board.length > 10 && (
            <div className="text-center text-[12px] text-muted-foreground pt-1">
              {toFaDigits(board.length - 10)} نفر دیگه هم در مسیر قهرمانی هستن 💪
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ==================== SELF REPORT ==================== */

function SelfReportButton({ onDone }: { onDone: () => void }) {
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)
  const [type, setType] = React.useState('CLEANING')
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  async function submit() {
    setBusy(true)
    try {
      await api.post('/api/activities', { selfReport: true, type, note: note.trim() })
      setOpen(false); setNote(''); setType('CLEANING')
      toast({ title: 'ثبت شد! 📝', description: 'مدیرت به‌زودی بررسی و تأیید می‌کنه — ممنون که گزارش می‌دی.' })
      onDone()
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally { setBusy(false) }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="h-11 px-5 font-bold bg-gold hover:bg-gold/90 text-[#3d2f05]">
        <ClipboardCheck className="size-4 ml-1.5" /> ثبت کار فراموش‌نشدنی
      </Button>
      <span className="text-[12px] text-muted-foreground self-center">کاری کردی که سامانه نمی‌بینه؟ خودت ثبتش کن تا دیده بشه 🌿</span>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-right">ثبت کار فراموش‌نشدنی 📝</DialogTitle></DialogHeader>
          <div className="space-y-3.5">
            <div>
              <div className="text-[13px] font-bold mb-1.5">چه کاری انجام دادی؟</div>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SELF_REPORT_TYPES.map((k) => (
                    <SelectItem key={k} value={k}>{ACTIVITY_TYPES[k].icon} {ACTIVITY_TYPES[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-[13px] font-bold mb-1.5">توضیح کوتاه</div>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: نظافت قفسه ادویه‌ها در وقت اضافه شیفتم..." className="min-h-24" />
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[12px] text-amber-800 flex items-center gap-2">
              <Hourglass className="size-4 shrink-0" />
              این ثبت با امتیاز {toFaDigits(0)} و برچسب «در انتظار تأیید مدیر» می‌ره؛ بعد از تأیید، امتیازش به تو می‌رسه.
            </div>
          </div>
          <DialogFooter className="flex-row justify-start gap-2">
            <Button onClick={submit} disabled={busy || !note.trim()} className="h-11 px-6 font-bold bg-olive hover:bg-olive/90 text-white">
              {busy ? <Loader2 className="size-4 animate-spin" /> : 'ثبت کن 🚀'}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)} className="h-11">بی‌خیال</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* ==================== MANAGER PANEL ==================== */

function ManagerPanel({ onDone }: { onDone: () => void }) {
  const [all, setAll] = React.useState<Activity[] | null>(null)
  const [awardOpen, setAwardOpen] = React.useState(false)

  const load = React.useCallback(() => {
    api.get<Activity[]>('/api/activities?scope=all').then(setAll).catch(() => setAll([]))
  }, [])
  React.useEffect(() => { load() }, [])

  const pending = (all || []).filter((a) => a.note?.startsWith('⏳'))

  async function approve(a: Activity, points: number) {
    try {
      await api.post('/api/activities', { approveId: a.id, points })
      load(); onDone()
    } catch { /* toast handled by caller-less catch */ }
  }

  return (
    <div className="mt-6 rounded-3xl border-2 border-dashed border-gold/40 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="font-extrabold flex items-center gap-2"><Timer className="size-4 text-gold" /> پنل مدیر — تأیید و امتیازدهی</div>
        <Button onClick={() => setAwardOpen(true)} className="h-10 px-4 font-bold bg-olive hover:bg-olive/90 text-white">
          <Trophy className="size-4 ml-1" /> امتیاز دستی به همکار
        </Button>
      </div>

      <div className="font-bold text-sm mb-2.5">گزارش‌های در انتظار تأیید {pending.length > 0 && <span className="text-gold">({toFaDigits(pending.length)})</span>}</div>
      {!all ? (
        <div className="space-y-2.5">{[0, 1].map((i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
      ) : pending.length === 0 ? (
        <div className="text-[13px] text-muted-foreground rounded-2xl bg-accent/40 p-4 text-center">فعلاً گزارشی برای بررسی نیست — خیالت راحت ✨</div>
      ) : (
        <div className="space-y-2.5">
          {pending.map((a) => {
            const t = ACTIVITY_TYPES[a.type] || ACTIVITY_TYPES.OTHER
            return (
              <div key={a.id} className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3.5">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <div className="font-bold text-sm">{t.icon} {a.title}</div>
                    <div className="text-[12px] text-amber-800 mt-0.5">{a.userName || a.userId} · {a.note?.replace('⏳ در انتظار تأیید مدیر — ', '')}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{toFaDigits(formatJalaliDateTime(a.createdAt))} · امتیاز پیشنهادی: {toFaDigits(t.defaultPoints)}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-9 px-3 font-bold bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => approve(a, t.defaultPoints)}>
                      تأیید و {toFaDigits(t.defaultPoints)} امتیاز
                    </Button>
                    <Button size="sm" variant="outline" className="h-9 px-3 font-bold" onClick={() => approve(a, 0)}>ثبت بدون امتیاز</Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <AwardDialog open={awardOpen} onClose={() => setAwardOpen(false)} onDone={() => { load(); onDone() }} />
    </div>
  )
}

function AwardDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast()
  const [staff, setStaff] = React.useState<StaffMember[]>([])
  const [userId, setUserId] = React.useState('')
  const [type, setType] = React.useState('MANUAL_AWARD')
  const [points, setPoints] = React.useState('10')
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      api.get<StaffMember[]>('/api/auth/staff').then(setStaff).catch(() => {})
      setUserId(''); setType('MANUAL_AWARD'); setPoints('10'); setNote('')
    }
  }, [open])

  async function submit() {
    if (!userId) { toast({ title: 'یک نفر را انتخاب کن 🙂', variant: 'destructive' }); return }
    setBusy(true)
    try {
      await api.post('/api/activities', { userId, type, points: Number(points) || 0, note: note.trim() || undefined })
      toast({ title: 'امتیاز اعطا شد 🏅', description: 'این لحظه قشنگ در کارنامه‌اش ثبت شد.' })
      onClose(); onDone()
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-right">اعطای امتیاز به همکار 🏅</DialogTitle></DialogHeader>
        <div className="space-y-3.5">
          <div>
            <div className="text-[13px] font-bold mb-1.5">به چه کسی؟</div>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="h-11"><SelectValue placeholder="انتخاب همکار..." /></SelectTrigger>
              <SelectContent className="max-h-56">
                {staff.filter((s) => s.active).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-[13px] font-bold mb-1.5">دلیل</div>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ACTIVITY_TYPES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.icon} {v.label} (پیشنهاد: {toFaDigits(v.defaultPoints)})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-[13px] font-bold mb-1.5">امتیاز</div>
            <Input type="number" value={points} onChange={(e) => setPoints(e.target.value)} className="h-11" dir="ltr" />
          </div>
          <div>
            <div className="text-[13px] font-bold mb-1.5">یادداشت (اختیاری)</div>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: کمک فوق‌العاده در شیفت شلوغ جمعه..." className="min-h-20" />
          </div>
        </div>
        <DialogFooter className="flex-row justify-start gap-2">
          <Button onClick={submit} disabled={busy} className="h-11 px-6 font-bold bg-olive hover:bg-olive/90 text-white">
            {busy ? <Loader2 className="size-4 animate-spin" /> : 'اعطای امتیاز 🏅'}
          </Button>
          <Button variant="ghost" onClick={onClose} className="h-11">انصراف</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
