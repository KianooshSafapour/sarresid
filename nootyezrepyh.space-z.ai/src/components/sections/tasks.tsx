'use client'

import * as React from 'react'
import { api, type ClientUser } from '@/lib/api-client'
import { canUser, PERMISSIONS, TASK_STATUSES, ROLES } from '@/lib/constants'
import { toFaDigits, formatJalali, todayJalali, diffDaysJalali } from '@/lib/jalali'
import { GlowCard, SectionHeader, EmptyState, OrnamentDivider } from '@/components/zeytoon-ui'
import { JalaliDatePicker } from '@/components/jalali-date-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Toaster } from '@/components/ui/toaster'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { sfxCelebrate } from '@/lib/sfx'
import { Plus, Trash2, Loader2, CalendarDays, AlertCircle, PartyPopper, Flag } from 'lucide-react'

interface ChecklistItem { text: string; done: boolean }

interface Task {
  id: string
  title: string
  description: string | null
  assignedTo: string
  assigneeType: 'USER' | 'ROLE'
  status: string
  priority: string
  dueDate: string | null
  checklist: string | null
  blockedNote: string | null
  completedAt: string | null
  createdAt: string
  createdByName?: string
  assigneeName?: string
}

interface StaffMember { id: string; name: string; color: string; primaryRole: string; active: boolean }

const PRIORITIES: Record<string, { label: string; color: string; bg: string }> = {
  LOW: { label: 'اولویت کم', color: '#5a7d4f', bg: '#e8f0e4' },
  MEDIUM: { label: 'اولویت متوسط', color: '#8a6d1f', bg: '#f7f0dc' },
  HIGH: { label: 'اولویت زیاد', color: '#b05f1f', bg: '#fbeadd' },
  URGENT: { label: 'فوری ⚠️', color: '#a33f3f', bg: '#fdeaea' },
}

export function TasksSection({ user }: { user: ClientUser }) {
  const isManager = canUser(user.roles, PERMISSIONS.MANAGE_TASKS)
  const [tab, setTab] = React.useState<'mine' | 'manage'>(() => {
    try {
      // deep-link from the command palette: 'zeytoon_open_new_task' = '1'
      // (the flag itself is consumed by <ManageTasks> which then opens the create dialog)
      if (sessionStorage.getItem('zeytoon_open_new_task') === '1') return 'manage'
    } catch { /* private mode */ }
    return 'mine'
  })

  return (
    <div>
      <SectionHeader
        title="وظایف من"
        subtitle="راهنمای مطمئن تو برای یک روز کاری منظم — قدم به قدم جلو برو 💪"
        actions={
          isManager && (
            <div className="flex rounded-xl border border-gold/25 bg-card p-1 gap-1">
              <button
                onClick={() => setTab('mine')}
                className={cn('px-4 h-9 rounded-lg text-sm font-bold transition-colors', tab === 'mine' ? 'bg-olive text-white' : 'text-muted-foreground hover:bg-accent')}
              >
                وظایف من
              </button>
              <button
                onClick={() => setTab('manage')}
                className={cn('px-4 h-9 rounded-lg text-sm font-bold transition-colors', tab === 'manage' ? 'bg-olive text-white' : 'text-muted-foreground hover:bg-accent')}
              >
                مدیریت وظایف
              </button>
            </div>
          )
        }
      />
      {tab === 'mine' ? <MyTasks user={user} /> : <ManageTasks user={user} />}
      <Toaster />
    </div>
  )
}

/* ==================== MY TASKS ==================== */

