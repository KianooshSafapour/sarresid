'use client'
import * as React from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { fmtJalali, toFaDigits } from '@/lib/jalali'
import { hasRole, type PUser } from '@/lib/types'
import {
  Badge, Card, DangerButton, EmptyState, Field, GhostButton, inputCls,
  Loading, Modal, PrimaryButton, SectionHeader, Tabs,
} from '@/components/platform/kit'

interface SopRow {
  id: number
  title: string
  department: string
  steps: string[]
  createdAt: string
}

const DEPT_META: Record<string, { label: string; chip: string }> = {
  GENERAL: { label: 'عمومی', chip: 'bg-[#F3F7EF] text-[#3E6B4A] border-[#C8D8C0]' },
  WAREHOUSE: { label: 'انبار', chip: 'bg-[#FBF3DC] text-[#8A6508] border-[#EAD9A8]' },
  CASHIER: { label: 'صندوق', chip: 'bg-rose-50 text-rose-700 border-rose-200' },
  MERCHANDISING: { label: 'چیدمان', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  SALES: { label: 'فروش', chip: 'bg-stone-100 text-stone-700 border-stone-200' },
}
const DEPT_KEYS = ['GENERAL', 'WAREHOUSE', 'CASHIER', 'MERCHANDISING', 'SALES']
const deptMeta = (d: string) => DEPT_META[d] ?? { label: d, chip: 'bg-stone-100 text-stone-700 border-stone-200' }

const FAQS: { q: string; a: string }[] = [
  {
    q: 'چطور سفارش ثبت کنم؟',
    a: 'از منوی «سفارش‌ها» دکمه «سفارش جدید» را بزن، تأمین‌کننده را انتخاب کن و اقلام را اضافه کن. تا قبل از تایید، سفارش پیش‌نویس است و راحت قابل ویرایش — پس بدون استرس شروع کن. بعد از ارسال، مدیر بررسی می‌کند و همه از وضعیت باخبر می‌شوند.',
  },
  {
    q: 'بارکد اسکن نمی‌کرد چه کنم؟',
    a: 'اول بارکد را دستی در جستجوی بخش «محصولات» وارد کن. اگر محصول پیدا نشد، از دکمه ویرایش همان محصول بارکد را اضافه کن. اگر باز هم مشکل بود، در «دیوار تیمی» بنویس یا به مدیر IT پیام بده تا سریع رسیدگی کند.',
  },
  {
    q: 'چطور امتیاز بگیرم؟',
    a: 'هر تسک کامل‌شده +۳ امتیاز (فوری‌ها +۵)، ثبت ایده +۳، پذیرفته‌شدن ایده +۲۰ و اجرای آن +۵۰ امتیاز دارد! حتی یک نکته مفید روی «دیوار تیمی» هم +۲ امتیاز دارد. جمع امتیازت را در پروفایلت می‌بینی 🌟',
  },
  {
    q: 'چطور به مدیر فکر/ایده بدهم؟',
    a: 'در بخش «تیم»، زبانه «ایده‌ها» عنوان و توضیح ایده‌ات را بنویس و «ارسال ایده» بزن. مدیرها وضعیت بررسی را همین‌جا به‌روز می‌کنند و اگر پیاده شود جایزه می‌گیری — ایده‌های کوچک هم خیلی ارزش دارند!',
  },
  {
    q: 'چطور درخواست انبار بدهم؟',
    a: 'از بخش «انبار» فرم درخواست کالا را با تعداد موردنیاز پر کن. انباردار همان لحظه اطلاع می‌گیرد و وقتی کالا آماده شد نوتیفیکیشن برایت می‌آید — پس بدون نگرانی منتظر بمان.',
  },
]

export default function SopsSection({ user }: { user: PUser }) {
  const isManager = hasRole(user, 'GENERAL_MANAGER') || hasRole(user, 'OPERATION_MANAGER') || hasRole(user, 'IT_ADMIN')

  const [sops, setSops] = React.useState<SopRow[]>([])
  const [tab, setTab] = React.useState('sops')
  const [deptFilter, setDeptFilter] = React.useState('ALL')
  const [loading, setLoading] = React.useState(true)

  // step viewer
  const [viewer, setViewer] = React.useState<SopRow | null>(null)
  const [doneSteps, setDoneSteps] = React.useState<Set<number>>(new Set())

  // manager editor
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<SopRow | null>(null)
  const [fTitle, setFTitle] = React.useState('')
  const [fDept, setFDept] = React.useState('GENERAL')
  const [fSteps, setFSteps] = React.useState<string[]>([''])
  const [saving, setSaving] = React.useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<number | null>(null)

  const load = React.useCallback(async () => {
    try {
      setLoading(true)
      const d = await api.get<{ sops: SopRow[] }>('/api/sops')
      setSops(d.sops)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void load() }, [load])

  /* ---------- viewer ---------- */

  const doneSet = doneSteps
  const total = viewer?.steps.length ?? 0
  const progress = total > 0 ? Math.round((doneSet.size / total) * 100) : 0
  const allDone = total > 0 && doneSet.size === total

  function openViewer(s: SopRow) {
    setViewer(s)
    setDoneSteps(new Set())
    setDeleteConfirmId(null)
  }

  function toggleStep(i: number) {
    setDoneSteps((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  function resetSteps() { setDoneSteps(new Set()) }

  /* ---------- manager CRUD ---------- */

  function openEditor(s?: SopRow) {
    setEditing(s ?? null)
    setFTitle(s?.title ?? '')
    setFDept(s?.department ?? 'GENERAL')
    setFSteps(s?.steps.length ? [...s.steps] : [''])
    setDeleteConfirmId(null)
    setEditorOpen(true)
  }

  async function submitSop(e: React.FormEvent) {
    e.preventDefault()
    const steps = fSteps.map((s) => s.trim()).filter(Boolean)
    if (!fTitle.trim()) { toast.error('عنوان دستورالعمل را بنویس'); return }
    if (!steps.length) { toast.error('حداقل یک مرحله بنویس'); return }
    setSaving(true)
    try {
      if (editing) {
        await api.patch<{ sop: SopRow }>('/api/sops', { id: editing.id, userId: user.id, title: fTitle.trim(), department: fDept, steps })
        toast.success('دستورالعمل به‌روز شد ✅')
      } else {
        await api.post<{ sop: SopRow }>('/api/sops', { createdById: user.id, title: fTitle.trim(), department: fDept, steps })
        toast.success('دستورالعمل ساخته شد — حالا همه می‌توانند با خیال راحت از آن استفاده کنند ✅')
      }
      setEditorOpen(false)
      void load()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteSop(s: SopRow) {
    try {
      await api.del(`/api/sops?id=${s.id}&userId=${user.id}`)
      setDeleteConfirmId(null)
      toast.success('دستورالعمل حذف شد')
      void load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  /* ---------- derived ---------- */

  const otherDepts = [...new Set(sops.map((s) => s.department))].filter((d) => !DEPT_KEYS.includes(d))
  const chips = ['ALL', ...DEPT_KEYS, ...otherDepts]
  const filtered = deptFilter === 'ALL' ? sops : sops.filter((s) => s.department === deptFilter)

  /* ---------- render ---------- */

  return (
    <div dir="rtl" className="space-y-4">
      <SectionHeader
        title="دستورالعمل‌ها (SOP)"
        subtitle="راهنمای قدم‌به‌قدم کارها — برای اینکه با خیال راحت کار کنی"
        icon={<span className="text-lg">📋</span>}
        actions={isManager ? <PrimaryButton onClick={() => openEditor()}>+ دستورالعمل جدید</PrimaryButton> : undefined}
      />

      <Tabs
        tabs={[
          { key: 'sops', label: 'دستورالعمل‌ها' },
          { key: 'help', label: 'راهنما | FAQ' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'help' ? (
        <Card className="p-2 sm:p-3">
          <p className="px-3 pb-2 pt-1 text-xs text-[#8A9884]">هر سؤالی داری باز کن — جواب‌ها کوتاه و دوستانه‌اند 💚</p>
          {FAQS.map((f) => (
            <details key={f.q} className="group border-b border-[#EFEAD8] last:border-0">
              <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-sm font-bold text-[#253A2A] transition-colors hover:text-[#3E6B4A]">
                <span>{f.q}</span>
                <span className="shrink-0 text-[#93C572] transition-transform group-open:rotate-180">▼</span>
              </summary>
              <p className="px-4 pb-4 text-sm leading-7 text-[#5A6B54]">{f.a}</p>
            </details>
          ))}
        </Card>
      ) : loading ? (
        <Loading />
      ) : (
        <>
          {/* department chips */}
          <div className="flex flex-wrap gap-2">
            {chips.map((d) => {
              const active = deptFilter === d
              const count = d === 'ALL' ? sops.length : sops.filter((s) => s.department === d).length
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDeptFilter(d)}
                  className={cn(
                    'flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-bold transition-all active:scale-[0.98]',
                    active
                      ? 'border-transparent bg-gradient-to-b from-[#4A7A52] to-[#3A6242] text-white shadow-md'
                      : 'border-[#D8D2BC] bg-white/80 text-[#5A6B54] hover:border-[#5F8F55] hover:bg-[#F3F7EF]'
                  )}
                >
                  {d === 'ALL' ? 'همه' : deptMeta(d).label}
                  <span className={cn('rounded-full px-1.5 text-[10px]', active ? 'bg-white/20' : 'bg-[#F3F7EF] text-[#6B7A66]')}>
                    {toFaDigits(count)}
                  </span>
                </button>
              )
            })}
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<span className="text-3xl">📋</span>}
              title="در این دسته هنوز دستورالعملی نیست"
              hint={isManager ? 'با دکمه «+ دستورالعمل جدید» اولین راهنما را بساز تا همکارها خیالشان راحت شود.' : 'به‌زودی اضافه می‌شود — تا آن موقع هر سوالی دادی از زبانه «راهنما» بپرس 💚'}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((s) => {
                const meta = deptMeta(s.department)
                return (
                  <Card
                    key={s.id}
                    className="flex cursor-pointer flex-col p-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
                    onClick={() => openViewer(s)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={meta.chip}>{meta.label}</Badge>
                      <Badge className="border-[#EAD9A8] bg-[#FBF3DC] text-[#8A6508]">{toFaDigits(s.steps.length)} مرحله</Badge>
                    </div>
                    <h3 className="mt-2 break-words font-bold leading-6 text-[#253A2A]">{s.title}</h3>
                    <p className="mt-1 line-clamp-2 text-xs leading-6 text-[#8A9884]">
                      {s.steps.slice(0, 2).join(' • ')}{s.steps.length > 2 ? ' …' : ''}
                    </p>
                    <div className="mt-auto flex items-center justify-between pt-3">
                      <span className="text-[11px] text-[#8A9884]">ساخته‌شده: {fmtJalali(s.createdAt)}</span>
                      {isManager && (
                        <span className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <GhostButton className="px-2.5! py-1.5! text-xs" onClick={() => openEditor(s)}>ویرایش</GhostButton>
                          {deleteConfirmId === s.id ? (
                            <DangerButton className="px-2.5! py-1.5! text-xs" onClick={() => void deleteSop(s)}>مطمئنی؟</DangerButton>
                          ) : (
                            <DangerButton className="px-2.5! py-1.5! text-xs" onClick={() => setDeleteConfirmId(s.id)}>حذف</DangerButton>
                          )}
                        </span>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* step viewer modal */}
      <Modal open={!!viewer} onClose={() => setViewer(null)} title={viewer?.title ?? ''} wide>
        {viewer && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-[#E4DCC8] bg-white p-4">
              <div className="mb-2 flex items-center justify-between text-xs font-bold text-[#4A5A44]">
                <span>پیشرفت تو</span>
                <span className="tabular-nums">{toFaDigits(progress)}٪</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-[#EFEAD8]">
                <div
                  className="h-full rounded-full bg-gradient-to-l from-[#5F8F55] via-[#93C572] to-[#DAA520] transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] leading-5 text-[#8A9884]">
                این چک‌لیست برای اطمینان توست — هر مرحله را که انجام دادی تیک بزن؛ لازم نیست عجله کنی.
              </p>
            </div>

            {allDone && (
              <div className="rounded-2xl border-2 border-[#EAD9A8] bg-gradient-to-l from-[#FBF3DC] to-[#FDF8EA] p-4 text-center">
                <div className="text-lg font-black text-[#8A6508]">🎉 آفرین! همه مراحل انجام شد</div>
                <p className="mt-1 text-xs leading-6 text-[#8A6508]">
                  اگر مشکلی پیش آمد، از دکمه توقف در تسک‌ها استفاده کن یا به سرپرست بگو — هیچ‌وقت تنها نیستی 💚
                </p>
                <GhostButton className="mt-3" onClick={resetSteps}>مرور دوباره از اول</GhostButton>
              </div>
            )}

            <div className="max-h-[45vh] space-y-2.5 overflow-y-auto pl-1 pz-scroll">
              {viewer.steps.map((step, i) => {
                const done = doneSet.has(i)
                return (
                  <div
                    key={i}
                    className={cn(
                      'flex items-start gap-3 rounded-2xl border p-3 transition-all',
                      done ? 'border-[#C8D8C0] bg-[#F3F7EF]' : 'border-[#E4DCC8] bg-white'
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black shadow-sm',
                        done
                          ? 'bg-gradient-to-b from-[#DAA520] to-[#B8860B] text-[#3A2E05]'
                          : 'bg-gradient-to-b from-[#4A7A52] to-[#3A6242] text-white'
                      )}
                    >
                      {done ? '✓' : toFaDigits(i + 1)}
                    </div>
                    <div className="min-w-0 flex-1 pt-1.5 text-sm font-medium leading-6 text-[#33402F]">{step}</div>
                    <button
                      type="button"
                      aria-pressed={done}
                      onClick={() => toggleStep(i)}
                      className={cn(
                        'flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-all active:scale-[0.98]',
                        done
                          ? 'border-[#EAD9A8] bg-[#FBF3DC] text-[#8A6508]'
                          : 'border-[#D8D2BC] bg-white text-[#4A5A44] hover:border-[#5F8F55] hover:bg-[#F3F7EF]'
                      )}
                    >
                      {done ? 'انجام شد ✓' : 'انجام دادم'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </Modal>

      {/* manager create/edit modal */}
      <Modal open={editorOpen} onClose={() => setEditorOpen(false)} title={editing ? 'ویرایش دستورالعمل' : 'دستورالعمل جدید'} wide>
        <form onSubmit={submitSop} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="عنوان" required>
              <input className={inputCls} value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="مثلاً: پذیرش بار روزانه" />
            </Field>
            <Field label="دپارتمان">
              <select className={inputCls} value={fDept} onChange={(e) => setFDept(e.target.value)}>
                {DEPT_KEYS.map((k) => <option key={k} value={k}>{DEPT_META[k].label}</option>)}
              </select>
            </Field>
          </div>
          <div>
            <span className="mb-1 block text-xs font-semibold text-[#4A5A44]">مراحل <span className="text-rose-500">*</span></span>
            <div className="space-y-2">
              {fSteps.map((s, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="pt-3 text-xs font-bold text-[#8A9884]">{toFaDigits(i + 1)}.</span>
                  <textarea
                    className={cn(inputCls, 'min-h-[56px] resize-y')}
                    value={s}
                    onChange={(e) => setFSteps((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                    placeholder={`مرحله ${toFaDigits(i + 1)} را مثل اینکه به یک همکار جدید می‌گویی بنویس…`}
                  />
                  <button
                    type="button"
                    aria-label={`حذف مرحله ${toFaDigits(i + 1)}`}
                    onClick={() => setFSteps((prev) => prev.filter((_, j) => j !== i))}
                    className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 transition hover:bg-rose-100"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <GhostButton type="button" className="mt-2" onClick={() => setFSteps((prev) => [...prev, ''])}>
              + افزودن مرحله
            </GhostButton>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <GhostButton type="button" onClick={() => setEditorOpen(false)}>انصراف</GhostButton>
            <PrimaryButton type="submit" disabled={saving}>{editing ? 'ذخیره تغییرات' : 'ساخت دستورالعمل'}</PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  )
}
