'use client'

import * as React from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/store/app'
import { useToast } from '@/hooks/use-toast'
import {
  SectionHeader, StatCard, StatusBadge, EmptyState, LoadingBlock, UserAvatar, ChipSelect,
} from '@/components/platform/ui/shared'
import { JalaliDatePicker } from '@/components/platform/ui/jalali-date-picker'
import { formatJalali, timeAgo, toFaDigits, jalaliKey } from '@/lib/jalali'
import { TASK_STATUSES, PRIORITIES, type TaskDTO } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  ListChecks, Plus, PlayCircle, Eye, PauseCircle, CheckCircle2, MessageSquare,
  CalendarClock, Loader2, Pencil, AlertTriangle, PartyPopper, ClipboardCheck, ChevronDown,
} from 'lucide-react'

interface TasksResponse {
  tasks: TaskDTO[]
  stats: { open: number; inProgress: number; doneToday: number; overdue: number }
}

interface UserLite {
  id: string
  name: string
  color: string
  title: string
  active: boolean
}

const CATEGORY_OPTIONS = ['عمومی', 'فروش', 'انبار', 'چیدمان', 'صندوق', 'مشتریان', 'تسویه', 'فوری']

export function Tasks() {
  const { user } = useApp()
  const { toast } = useToast()
  const [tab, setTab] = React.useState<string>('mine')
  const [data, setData] = React.useState<TasksResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [detail, setDetail] = React.useState<TaskDTO | null>(null)
  const [detailUpdates, setDetailUpdates] = React.useState<TaskDTO['updates']>([])
  const [comment, setComment] = React.useState('')
  const [pauseTarget, setPauseTarget] = React.useState<TaskDTO | null>(null)
  const [pauseReason, setPauseReason] = React.useState('')
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [editTask, setEditTask] = React.useState<TaskDTO | null>(null)
  const [users, setUsers] = React.useState<UserLite[]>([])

  const isManager = !!user?.isManager

  const load = React.useCallback(async () => {
    try {
      const d = await api<TasksResponse>(`/api/tasks?${tab === 'mine' ? 'mine=1' : ''}`)
      setData(d)
    } catch (e) {
      toast({ title: 'دریافت کارها ناموفق بود', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [tab, toast])

  React.useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  React.useEffect(() => {
    if (!isManager) return
    api<{ users: UserLite[] }>('/api/users')
      .then((d) => setUsers(d.users.filter((u) => u.active)))
      .catch(() => null)
  }, [isManager])

  const patch = async (id: string, body: Record<string, unknown>, opts: { celebrate?: boolean; keepOpen?: boolean } = {}) => {
    setBusyId(id)
    try {
      await api(`/api/tasks/${id}`, { method: 'PATCH', body })
      if (opts.celebrate) {
        toast({ title: 'آفرین! +۵ امتیاز ⭐', description: 'این کار با موفقیت انجام شد — دستت درد نکند 🎉' })
      } else {
        toast({ title: 'ثبت شد 🌿' })
      }
      if (!opts.keepOpen) setDetail(null)
      await load()
    } catch (e) {
      toast({ title: 'انجام نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  const openDetail = async (t: TaskDTO) => {
    setDetail(t)
    setDetailUpdates(t.updates ?? [])
    try {
      const d = await api<{ task: TaskDTO }>(`/api/tasks/${t.id}`)
      setDetailUpdates(d.task.updates ?? [])
      setDetail(d.task)
    } catch {
      /* keep list data */
    }
  }

  const sendComment = async () => {
    if (!detail || !comment.trim()) return
    const c = comment.trim()
    setComment('')
    await patch(detail.id, { updateContent: c }, { keepOpen: true })
    setDetailUpdates((prev) => [
      ...(prev ?? []),
      { id: `tmp-${Date.now()}`, userName: user?.name ?? '', content: c, createdAt: new Date().toISOString() },
    ])
  }

  const tasks = data?.tasks ?? []
  const stats = data?.stats

  return (
    <div className="space-y-4">
      <SectionHeader
        title="کارهای من"
        subtitle="دستیار تو برای مرتب‌کاری — هر قدم یک پیروزی 🌿"
        icon={<ListChecks className="h-5 w-5" />}
        actions={
          isManager ? (
            <Button size="sm" className="gap-1.5" onClick={() => { setEditTask(null); setEditorOpen(true) }}>
              <Plus className="h-4 w-4" /> کار جدید
            </Button>
          ) : undefined
        }
      />

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard title="باز" value={toFaDigits(stats.open)} color="#8A8F98" icon={<ListChecks className="h-4 w-4" />} />
          <StatCard title="در جریان" value={toFaDigits(stats.inProgress)} color="#B07D2B" icon={<PlayCircle className="h-4 w-4" />} />
          <StatCard title="امروز انجام شد" value={toFaDigits(stats.doneToday)} color="#3E7C59" icon={<CheckCircle2 className="h-4 w-4" />} />
          <StatCard title="گذشته از موعد" value={toFaDigits(stats.overdue)} color="#B33A3A" icon={<CalendarClock className="h-4 w-4" />} />
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="mine" className="flex-1 md:flex-none">کارهای من</TabsTrigger>
          {isManager && <TabsTrigger value="all" className="flex-1 md:flex-none">همه کارها</TabsTrigger>}
        </TabsList>

        <TabsContent value="mine" className="mt-3">
          <DailyChecklist />
          {loading ? <LoadingBlock rows={4} /> : tasks.length === 0 ? (
            <EmptyState
              icon={<PartyPopper />}
              title="همه‌چیز مرتب است!"
              description="فعلاً کاری برایت نداریم. وقت خوبی برای یک استراحت کوتاه است ☕"
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {tasks.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  mine
                  busy={busyId === t.id}
                  onOpen={() => openDetail(t)}
                  onStatus={(s) => {
                    if (s === 'PAUSED') { setPauseTarget(t); setPauseReason('') }
                    else patch(t.id, { status: s }, { celebrate: s === 'DONE' })
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {isManager && (
          <TabsContent value="all" className="mt-3">
            {loading ? <LoadingBlock rows={4} /> : tasks.length === 0 ? (
              <EmptyState icon={<ListChecks />} title="هنوز کاری ثبت نشده" description="با «کار جدید» اولین کار را به تیم بسپار." />
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {tasks.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    busy={busyId === t.id}
                    onOpen={() => openDetail(t)}
                    onEdit={() => { setEditTask(t); setEditorOpen(true) }}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* pause reason dialog */}
      <Dialog open={!!pauseTarget} onOpenChange={(o) => !o && setPauseTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PauseCircle className="h-5 w-5 text-saffron" /> توقف موقت کار
            </DialogTitle>
            <DialogDescription>
              اشکالی ندارد! فقط بگو چه چیزی مانع شده تا همکاران بدانند. هر وقت آماده بودی ادامه می‌دهیم.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={pauseReason}
            onChange={(e) => setPauseReason(e.target.value)}
            placeholder="مثلاً: منتظر تحویل کالا هستم…"
            rows={3}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setPauseTarget(null)}>بی‌خیال</Button>
            <Button
              disabled={!pauseReason.trim() || !pauseTarget || busyId === pauseTarget.id}
              onClick={() => {
                if (pauseTarget) patch(pauseTarget.id, { status: 'PAUSED', pauseReason }).then(() => setPauseTarget(null))
              }}
            >
              ثبت توقف
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="text-right">{detail.title}</DialogTitle>
                <DialogDescription className="text-right">
                  {detail.description || 'توضیحی ثبت نشده است.'}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <StatusBadge label={statusInfo(detail.status).label} color={statusInfo(detail.status).color} />
                <Badge variant="outline" className="rounded-full">{detail.category}</Badge>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <CalendarClock className="h-3.5 w-3.5" /> موعد: {formatJalali(detail.dueDate)}
                </span>
                {detail.fromOwner && (
                  <Badge className="rounded-full text-white" style={{ background: 'linear-gradient(120deg,#c9a227,#8a6f3c)' }}>
                    👑 از سوی مالک
                  </Badge>
                )}
                {detail.assigneeName && (
                  <span className="flex items-center gap-1.5">
                    <UserAvatar name={detail.assigneeName} color={detail.assigneeColor ?? '#3E7C59'} size={22} />
                    {detail.assigneeName}
                  </span>
                )}
              </div>
              {detail.status === 'PAUSED' && detail.pauseReason && (
                <div className="rounded-xl bg-saffron/10 border border-saffron/40 p-3 text-xs text-saffron flex items-start gap-2">
                  <PauseCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">دلیل توقف:</p>
                    <p>{detail.pauseReason}</p>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <p className="text-sm font-bold flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4 text-primary" /> گفتگوی کار
                </p>
                <div className="max-h-48 overflow-y-auto space-y-2 pe-1 nice-scroll">
                  {(detailUpdates ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground">هنوز یادداشتی نیست — اولین نفر باش ✍️</p>
                  )}
                  {(detailUpdates ?? []).map((u) => (
                    <div key={u.id} className="rounded-xl bg-accent/60 p-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-bold">{u.userName}</span>
                        <span className="text-muted-foreground">{timeAgo(u.createdAt)}</span>
                      </div>
                      <p>{u.content}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  <Input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendComment()}
                    placeholder="یادداشت یا پیشرفتت را بنویس…"
                    className="h-10"
                  />
                  <Button size="sm" className="h-10 shrink-0" disabled={!comment.trim()} onClick={sendComment}>
                    ثبت
                  </Button>
                </div>
              </div>
              {detail.assignedToId === user?.id && detail.status !== 'DONE' && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline" className="gap-1.5 border-saffron/50 text-saffron"
                    disabled={busyId === detail.id}
                    onClick={() => patch(detail.id, { status: 'IN_PROGRESS' })}
                  >
                    <PlayCircle className="h-4 w-4" /> شروع
                  </Button>
                  <Button
                    variant="outline" className="gap-1.5"
                    disabled={busyId === detail.id}
                    onClick={() => patch(detail.id, { status: 'FOLLOW_UP' })}
                  >
                    <Eye className="h-4 w-4" /> پیگیری
                  </Button>
                  <Button
                    variant="outline" className="gap-1.5 border-pomegranate/50 text-pomegranate"
                    onClick={() => { setPauseTarget(detail); setPauseReason('') }}
                  >
                    <PauseCircle className="h-4 w-4" /> توقف
                  </Button>
                  <Button
                    className="gap-1.5" disabled={busyId === detail.id}
                    onClick={() => patch(detail.id, { status: 'DONE' }, { celebrate: true })}
                  >
                    {busyId === detail.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    انجام شد ✅
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* manager create/edit dialog */}
      <TaskEditor
        open={editorOpen}
        task={editTask}
        users={users}
        onClose={() => setEditorOpen(false)}
        onSaved={() => { setEditorOpen(false); load() }}
      />
    </div>
  )
}

function statusInfo(status: string) {
  return TASK_STATUSES.find((s) => s.key === status) ?? { label: status, color: '#8A8F98' }
}

function TaskCard({
  task, mine, busy, onOpen, onStatus, onEdit,
}: {
  task: TaskDTO
  mine?: boolean
  busy?: boolean
  onOpen: () => void
  onStatus?: (s: string) => void
  onEdit?: () => void
}) {
  const pr = PRIORITIES.find((p) => p.key === task.priority) ?? PRIORITIES[1]
  const st = statusInfo(task.status)
  const overdue = task.dueDate && task.status !== 'DONE' && new Date(task.dueDate).getTime() < Date.now()
  return (
    <Card className="glow-border-static overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <button onClick={onOpen} className="w-full text-right space-y-2 focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold leading-6">{task.title}</p>
            <StatusBadge label={st.label} color={st.color} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: pr.color }} />
              {pr.label}
            </span>
            <Badge variant="secondary" className="rounded-full">{task.category}</Badge>
            {task.fromOwner && <Badge className="rounded-full text-white" style={{ background: 'linear-gradient(120deg,#c9a227,#8a6f3c)' }}>👑 مالک</Badge>}
            {task.dueDate && (
              <span className={overdue ? 'text-pomegranate font-bold' : ''}>
                📅 {formatJalali(task.dueDate)} {overdue && '(گذشته)'}
              </span>
            )}
          </div>
          {!mine && task.assigneeName && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <UserAvatar name={task.assigneeName} color={task.assigneeColor ?? '#3E7C59'} size={20} />
              {task.assigneeName}
            </div>
          )}
          {task.status === 'PAUSED' && task.pauseReason && (
            <p className="text-xs text-saffron flex items-center gap-1">
              <PauseCircle className="h-3.5 w-3.5" /> {task.pauseReason}
            </p>
          )}
        </button>
        {mine && onStatus && task.status !== 'DONE' ? (
          <div className="grid grid-cols-2 gap-2">
            {task.status === 'TODO' && (
              <Button variant="outline" size="sm" className="gap-1.5 border-saffron/50 text-saffron h-10" disabled={busy} onClick={() => onStatus('IN_PROGRESS')}>
                <PlayCircle className="h-4 w-4" /> شروع
              </Button>
            )}
            {task.status !== 'FOLLOW_UP' && (
              <Button variant="outline" size="sm" className="h-10" disabled={busy} onClick={() => onStatus('FOLLOW_UP')}>
                <Eye className="h-4 w-4" /> پیگیری
              </Button>
            )}
            {task.status !== 'PAUSED' && (
              <Button variant="outline" size="sm" className="gap-1.5 border-pomegranate/50 text-pomegranate h-10" onClick={() => onStatus('PAUSED')}>
                <PauseCircle className="h-4 w-4" /> توقف
              </Button>
            )}
            <Button size="sm" className="gap-1.5 h-10" disabled={busy} onClick={() => onStatus('DONE')}>
              <CheckCircle2 className="h-4 w-4" /> انجام شد ✅
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 h-9" onClick={onOpen}>
              جزئیات و گفتگو
            </Button>
            {onEdit && (
              <Button variant="ghost" size="sm" className="h-9 gap-1.5" onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5" /> ویرایش
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TaskEditor({
  open, task, users, onClose, onSaved,
}: {
  open: boolean
  task: TaskDTO | null
  users: UserLite[]
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [category, setCategory] = React.useState('عمومی')
  const [priority, setPriority] = React.useState<string>('MEDIUM')
  const [assignedToId, setAssignedToId] = React.useState<string>('')
  const [dueDate, setDueDate] = React.useState<Date | null>(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setTitle(task?.title ?? '')
      setDescription(task?.description ?? '')
      setCategory(task?.category ?? 'عمومی')
      setPriority(task?.priority ?? 'MEDIUM')
      setAssignedToId(task?.assignedToId ?? '')
      setDueDate(task?.dueDate ? new Date(task.dueDate) : null)
    }
  }, [open, task])

  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        title, description, category, priority,
        assignedToId: assignedToId || null,
        dueDate: dueDate ? dueDate.toISOString() : null,
      }
      if (task) {
        await api(`/api/tasks/${task.id}`, { method: 'PATCH', body })
      } else {
        await api('/api/tasks', { body })
      }
      toast({ title: task ? 'کار بروز شد 🌿' : 'کار جدید ثبت شد 🌿' })
      onSaved()
    } catch (e) {
      toast({ title: 'ذخیره نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? 'ویرایش کار' : 'کار جدید برای تیم'}</DialogTitle>
          <DialogDescription>هر چه دقیق‌تر بنویسی، همکار راحت‌تر انجامش می‌دهد 💚</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>عنوان</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: چیدمان قفسه لبنیات" />
          </div>
          <div className="space-y-1.5">
            <Label>توضیح</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="اختیاری" />
          </div>
          <div className="space-y-1.5">
            <Label>دسته‌بندی</Label>
            <ChipSelect
              options={CATEGORY_OPTIONS.map((c) => ({ key: c, label: c }))}
              value={category}
              onChange={(v) => setCategory(v)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>اولویت</Label>
            <ChipSelect options={PRIORITIES} value={priority} onChange={(v) => setPriority(v)} />
          </div>
          <div className="space-y-1.5">
            <Label>مجری</Label>
            <select
              value={assignedToId}
              onChange={(e) => setAssignedToId(e.target.value)}
              className="w-full h-10 rounded-xl border border-input bg-card px-3 text-sm"
            >
              <option value="">— انتخاب همکار —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.title})</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>موعد</Label>
            <JalaliDatePicker value={dueDate} onChange={setDueDate} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>انصراف</Button>
            <Button onClick={save} disabled={saving || !title.trim()} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} ذخیره
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function TaskHint() {
  return (
    <p className="text-xs text-muted-foreground flex items-center gap-1">
      <AlertTriangle className="h-3 w-3 text-saffron" /> یادت باشد: هر کار انجام‌شده ۵ امتیاز مثبت دارد.
    </p>
  )
}

// ---------- daily checklist (واقعی‌ترین دوست شیفت!) ----------
interface ChecklistDTO {
  id: string
  title: string
  items: { text: string }[]
  state: { text: string; done: boolean }[]
  completedAt?: string | null
}

export function DailyChecklist() {
  const { toast } = useToast()
  const [lists, setLists] = React.useState<ChecklistDTO[] | null>(null)
  const [open, setOpen] = React.useState(true)
  const day = jalaliKey(new Date())
  const busyRef = React.useRef(false)

  const load = React.useCallback(async () => {
    try {
      const d = await api<{ checklists: ChecklistDTO[] }>(`/api/checklists?day=${encodeURIComponent(day)}`)
      setLists(d.checklists)
    } catch {
      setLists([])
    }
  }, [day])

  React.useEffect(() => { load() }, [load])

  const toggle = async (list: ChecklistDTO, idx: number) => {
    if (busyRef.current) return
    const state = (list.state.length === list.items.length && list.state.length > 0
      ? list.state
      : list.items.map((i) => ({ text: i.text, done: false }))
    ).map((s, j) => (j === idx ? { ...s, done: !s.done } : s))
    // optimistic
    setLists((prev) => prev?.map((l) => (l.id === list.id ? { ...l, state, completedAt: null } : l)) ?? prev)
    busyRef.current = true
    try {
      const d = await api<{ success: boolean; completedAt: string | null }>('/api/checklists', {
        method: 'PATCH',
        body: { id: list.id, day, state },
      })
      if (d.completedAt) {
        toast({ title: 'آفرین! چک‌لیست امروز کامل شد +۲ امتیاز ⭐', description: 'شیفت تمیزی داشتی — دستت درد نکند 🌿' })
      }
      await load()
    } catch {
      load()
    } finally {
      busyRef.current = false
    }
  }

  if (!lists) return null
  if (lists.length === 0) return null

  const allDone = lists.every((l) => l.completedAt)

  return (
    <Card className="glow-border-static overflow-hidden mb-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 p-4 pb-3 text-right"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-bold">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          چک‌لیست امروز
          {allDone ? (
            <span className="rounded-full bg-primary/10 text-primary px-2.5 py-1 text-[11px] font-bold">کامل شد ✅ +۲</span>
          ) : (
            <span className="rounded-full bg-gold/15 text-gold px-2.5 py-1 text-[11px] font-bold num">
              {toFaDigits(lists.reduce((s, l) => s + l.state.filter((x) => x.done).length, 0))}/{toFaDigits(lists.reduce((s, l) => s + l.items.length, 0))}
            </span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <CardContent className="pt-0 space-y-3">
          {lists.map((l) => {
            const state = l.state.length === l.items.length && l.state.length > 0
              ? l.state
              : l.items.map((i) => ({ text: i.text, done: false }))
            return (
              <div key={l.id} className="rounded-xl border p-3 space-y-2">
                <p className="text-xs font-bold flex items-center gap-1.5">
                  {l.title}
                  {l.completedAt && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                </p>
                {l.items.map((item, idx) => {
                  const done = state[idx]?.done ?? false
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggle(l, idx)}
                      className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-right text-xs transition-colors min-h-11 ${
                        done ? 'bg-primary/10 text-primary line-through decoration-primary/40' : 'hover:bg-accent'
                      }`}
                      aria-pressed={done}
                    >
                      <span
                        className={`h-5 w-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                          done ? 'bg-primary border-primary text-primary-foreground' : 'border-input'
                        }`}
                      >
                        {done && <CheckCircle2 className="h-3.5 w-3.5" />}
                      </span>
                      <span className="flex-1">{item.text}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
          <p className="text-[10px] text-muted-foreground text-center">تکمیل همه‌ی موارد روزانه = ۲ امتیاز تشویقی ⭐</p>
        </CardContent>
      )}
    </Card>
  )
}