function MyTasks({ user }: { user: ClientUser }) {
  const { toast } = useToast()
  const [tasks, setTasks] = React.useState<Task[] | null>(null)
  const [filter, setFilter] = React.useState<string>('ALL')
  const [celebrateId, setCelebrateId] = React.useState<string | null>(null)
  const [followUpTask, setFollowUpTask] = React.useState<Task | null>(null)

  const load = React.useCallback(() => {
    api.get<Task[]>('/api/tasks?scope=mine').then(setTasks).catch(() => setTasks([]))
  }, [])
  React.useEffect(() => { load() }, [load])

  async function setStatus(task: Task, status: string, blockedNote?: string) {
    try {
      const res = await api.patch<{ pointsAwarded?: number }>(`/api/tasks/${task.id}`, { status, ...(blockedNote !== undefined ? { blockedNote } : {}) })
      if (status === 'DONE') {
        sfxCelebrate()
        setCelebrateId(task.id)
        setTimeout(() => setCelebrateId(null), 2600)
        toast({
          title: 'آفرین! 🎉',
          description: `«${task.title}» تمام شد${res.pointsAwarded ? ` — ${toFaDigits(res.pointsAwarded)} امتیاز گرفتی!` : ' دستت درد نکنه!'}`,
        })
      } else if (status === 'IN_PROGRESS') {
        toast({ title: 'بیا شروع کنیم 🚀', description: 'هر قدمی که برمی‌داری، نزدیک‌تر می‌شی!' })
      } else if (status === 'FOLLOW_UP') {
        toast({ title: 'پیگیری ثبت شد 🙋', description: 'ممنون که اطلاع دادی — مدیرت در جریان است.' })
      } else if (status === 'TODO') {
        toast({ title: 'برگشت به لیست', description: 'هر وقت آماده بودی، شروع کن.' })
      }
      load()
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'دوباره تلاش کن', variant: 'destructive' })
    }
  }

  async function toggleCheck(task: Task, idx: number) {
    const items: ChecklistItem[] = parseChecklist(task.checklist)
    items[idx] = { ...items[idx], done: !items[idx].done }
    setTasks((prev) => prev ? prev.map((t) => t.id === task.id ? { ...t, checklist: JSON.stringify(items) } : t) : prev)
    try { await api.patch(`/api/tasks/${task.id}`, { checklist: items }) } catch { load() }
  }

  const filtered = (tasks || []).filter((t) => filter === 'ALL' || t.status === filter)
  const openCount = (tasks || []).filter((t) => t.status !== 'DONE').length
  const doneCount = (tasks || []).filter((t) => t.status === 'DONE').length

  return (
    <div className="space-y-4">
      {/* Friendly hero */}
      <GlowCard className="p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-lg font-extrabold">{doneCount > 0 && openCount === 0 ? 'همه انجام شد! تو عالی‌ای 🏆' : 'بیا شروع کنیم 💪'}</div>
            <p className="text-sm text-muted-foreground mt-1">
              {openCount > 0 ? `${toFaDigits(openCount)} کار باز داری — یکی‌یکی جلو می‌ریم.` : 'فعلاً کاری نداری، خیالت راحت!'}
            </p>
          </div>
          {doneCount + openCount > 0 && (
            <div className="text-center px-4 py-2 rounded-2xl bg-gold/10 border border-gold/25">
              <div className="text-2xl font-black text-gold animate-pulse-gold">{toFaDigits(doneCount)}</div>
              <div className="text-[11px] text-muted-foreground">انجام‌شده از {toFaDigits(doneCount + openCount)}</div>
            </div>
          )}
        </div>
        <OrnamentDivider />
        {/* Filter chips */}
        <div className="flex flex-wrap gap-2">
          <Chip active={filter === 'ALL'} onClick={() => setFilter('ALL')}>همه</Chip>
          {Object.entries(TASK_STATUSES).map(([k, v]) => (
            <Chip key={k} active={filter === k} onClick={() => setFilter(k)} color={v.color}>{v.label}</Chip>
          ))}
        </div>
      </GlowCard>

      {!tasks ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="🎉" title="این‌جا خلوت است!" description="فعلاً وظیفه‌ای با این فیلتر نداری. وقت آزادته، ازش لذت ببر 🌿" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              celebrate={celebrateId === t.id}
              onStatus={setStatus}
              onToggleCheck={(i) => toggleCheck(t, i)}
              onFollowUp={() => setFollowUpTask(t)}
            />
          ))}
        </div>
      )}

      <FollowUpDialog task={followUpTask} onClose={() => setFollowUpTask(null)} onSubmit={(note) => {
        if (followUpTask) setStatus(followUpTask, 'FOLLOW_UP', note)
        setFollowUpTask(null)
      }} />
    </div>
  )
}

