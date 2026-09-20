'use client'
import * as React from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { fmtJalali, toFaDigits, todayISO, daysBetweenISO } from '@/lib/jalali'
import { hasRole, PRIORITY_LABELS, type PUser, type TaskT } from '@/lib/types'
import {
  Avatar, Badge, Card, DangerButton, EmptyState, Field, GhostButton, GoldButton,
  inputCls, Loading, Modal, PrimaryButton, SectionHeader, StatusBadge, Tabs, TimeAgo,
} from '@/components/platform/kit'
import { JalaliDateField } from '@/components/platform/JalaliCalendar'

type UserLite = { id: number; name: string; color: string; active: boolean }

const PRIORITY_CHIP: Record<string, string> = {
  URGENT: 'bg-rose-100 text-rose-700 border-rose-300',
  HIGH: 'bg-amber-100 text-amber-800 border-amber-300',
  MEDIUM: 'bg-[#F3F7EF] text-[#3E6B4A] border-[#C8D8C0]',
  LOW: 'bg-stone-100 text-stone-600 border-stone-200',
}

export default function TasksSection({ user }: { user: PUser }) {
  const isManager =
    hasRole(user, 'GENERAL_MANAGER') || hasRole(user, 'OPERATION_MANAGER') ||
    hasRole(user, 'IT_ADMIN') || hasRole(user, 'OWNER')

  const [tasks, setTasks] = React.useState<TaskT[]>([])
  const [users, setUsers] = React.useState<UserLite[]>([])
  const [tab, setTab] = React.useState('mine')
  const [loading, setLoading] = React.useState(true)
  const [busyId, setBusyId] = React.useState<number | null>(null)

  // pause modal
  const [pauseTask, setPauseTask] = React.useState<TaskT | null>(null)
  const [pauseReason, setPauseReason] = React.useState('')

  // create / edit modal
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<TaskT | null>(null)
  const [fTitle, setFTitle] = React.useState('')
  const [fDesc, setFDesc] = React.useState('')
  const [fPriority, setFPriority] = React.useState('MEDIUM')
  const [fAssignee, setFAssignee] = React.useState('')
  const [fDue, setFDue] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  // two-step cancel confirm
  const [cancelId, setCancelId] = React.useState<number | null>(null)

  const load = React.useCallback(async () => {
    try {
      setLoading(true)
      const d = await api.get<{ tasks: TaskT[] }>('/api/tasks')
      setTasks(d.tasks)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void load() }, [load])

  React.useEffect(() => {
    if (!isManager) return
    api.get<{ users: UserLite[] }>('/api/users')
      .then((d) => setUsers(d.users.filter((u) => u.active)))
      .catch(() => { /* silent — assignment select just stays empty */ })
  }, [isManager])

  /* ---------- actions ---------- */

  async function act(t: TaskT, action: string, extra?: Record<string, unknown>, msg?: string) {
    setBusyId(t.id)
    try {
      const res = await api.patch<{ task: TaskT }>('/api/tasks', { id: t.id, action, userId: user.id, ...extra })
      setTasks((prev) => prev.map((x) => (x.id === res.task.id ? res.task : x)))
      if (msg) toast.success(msg)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  function askDone(t: TaskT) {
    void act(t, 'done', undefined, t.priority === 'URGENT' ? 'آفرین! +۵ امتیاز 🎉' : 'آفرین! +۳ امتیاز 🎉')
  }

  /** PAUSED → ادامه: reopen (back to OPEN) then start (IN_PROGRESS) */
  async function resumeTask(t: TaskT) {
    setBusyId(t.id)
    try {
      await api.patch<{ task: TaskT }>('/api/tasks', { id: t.id, action: 'reopen', userId: user.id })
      const res = await api.patch<{ task: TaskT }>('/api/tasks', { id: t.id, action: 'start', userId: user.id })
      setTasks((prev) => prev.map((x) => (x.id === res.task.id ? res.task : x)))
      toast.success('ادامه بده! قدم به قدم جلو می‌رویم 💪')
    } catch (e) {
      toast.error((e as Error).message)
      void load()
    } finally {
      setBusyId(null)
    }
  }

  function doPause() {
    if (!pauseTask) return
    const t = pauseTask
    setPauseTask(null)
    void act(t, 'pause', { pauseReason: pauseReason.trim() || null }, 'تسک متوقف شد — هر وقت آماده بودی ادامه بده 💚')
  }

  function openEditor(t?: TaskT) {
    setEditing(t ?? null)
    setFTitle(t?.title ?? '')
    setFDesc(t?.description ?? '')
    setFPriority(t?.priority ?? 'MEDIUM')
    setFAssignee(t ? String(t.assignedToId) : '')
    setFDue(t?.dueDate ? t.dueDate.slice(0, 10) : null)
    setCancelId(null)
    setEditorOpen(true)
  }

  async function submitTask(e: React.FormEvent) {
    e.preventDefault()
    if (!fTitle.trim()) { toast.error('عنوان تسک را بنویس'); return }
    if (!fAssignee) { toast.error('انتخاب کن کار به کدام همکار واگذار شود'); return }
    setSaving(true)
    try {
      if (editing) {
        await api.patch<{ task: TaskT }>('/api/tasks', {
          id: editing.id, action: 'edit', userId: user.id,
          title: fTitle.trim(), description: fDesc.trim() || null,
          priority: fPriority, assignedToId: Number(fAssignee), dueDate: fDue,
        })
        toast.success('تسک به‌روز شد ✅')
      } else {
        await api.post<{ task: TaskT }>('/api/tasks', {
          title: fTitle.trim(), description: fDesc.trim() || null,
          priority: fPriority, assignedToId: Number(fAssignee),
          createdById: user.id, dueDate: fDue,
        })
        toast.success('تسک ساخته شد — به همکار اطلاع داده شد ✅')
      }
      setEditorOpen(false)
      void load()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  /* ---------- derived ---------- */

  const mine = tasks.filter((t) => t.assignedToId === user.id && t.status !== 'DONE' && t.status !== 'CANCELLED')
  const doneMine = tasks.filter((t) => t.assignedToId === user.id && t.status === 'DONE')
  const visible = tab === 'mine' ? mine : tab === 'done' ? doneMine : tasks

  const tabs = [
    { key: 'mine', label: `تسک‌های من${mine.length ? ` (${toFaDigits(mine.length)})` : ''}` },
    ...(isManager ? [{ key: 'all', label: 'همه' }] : []),
    { key: 'done', label: 'انجام‌شده‌های من ✨' },
  ]

  /* ---------- card ---------- */

  function TaskCard({ t }: { t: TaskT }) {
    const isMine = t.assignedToId === user.id
    const dueISO = t.dueDate ? t.dueDate.slice(0, 10) : null
    const overdue = !!dueISO && !['DONE', 'CANCELLED'].includes(t.status) && daysBetweenISO(dueISO, todayISO()) < 0
    const who = t.assignedTo ?? (t.createdBy ? { id: t.createdBy.id, name: t.createdBy.name, color: '#5F7A4E' } : null)

    return (
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={PRIORITY_CHIP[t.priority] ?? PRIORITY_CHIP.LOW}>
            {PRIORITY_LABELS[t.priority] ?? t.priority}
          </Badge>
          <StatusBadge status={t.status} kind="task" />
          {overdue && <Badge className="border-rose-300 bg-rose-100 font-bold text-rose-700">⏰ گذشته</Badge>}
        </div>

        <h3 className="mt-2 break-words font-bold text-[#253A2A]">{t.title}</h3>
        {t.description && (
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[#6B7A66]">{t.description}</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#8A9884]">
          {t.dueDate && (
            <span className={cn('flex items-center gap-1', overdue && 'font-bold text-rose-600')}>
              🗓 سررسید: {fmtJalali(t.dueDate)}
            </span>
          )}
          {who && (
            <span className="flex items-center gap-1.5">
              <Avatar name={who.name} color={who.color || '#5F7A4E'} size={24} />
              {who.name}
            </span>
          )}
          <span>ایجاد: <TimeAgo iso={t.createdAt} /></span>
        </div>

        {t.status === 'PAUSED' && t.pauseReason && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-800">
            ⏸ دلیل توقف: {t.pauseReason} — هر وقت آماده بودی ادامه بده، عجله‌ای نیست.
          </div>
        )}

        {(isMine || isManager) && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-[#EFEAD8] pt-3">
            {isMine && t.status === 'OPEN' && (
              <PrimaryButton disabled={busyId === t.id} onClick={() => void act(t, 'start', undefined, 'شروع کردی — ما همین‌ایم کنارت 💪')}>
                شروع می‌کنم
              </PrimaryButton>
            )}
            {isMine && t.status === 'IN_PROGRESS' && (
              <>
                <GoldButton disabled={busyId === t.id} onClick={() => askDone(t)}>انجام شد ✓</GoldButton>
                <GhostButton disabled={busyId === t.id} onClick={() => { setPauseTask(t); setPauseReason('') }}>
                  توقف موقت
                </GhostButton>
              </>
            )}
            {isMine && t.status === 'PAUSED' && (
              <>
                <PrimaryButton disabled={busyId === t.id} onClick={() => void resumeTask(t)}>ادامه</PrimaryButton>
                <GoldButton disabled={busyId === t.id} onClick={() => askDone(t)}>انجام شد ✓</GoldButton>
              </>
            )}
            {isManager && (
              <>
                <GhostButton onClick={() => openEditor(t)}>ویرایش</GhostButton>
                {!['DONE', 'CANCELLED'].includes(t.status) && (
                  cancelId === t.id ? (
                    <DangerButton onClick={() => { setCancelId(null); void act(t, 'cancel', undefined, 'تسک لغو شد') }}>
                      مطمئنی؟ تایید لغو
                    </DangerButton>
                  ) : (
                    <DangerButton onClick={() => setCancelId(t.id)}>لغو تسک</DangerButton>
                  )
                )}
              </>
            )}
          </div>
        )}
      </Card>
    )
  }

  /* ---------- render ---------- */

  return (
    <div dir="rtl" className="space-y-4">
      <SectionHeader
        title="تسک‌ها"
        subtitle="این چک‌لیست برای اطمینان توست — نه برای کنترل 🌿"
        icon={<span className="text-lg">✅</span>}
        actions={isManager ? <PrimaryButton onClick={() => openEditor()}>+ تسک جدید</PrimaryButton> : undefined}
      />

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'done' && visible.length > 0 && (
        <div className="rounded-2xl border border-[#EAD9A8] bg-gradient-to-l from-[#FBF3DC] to-[#FDF8EA] px-4 py-3 text-sm font-semibold text-[#8A6508]">
          ✨ اینجا کارهایی است که خودت کامل کردی — به دست‌هایت افتخار کن!
        </div>
      )}

      {loading ? (
        <Loading />
      ) : visible.length === 0 ? (
        tab === 'mine' ? (
          <EmptyState
            icon={<span className="text-3xl">☀️</span>}
            title="هیچ تسکی روی میز تو نیست"
            hint="یعنی همه‌چیز مرتب است. وقت آزاد را می‌توانی صرف مرور راهنما یا اشتراک خبر خوب در دیوار تیمی کنی 🌿"
          />
        ) : tab === 'done' ? (
          <EmptyState
            icon={<span className="text-3xl">✨</span>}
            title="هنوز برداشتی ثبت نشده"
            hint="اولین تسک‌ات را کامل کن تا اینجا بدرخشد — هر تسک کامل‌شده +۳ امتیاز دارد 🎉"
          />
        ) : (
          <EmptyState
            icon={<span className="text-3xl">📝</span>}
            title="هنوز تسکی ثبت نشده"
            hint="با دکمه «+ تسک جدید» اولین تسک را بساز و به همکارت سپردش بده."
          />
        )
      ) : (
        <div className="max-h-[65vh] space-y-3 overflow-y-auto pb-2 pl-1 pz-scroll">
          {visible.map((t) => <TaskCard key={t.id} t={t} />)}
        </div>
      )}

      {/* pause modal */}
      <Modal open={!!pauseTask} onClose={() => setPauseTask(null)} title="توقف موقت تسک">
        <p className="mb-3 text-sm leading-6 text-[#5A6B54]">
          نگران نباش — توقف و هماهنگی بخش طبیعی کار است. اگر دلیل را بنویسی سرپرست در جریان می‌ماند و کمکت می‌کند.
        </p>
        <Field label="دلیل توقف (اختیاری)">
          <textarea
            className={cn(inputCls, 'min-h-[88px] resize-y')}
            value={pauseReason}
            onChange={(e) => setPauseReason(e.target.value)}
            placeholder="مثلاً: منتظر تحویل کالای نوبت قبل هستم…"
          />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <GhostButton onClick={() => setPauseTask(null)}>بی‌خیال</GhostButton>
          <PrimaryButton disabled={busyId !== null} onClick={doPause}>توقف موقت</PrimaryButton>
        </div>
      </Modal>

      {/* create / edit modal */}
      <Modal open={editorOpen} onClose={() => setEditorOpen(false)} title={editing ? 'ویرایش تسک' : 'تسک جدید'}>
        <form onSubmit={submitTask} className="space-y-4">
          <Field label="عنوان" required>
            <input className={inputCls} value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="مثلاً: چیدمان قفسه لبنیات" />
          </Field>
          <Field label="توضیحات" hint="هر توضیحی که کار را برای همکار روشن‌تر می‌کند">
            <textarea className={cn(inputCls, 'min-h-[80px] resize-y')} value={fDesc} onChange={(e) => setFDesc(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="اولویت">
              <select className={inputCls} value={fPriority} onChange={(e) => setFPriority(e.target.value)}>
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="واگذار به" required>
              <select className={inputCls} value={fAssignee} onChange={(e) => setFAssignee(e.target.value)}>
                <option value="">انتخاب همکار…</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="تاریخ سررسید (اختیاری)">
            <JalaliDateField value={fDue} onChange={setFDue} />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <GhostButton type="button" onClick={() => setEditorOpen(false)}>انصراف</GhostButton>
            <PrimaryButton type="submit" disabled={saving}>{editing ? 'ذخیره تغییرات' : 'ساخت تسک'}</PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  )
}