function TaskCard({ task, celebrate, onStatus, onToggleCheck, onFollowUp }: {
  task: Task
  celebrate: boolean
  onStatus: (t: Task, s: string) => void
  onToggleCheck: (i: number) => void
  onFollowUp: () => void
}) {
  const st = TASK_STATUSES[task.status] || TASK_STATUSES.TODO
  const pr = PRIORITIES[task.priority] || PRIORITIES.MEDIUM
  const checklist = parseChecklist(task.checklist)
  const doneBoxes = checklist.filter((c) => c.done).length
  const overdue = task.dueDate && task.status !== 'DONE' && diffDaysJalali(task.dueDate, todayJalali()) < 0
  const dueSoon = task.dueDate && task.status !== 'DONE' && diffDaysJalali(task.dueDate, todayJalali()) === 0

  return (
    <div className={cn('glow-card p-4 flex flex-col gap-3 transition-transform', celebrate && 'animate-pulse-gold scale-[1.02]')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-[15px] leading-relaxed">{task.title}</div>
          {task.description && <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{task.description}</p>}
        </div>
        <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ color: pr.color, background: pr.bg }}>{pr.label}</span>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold text-white" style={{ background: st.color }}>{st.label}</span>
        {task.dueDate && (
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold', overdue ? 'bg-red-50 text-red-600' : dueSoon ? 'bg-amber-50 text-amber-700' : 'bg-accent text-muted-foreground')}>
            <CalendarDays className="size-3.5" />
            {overdue ? 'مهلت گذشته — ' : dueSoon ? 'امروز تا پایان روز — ' : 'مهلت: '}
            {toFaDigits(task.dueDate)}
          </span>
        )}
        {checklist.length > 0 && (
          <span className="rounded-full bg-accent px-2 py-0.5 text-muted-foreground font-bold">
            {toFaDigits(doneBoxes)}/{toFaDigits(checklist.length)} چک‌لیست
          </span>
        )}
      </div>

      {task.blockedNote && task.status === 'FOLLOW_UP' && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[13px] text-amber-800 flex gap-2">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <div><span className="font-bold">دلیل پیگیری: </span>{task.blockedNote}</div>
        </div>
      )}

      {/* Checklist */}
      {checklist.length > 0 && task.status !== 'DONE' && (
        <div className="space-y-2">
          {checklist.map((c, i) => (
            <label key={i} className="flex items-center gap-3 rounded-xl border border-gold/15 bg-card/60 px-3 py-2.5 cursor-pointer hover:border-gold/40 transition-colors">
              <Checkbox checked={c.done} onCheckedChange={() => onToggleCheck(i)} className="size-5 rounded-md" />
              <span className={cn('text-sm', c.done && 'line-through text-muted-foreground')}>{c.text}</span>
            </label>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="mt-auto pt-1">
        {task.status === 'TODO' && (
          <Button className="w-full h-11 text-[15px] font-bold bg-olive hover:bg-olive/90 text-white" onClick={() => onStatus(task, 'IN_PROGRESS')}>
            🚀 شروع کردم
          </Button>
        )}
        {task.status === 'IN_PROGRESS' && (
          <div className="grid grid-cols-2 gap-2">
            <Button className="h-11 text-[15px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => onStatus(task, 'DONE')}>انجام شد! 🎉</Button>
            <Button variant="outline" className="h-11 font-bold border-amber-300 text-amber-700 hover:bg-amber-50" onClick={onFollowUp}>
              <Flag className="size-4 ml-1" /> پیگیری
            </Button>
          </div>
        )}
        {task.status === 'FOLLOW_UP' && (
          <div className="grid grid-cols-2 gap-2">
            <Button className="h-11 text-[15px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => onStatus(task, 'DONE')}>انجام شد! 🎉</Button>
            <Button variant="outline" className="h-11 font-bold" onClick={() => onStatus(task, 'IN_PROGRESS')}>ادامه می‌دهم</Button>
          </div>
        )}
        {task.status === 'DONE' && (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 py-2.5 text-emerald-700 font-bold text-sm">
            <PartyPopper className="size-4" />
            آفرین! {task.completedAt ? `— ${toFaDigits(formatJalali(task.completedAt))}` : 'درست وقتش انجام شد'}
          </div>
        )}
      </div>
    </div>
  )
}

function FollowUpDialog({ task, onClose, onSubmit }: { task: Task | null; onClose: () => void; onSubmit: (note: string) => void }) {
  const [note, setNote] = React.useState('')
  React.useEffect(() => { setNote(task?.blockedNote || '') }, [task])
  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right">چی مانع پیشرفت شد؟ 🙋</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-1">خیالت راحت — این پیام فقط برای اینه که مدیرت بدونه چطور می‌تونه کمک کنه. هیچ جریمه‌ای در کار نیست 🌿</p>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: کالا تموم شده و باید سفارش داده بشه..." className="min-h-24" />
        <DialogFooter className="flex-row justify-start gap-2">
          <Button onClick={() => onSubmit(note.trim())} disabled={!note.trim()} className="h-11 px-6 font-bold bg-amber-600 hover:bg-amber-700 text-white">ثبت پیگیری</Button>
          <Button variant="ghost" onClick={onClose} className="h-11">بی‌خیال</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ==================== MANAGE TASKS ==================== */

function ManageTasks({ user }: { user: ClientUser }) {
  const { toast } = useToast()
  const [tasks, setTasks] = React.useState<Task[] | null>(null)
  const [staff, setStaff] = React.useState<StaffMember[]>([])
  const [statusFilter, setStatusFilter] = React.useState('ALL')
  const [assigneeFilter, setAssigneeFilter] = React.useState('ALL')
  const [createOpen, setCreateOpen] = React.useState(false)

  // deep-link from the command palette: open the create dialog on mount
  React.useEffect(() => {
    try {
      if (sessionStorage.getItem('zeytoon_open_new_task') === '1') {
        sessionStorage.removeItem('zeytoon_open_new_task')
        setCreateOpen(true)
      }
    } catch { /* private mode */ }
  }, [])

  const load = React.useCallback(() => {
    api.get<Task[]>('/api/tasks?scope=all').then(setTasks).catch(() => setTasks([]))
    api.get<StaffMember[]>('/api/auth/staff').then(setStaff).catch(() => {})
  }, [])
  React.useEffect(() => { load() }, [load])

  async function remove(t: Task) {
    if (!window.confirm(`حذف وظیفه «${t.title}»؟`)) return
    try { await api.delete(`/api/tasks/${t.id}`); toast({ title: 'حذف شد' }); load() } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }

  const attention = (tasks || []).filter((t) => t.status === 'FOLLOW_UP')
  const filtered = (tasks || []).filter((t) =>
    (statusFilter === 'ALL' || t.status === statusFilter) &&
    (assigneeFilter === 'ALL' || `${t.assigneeType}:${t.assignedTo}` === assigneeFilter)
  )
  const assigneeOptions: { key: string; label: string }[] = [
    ...staff.filter((s) => s.active).map((s) => ({ key: `USER:${s.id}`, label: s.name })),
    ...Object.entries(ROLES).map(([k, v]) => ({ key: `ROLE:${k}`, label: `نقش: ${v.name}` })),
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">همه وضعیت‌ها</SelectItem>
              {Object.entries(TASK_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="w-48 h-10"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="ALL">همه گیرندگان</SelectItem>
              {assigneeOptions.map((o) => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button className="h-11 px-5 font-bold bg-olive hover:bg-olive/90 text-white" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4 ml-1" /> وظیفه جدید
        </Button>
      </div>

      {/* Needs attention */}
      {attention.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/70 p-4 space-y-2.5">
          <div className="font-extrabold text-amber-800 flex items-center gap-2"><AlertCircle className="size-4" /> نیازمند توجه — همکاران کمک خواسته‌اند</div>
          {attention.map((t) => (
            <div key={t.id} className="rounded-xl bg-card border border-amber-200 p-3">
              <div className="font-bold text-sm">{t.title}</div>
              <div className="text-[13px] text-amber-800 mt-1">🙋 {t.blockedNote || 'بدون توضیح'}</div>
              <div className="text-[11px] text-muted-foreground mt-1">گیرنده: {t.assigneeName || t.assignedTo} · ثبت‌کننده: {t.createdByName || '—'}</div>
            </div>
          ))}
        </div>
      )}

      {!tasks ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="📋" title="وظیفه‌ای یافت نشد" description="با فیلترهای دیگه امتحان کن یا وظیفه جدید بساز." />
      ) : (
        <div className="space-y-2.5">
          {filtered.map((t) => {
            const st = TASK_STATUSES[t.status] || TASK_STATUSES.TODO
            return (
              <div key={t.id} className="glow-card p-4 flex flex-wrap items-center gap-3">
                <span className="rounded-full px-2.5 py-1 text-[11px] font-bold text-white shrink-0" style={{ background: st.color }}>{st.label}</span>
                <div className="flex-1 min-w-40">
                  <div className="font-bold text-sm">{t.title}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    گیرنده: <span className="font-bold text-foreground">{t.assigneeName || t.assignedTo}</span>
                    {' · '}ثبت: {t.createdByName || '—'}
                    {t.dueDate && <> · مهلت: {toFaDigits(t.dueDate)}</>}
                  </div>
                </div>
                <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ color: PRIORITIES[t.priority]?.color, background: PRIORITIES[t.priority]?.bg }}>
                  {PRIORITIES[t.priority]?.label}
                </span>
                <Button variant="ghost" size="icon" className="size-9 text-muted-foreground hover:text-red-600" onClick={() => remove(t)} aria-label="حذف">
                  <Trash2 className="size-4" />
                </Button>
              </div>
            )
          })}
        </div>
      )}

      <CreateTaskDialog open={createOpen} onClose={() => setCreateOpen(false)} staff={staff} onCreated={() => { setCreateOpen(false); load() }} />
    </div>
  )
}

function CreateTaskDialog({ open, onClose, staff, onCreated }: { open: boolean; onClose: () => void; staff: StaffMember[]; onCreated: () => void }) {
  const { toast } = useToast()
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [assigneeType, setAssigneeType] = React.useState<'USER' | 'ROLE'>('USER')
  const [assignedTo, setAssignedTo] = React.useState('')
  const [priority, setPriority] = React.useState('MEDIUM')
  const [dueDate, setDueDate] = React.useState('')
  const [rows, setRows] = React.useState<string[]>([''])
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (open) { setTitle(''); setDescription(''); setAssigneeType('USER'); setAssignedTo(''); setPriority('MEDIUM'); setDueDate(''); setRows(['']) }
  }, [open])

  async function submit() {
    if (!title.trim() || !assignedTo) {
      toast({ title: 'کم کامل است', description: 'عنوان و گیرنده را مشخص کن 🙂', variant: 'destructive' }); return
    }
    setBusy(true)
    try {
      const checklist = rows.map((r) => r.trim()).filter(Boolean).map((text) => ({ text, done: false }))
      await api.post('/api/tasks', { title: title.trim(), description: description.trim(), assigneeType, assignedTo, priority, dueDate: dueDate || undefined, checklist })
      toast({ title: 'وظیفه ساخته شد ✅', description: 'همکارت حالا می‌تونه شروع کنه!' })
      onCreated()
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-right">ساخت وظیفه جدید 📋</DialogTitle></DialogHeader>
        <div className="space-y-3.5">
          <div>
            <Label>عنوان وظیفه</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: کنترل تاریخ انقضای لبنیات" className="h-11" />
          </div>
          <div>
            <Label>توضیح (اختیاری)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="جزئیات کوچیک که کمک می‌کنه..." className="min-h-16" />
          </div>
          <div>
            <Label>به چه کسی/نقشی بسپاریم؟</Label>
            <div className="flex gap-2 mb-2">
              <Button type="button" size="sm" variant={assigneeType === 'USER' ? 'default' : 'outline'} className={cn('h-9', assigneeType === 'USER' && 'bg-olive hover:bg-olive/90 text-white')} onClick={() => { setAssigneeType('USER'); setAssignedTo('') }}>شخص مشخص</Button>
              <Button type="button" size="sm" variant={assigneeType === 'ROLE' ? 'default' : 'outline'} className={cn('h-9', assigneeType === 'ROLE' && 'bg-olive hover:bg-olive/90 text-white')} onClick={() => { setAssigneeType('ROLE'); setAssignedTo('') }}>کل یک نقش</Button>
            </div>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger className="h-11"><SelectValue placeholder="انتخاب کن..." /></SelectTrigger>
              <SelectContent className="max-h-64">
                {assigneeType === 'USER'
                  ? staff.filter((s) => s.active).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)
                  : Object.entries(ROLES).map(([k, v]) => <SelectItem key={k} value={k}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>اولویت</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITIES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>مهلت انجام</Label>
              <JalaliDatePicker value={dueDate} onChange={setDueDate} placeholder="بدون مهلت" />
            </div>
          </div>
          <div>
            <Label>چک‌لیست قدم‌به‌قدم (اختیاری)</Label>
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={r} onChange={(e) => setRows((p) => p.map((x, j) => j === i ? e.target.value : x))} placeholder={`قدم ${toFaDigits(i + 1)}...`} className="h-10" />
                  <Button type="button" variant="ghost" size="icon" className="size-10 shrink-0 text-muted-foreground hover:text-red-600" onClick={() => setRows((p) => p.filter((_, j) => j !== i))} aria-label="حذف قدم">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" className="w-full h-9 border-dashed" onClick={() => setRows((p) => [...p, ''])}>
                <Plus className="size-4 ml-1" /> افزودن قدم
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter className="flex-row justify-start gap-2">
          <Button onClick={submit} disabled={busy} className="h-11 px-6 font-bold bg-olive hover:bg-olive/90 text-white">
            {busy ? <Loader2 className="size-4 animate-spin" /> : 'ساخت وظیفه ✅'}
          </Button>
          <Button variant="ghost" onClick={onClose} className="h-11">انصراف</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ==================== SHARED ==================== */

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[13px] font-bold mb-1.5 text-foreground/80">{children}</div>
}

function Chip({ active, onClick, children, color }: { active: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn('rounded-full px-3.5 py-1.5 text-xs font-bold border transition-all', active ? 'text-white border-transparent shadow-sm' : 'border-gold/25 text-muted-foreground hover:border-gold/50 bg-card')}
      style={active ? { background: color || '#5a7d4f' } : undefined}
    >
      {children}
    </button>
  )
}

function parseChecklist(json: string | null): ChecklistItem[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.map((x: ChecklistItem) => ({ text: String(x.text || ''), done: !!x.done })) : []
  } catch { return [] }
}
