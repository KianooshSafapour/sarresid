'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { faNum } from '@/lib/jalali'
import {
  SectionCard, Pill, EmptyState, Labeled, SearchInput, stockStatus, CATEGORY_EMOJI,
} from '@/components/app/ui-bits'
import type { AppCtx } from '@/components/app/ui-bits'
import { Modal } from '@/components/views/Orders'
import { cn } from '@/lib/utils'
import { ArrowRight, LayoutGrid, Plus, Save, Send, Trash2, Truck } from 'lucide-react'

type PmProduct = { id: string; name: string; stock: number; reorderLevel: number; imageUrl: string; category: string; sales30?: number }
type CellVal = string | null
type Planogram = {
  id: string; name: string; section: string; rows: number; cols: number
  layout: CellVal[][]; status: string; cells: number
}

const PL_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'پیش‌نویس', color: '#6b7280' },
  PUBLISHED: { label: 'منتشرشده', color: '#0e7a4a' },
  ARCHIVE: { label: 'آرشیو', color: '#8a5a2b' },
}
const MANAGERS = ['GM', 'PM', 'OM']

/** normalize layout matrix to exact rows×cols (API may return ragged/empty) */
function normalize(layout: CellVal[][] | undefined, rows: number, cols: number): CellVal[][] {
  const out: CellVal[][] = []
  for (let r = 0; r < rows; r++) {
    const row: CellVal[] = []
    for (let c = 0; c < cols; c++) row.push(layout?.[r]?.[c] ?? null)
    out.push(row)
  }
  return out
}

export default function PlanogramView({ ctx }: { ctx: AppCtx }) {
  const isManager = MANAGERS.includes(ctx.user!.role)

  const [plans, setPlans] = useState<Planogram[]>([])
  const [pmap, setPmap] = useState<Record<string, PmProduct>>({})
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<CellVal[][]>([])
  const [busy, setBusy] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [pickerCell, setPickerCell] = useState<{ r: number; c: number } | null>(null)
  const [clearCell, setClearCell] = useState<{ r: number; c: number } | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [skId, setSkId] = useState<string | null>(null)

  const editing = plans.find((p) => p.id === editingId) || null

  const load = async () => {
    try {
      const d = await api<{ planograms: Planogram[]; productMap: Record<string, PmProduct> }>('/api/planograms')
      setPlans(d.planograms)
      setPmap(d.productMap)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  // enter editor → fresh draft copy
  useEffect(() => {
    if (editing) setDraft(normalize(editing.layout, editing.rows, editing.cols))
  }, [editingId])

  const dirty = useMemo(
    () => !!editing && JSON.stringify(normalize(editing.layout, editing.rows, editing.cols)) !== JSON.stringify(draft),
    [editing, draft]
  )

  /** red / yellow / green product counts for the open planogram */
  const tally = useMemo(() => {
    const t: Record<'red' | 'yellow' | 'green', number> = { red: 0, yellow: 0, green: 0 }
    for (const row of draft) {
      for (const id of row) {
        if (!id) continue
        const p = pmap[id]
        if (!p) continue
        t[stockStatus(p.stock, p.reorderLevel).key]++
      }
    }
    return t
  }, [draft, pmap])

  const saveLayout = async () => {
    if (!editing || busy) return
    setBusy(true)
    try {
      await api(`/api/planograms/${editing.id}`, { method: 'PATCH', body: { layout: draft } })
      toast.success('چیدمان ذخیره شد ✅')
      await load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const publish = async () => {
    if (!editing || busy) return
    setBusy(true)
    try {
      await api(`/api/planograms/${editing.id}`, { method: 'PATCH', body: { status: 'PUBLISHED' } })
      toast.success('پلانوگرام برای چیدمان‌دارها منتشر شد 📣')
      await load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const removePlan = async () => {
    if (!editing || busy) return
    setBusy(true)
    try {
      await api(`/api/planograms/${editing.id}`, { method: 'DELETE' })
      toast.success('پلانوگرام حذف شد 🗑️')
      setConfirmDel(false)
      setEditingId(null)
      await load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  /** merchandiser → storekeeper refill request */
  const requestRefill = async (product: PmProduct, planName: string) => {
    let sk = skId
    if (!sk) {
      try {
        const d = await api<{ users: { id: string; role: string; active: boolean }[] }>('/api/users')
        sk = d.users.find((u) => u.role === 'SK' && u.active)?.id || null
        if (sk) setSkId(sk)
      } catch (e: any) {
        toast.error(e.message)
        return
      }
    }
    if (!sk) {
      toast.error('کاربر «سرپرست انبار» در سامانه یافت نشد')
      return
    }
    try {
      await api('/api/tasks', {
        method: 'POST',
        body: {
          title: `تأمین ${product.name} برای قفسه ${planName}`,
          assignedToId: sk,
          type: 'TASK',
          priority: 'HIGH',
          description: 'درخواست از پلانوگرام',
        },
      })
      toast.success('درخواست برای انبار ارسال شد 📦')
      ctx.refreshNotifications()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const setCell = (r: number, c: number, v: CellVal) =>
    setDraft((d) => d.map((row, ri) => (ri === r ? row.map((x, ci) => (ci === c ? v : x)) : row)))

  if (loading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">در حال بارگذاری پلانوگرام‌ها…</div>
  }

  /* ─────────────────────────── EDITOR ─────────────────────────── */
  if (editing) {
    const st = PL_STATUS[editing.status] || PL_STATUS.DRAFT
    const clearProduct = clearCell ? pmap[draft[clearCell.r]?.[clearCell.c] || ''] : undefined
    return (
      <div className="space-y-4">
        {/* editor header */}
        <div className="glow-card fade-in-up flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card p-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setEditingId(null)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-white/80 text-foreground/70 hover:border-primary/50"
              title="بازگشت به فهرست"
            >
              <ArrowRight size={16} />
            </button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-black text-foreground sm:text-lg">{editing.name}</h1>
                <Pill label={st.label} color={st.color} />
                {dirty && <Pill label="تغییرات ذخیره‌نشده" color="#a16207" />}
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {editing.section && <>قسمت: {editing.section} • </>}
                {faNum(editing.rows)} ردیف × {faNum(editing.cols)} ستون • {faNum(editing.cells)} کالا
              </p>
            </div>
          </div>
          {isManager && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={saveLayout}
                disabled={!dirty || busy}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-40"
              >
                <Save size={14} /> ذخیره چیدمان
              </button>
              {editing.status !== 'PUBLISHED' && (
                <button
                  onClick={publish}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-xl bg-[#77934a] px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-40"
                >
                  <Send size={14} /> انتشار برای چیدمان‌دارها
                </button>
              )}
              <button
                onClick={() => setConfirmDel(true)}
                disabled={busy}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#b3372f]/10 text-[#b3372f] hover:bg-[#b3372f]/20"
                title="حذف پلانوگرام"
              >
                <Trash2 size={15} />
              </button>
            </div>
          )}
        </div>

        {/* grid */}
        <SectionCard
          title="شبکهٔ قفسه"
          subtitle={
            isManager
              ? 'خانهٔ خالی = انتخاب کالا • خانهٔ پر = خالی‌کردن خانه — بعد از تغییرات «ذخیره چیدمان» را بزنید'
              : 'زیر هر کالا دکمهٔ «درخواست از انبار» هست تا جابه‌جایی کالا را از سرپرست انبار بخواهید'
          }
          icon={<LayoutGrid size={18} />}
        >
          {/* summary strip */}
          <div className="mb-4 flex flex-wrap items-center gap-2 text-[11px] font-bold">
            <span className="rounded-full bg-[#b3372f]/10 px-3 py-1.5 text-[#b3372f]">
              ● کمبود جدی: {faNum(tally.red)}
            </span>
            <span className="rounded-full bg-[#b8860b]/10 px-3 py-1.5 text-[#8a6d10]">
              ● رو به اتمام: {faNum(tally.yellow)}
            </span>
            <span className="rounded-full bg-[#0e7a4a]/10 px-3 py-1.5 text-[#0e7a4a]">
              ● موجودی مناسب: {faNum(tally.green)}
            </span>
            <span className="rounded-full bg-[#c96f4a]/10 px-3 py-1.5 text-[#c96f4a]" title="کالاهای قفسه با ۸ فروش یا بیشتر در ۳۰ روز اخیر">
              🔥 پرفروش: {faNum(draft.flat().filter((id) => id && pmap[id] && (pmap[id].sales30 || 0) >= 8).length)}
            </span>
            <span className="mr-auto text-[9px] font-bold text-muted-foreground">نوار رنگی زیر هر کالا = وضعیت موجودی • حلقه نارنجی = پرفروش</span>
          </div>

          <div className="scroll-gold overflow-x-auto pb-2">
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${editing.cols}, minmax(0, 1fr))`, minWidth: Math.max(300, editing.cols * 66) }}
            >
              {draft.map((row, ri) =>
                row.map((id, ci) => {
                  const p = id ? pmap[id] : undefined
                  const ss = p ? stockStatus(p.stock, p.reorderLevel) : null
                  return (
                    <div
                      key={`${ri}-${ci}`}
                      title={p ? `${p.name} — موجودی ${faNum(p.stock)} (${ss?.label})${(p.sales30 || 0) >= 3 ? ` • فروش ماه: ${faNum(p.sales30 || 0)}` : ''}` : 'خانهٔ خالی'}
                      onClick={() => { if (isManager && p) setClearCell({ r: ri, c: ci }) }}
                      className={cn(
                        'relative flex min-h-[78px] flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border p-1.5 text-center transition',
                        p
                          ? 'border-border bg-white/85 shadow-sm'
                          : 'border-dashed border-border/70 bg-muted/20',
                        isManager && p && 'cursor-pointer hover:border-primary/60 hover:shadow-md',
                        p && (p.sales30 || 0) >= 8 && 'ring-1 ring-[#c96f4a]/50'
                      )}
                    >
                      {p ? (
                        <>
                          {(p.sales30 || 0) >= 8 && (
                            <span className="fire-pulse absolute right-1 top-1 rounded-full bg-[#c96f4a] px-1.5 py-0.5 text-[8px] font-black text-white shadow-sm" title="پرفروش — ۸ عدد یا بیشتر در ماه">🔥</span>
                          )}
                          <span className="text-xl leading-none">{CATEGORY_EMOJI[p.category] || '📦'}</span>
                          <span className="w-full truncate text-[9px] font-bold text-foreground/90">{p.name}</span>
                          <span className="text-[8px] font-bold" style={{ color: ss?.color }}>
                            {faNum(p.stock)} عدد
                          </span>
                          {(p.sales30 || 0) >= 3 && (
                            <span className={cn('rounded-full px-1.5 text-[8px] font-black', (p.sales30 || 0) >= 8 ? 'bg-[#c96f4a]/15 text-[#c96f4a]' : 'bg-[#c9a227]/15 text-[#8a6d10]')}>
                              فروش {faNum(p.sales30 || 0)}
                            </span>
                          )}
                          {!isManager && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); requestRefill(p, editing.name) }}
                              className="mt-0.5 flex items-center gap-1 rounded-lg bg-[#77934a]/15 px-1.5 py-1 text-[9px] font-black text-[#5c7236] hover:bg-[#77934a]/30"
                            >
                              <Truck size={11} /> درخواست از انبار
                            </button>
                          )}
                          <span className="absolute bottom-0 right-0 h-1.5 w-full" style={{ background: ss?.color || '#6b7280' }} />
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={!isManager}
                          onClick={() => isManager && setPickerCell({ r: ri, c: ci })}
                          className={cn(
                            'flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg text-muted-foreground/60',
                            isManager ? 'hover:text-primary' : 'cursor-default'
                          )}
                        >
                          <Plus size={14} />
                          <span className="text-[9px] font-bold">خالی</span>
                        </button>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </SectionCard>

        {/* clear cell modal (managers) */}
        {clearCell && (
          <Modal title="خانهٔ قفسه" onClose={() => setClearCell(null)}>
            {clearProduct ? (
              <>
                <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
                  <span className="text-2xl">{CATEGORY_EMOJI[clearProduct.category] || '📦'}</span>
                  <div>
                    <p className="text-sm font-black">{clearProduct.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      موجودی {faNum(clearProduct.stock)} — {stockStatus(clearProduct.stock, clearProduct.reorderLevel).label}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setCell(clearCell.r, clearCell.c, null); setClearCell(null) }}
                  className="w-full rounded-xl bg-[#b3372f] py-2.5 text-xs font-extrabold text-white"
                >
                  خالی‌کردن خانه
                </button>
                <p className="text-center text-[11px] text-muted-foreground">تغییر پس از «ذخیره چیدمان» ثبت می‌شود</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">این خانه خالی است.</p>
            )}
          </Modal>
        )}

        {/* product picker modal (managers) */}
        {pickerCell && (
          <ProductPicker
            pmap={pmap}
            onPick={(pid) => { setCell(pickerCell.r, pickerCell.c, pid); setPickerCell(null) }}
            onClose={() => setPickerCell(null)}
          />
        )}

        {/* delete confirm */}
        {confirmDel && (
          <Modal title="حذف پلانوگرام" onClose={() => setConfirmDel(false)}>
            <p className="text-sm text-foreground/80">
              «{editing.name}» و کل چیدمان آن برای همیشه حذف می‌شود. مطمئن هستید؟
            </p>
            <div className="flex gap-2">
              <button
                onClick={removePlan}
                disabled={busy}
                className="flex-1 rounded-xl bg-[#b3372f] py-2.5 text-xs font-extrabold text-white disabled:opacity-50"
              >
                حذف قطعی
              </button>
              <button onClick={() => setConfirmDel(false)} className="flex-1 rounded-xl border py-2.5 text-xs font-bold">
                انصراف
              </button>
            </div>
          </Modal>
        )}
      </div>
    )
  }

  /* ─────────────────────────── LIST ─────────────────────────── */
  return (
    <div className="space-y-4">
      <SectionCard
        title="پلانوگرام قفسه‌ها"
        subtitle={
          isManager
            ? 'طراحی چیدمان قفسه‌ها، انتشار برای چیدمان‌دارها و پایش موجودی هر خانه'
            : 'چیدمان قفسه‌ها را ببینید و برای تأمین هر کالا از انبار درخواست بفرستید'
        }
        icon={<LayoutGrid size={18} />}
        actions={
          isManager && (
            <button
              onClick={() => setNewOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-white"
            >
              <Plus size={14} /> پلانوگرام جدید
            </button>
          )
        }
      >
        {plans.length === 0 ? (
          <EmptyState
            emoji="🧱"
            title="پلانوگرامی ثبت نشده"
            hint={isManager ? 'با دکمهٔ «پلانوگرام جدید» اولین چیدمان قفسه را بسازید' : 'هنوز مدیریتی پلانوگرامی منتشر نکرده است'}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {plans.map((pl) => {
              const st = PL_STATUS[pl.status] || PL_STATUS.DRAFT
              return (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => setEditingId(pl.id)}
                  className="glow-card rounded-2xl bg-card p-4 text-right transition-all hover:-translate-y-0.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-black text-foreground">{pl.name}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {pl.section ? `قسمت: ${pl.section} • ` : ''}
                        {faNum(pl.rows)}×{faNum(pl.cols)} • {faNum(pl.cells)} کالا
                      </p>
                    </div>
                    <Pill label={st.label} color={st.color} />
                  </div>
                  {/* mini preview */}
                  <div className="mt-3 grid gap-0.5" style={{ gridTemplateColumns: `repeat(${pl.cols}, 1fr)`, maxWidth: 150 }}>
                    {normalize(pl.layout, pl.rows, pl.cols).flat().map((id, i) => {
                      const p = id ? pmap[id] : undefined
                      return (
                        <span
                          key={i}
                          className="h-1.5 rounded-sm"
                          style={{ background: p ? stockStatus(p.stock, p.reorderLevel).color : '#e7e1cf' }}
                        />
                      )
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold">
                    <span className="rounded-full bg-[#b3372f]/10 px-2 py-0.5 text-[#b3372f]">
                      قرمز {faNum(
                        normalize(pl.layout, pl.rows, pl.cols).flat().filter((id) => id && pmap[id] && stockStatus(pmap[id].stock, pmap[id].reorderLevel).key === 'red').length
                      )}
                    </span>
                    <span className="rounded-full bg-[#0e7a4a]/10 px-2 py-0.5 text-[#0e7a4a]">
                      سبز {faNum(
                        normalize(pl.layout, pl.rows, pl.cols).flat().filter((id) => id && pmap[id] && stockStatus(pmap[id].stock, pmap[id].reorderLevel).key === 'green').length
                      )}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </SectionCard>

      {newOpen && (
        <NewPlanogramModal
          onClose={() => setNewOpen(false)}
          onCreated={async (id) => { setNewOpen(false); await load(); setEditingId(id) }}
        />
      )}
    </div>
  )
}

/* ─────────────────────────── new planogram modal ─────────────────────────── */
function NewPlanogramModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [form, setForm] = useState({ name: '', section: '', rows: '4', cols: '6' })
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name.trim()) return toast.error('نام پلانوگرام الزامی است')
    const rows = Math.min(8, Math.max(1, Number(form.rows) || 4))
    const cols = Math.min(12, Math.max(2, Number(form.cols) || 6))
    setBusy(true)
    try {
      const res = await api<{ planogram: Planogram }>('/api/planograms', {
        method: 'POST',
        body: { name: form.name.trim(), section: form.section.trim(), rows, cols },
      })
      toast.success('پلانوگرام ساخته شد — حالا خانه‌ها را پر کنید 🧱')
      onCreated(res.planogram.id)
    } catch (e: any) {
      toast.error(e.message)
      setBusy(false)
    }
  }

  return (
    <Modal title="پلانوگرام جدید" onClose={onClose}>
      <Labeled label="نام پلانوگرام *">
        <input
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="مثلاً: قفسه لبنیات — ردیف شرقی"
          className="w-full rounded-xl border border-input bg-white/90 p-3 text-sm"
        />
      </Labeled>
      <Labeled label="قسمت فروشگاه">
        <input
          value={form.section}
          onChange={(e) => set('section', e.target.value)}
          placeholder="مثلاً: لبنیات"
          className="w-full rounded-xl border border-input bg-white/90 p-3 text-sm"
        />
      </Labeled>
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="تعداد ردیف (۱ تا ۸)">
          <input
            type="number" dir="ltr" min={1} max={8}
            value={form.rows}
            onChange={(e) => set('rows', e.target.value)}
            className="w-full rounded-xl border border-input bg-white/90 p-3 text-center text-sm font-black"
          />
        </Labeled>
        <Labeled label="تعداد ستون (۲ تا ۱۲)">
          <input
            type="number" dir="ltr" min={2} max={12}
            value={form.cols}
            onChange={(e) => set('cols', e.target.value)}
            className="w-full rounded-xl border border-input bg-white/90 p-3 text-center text-sm font-black"
          />
        </Labeled>
      </div>
      <button onClick={save} disabled={busy} className="w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white disabled:opacity-50">
        {busy ? '…' : 'ساخت پلانوگرام 🧱'}
      </button>
    </Modal>
  )
}

/* ─────────────────────────── product picker (lazy list) ─────────────────────────── */
function ProductPicker({
  pmap, onPick, onClose,
}: { pmap: Record<string, PmProduct>; onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [visible, setVisible] = useState(24)

  const all = useMemo(() => {
    const list = Object.values(pmap)
    if (!q.trim()) return list
    const needle = q.trim()
    return list.filter((p) => p.name.includes(needle) || p.category.includes(needle))
  }, [pmap, q])

  const shown = all.slice(0, visible)

  return (
    <Modal title="انتخاب کالا برای خانهٔ قفسه" onClose={onClose}>
      <SearchInput value={q} onChange={(v) => { setQ(v); setVisible(24) }} placeholder="جستجوی نام کالا یا دسته…" />
      <div className="scroll-gold max-h-[46vh] space-y-1.5 overflow-y-auto pl-1">
        {shown.length === 0 && <EmptyState emoji="🔍" title="کالایی پیدا نشد" hint="عبارت دیگری را امتحان کنید" />}
        {shown.map((p) => {
          const ss = stockStatus(p.stock, p.reorderLevel)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p.id)}
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-white/80 p-2.5 text-right transition hover:border-primary/60"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="text-lg">{CATEGORY_EMOJI[p.category] || '📦'}</span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold text-foreground">{p.name}</span>
                  <span className="block text-[10px] text-muted-foreground">{p.category}</span>
                </span>
              </span>
              <span className="shrink-0 text-left">
                <span className="block text-[10px] font-bold" style={{ color: ss.color }}>{ss.label}</span>
                <span className="block text-[10px] text-muted-foreground">{faNum(p.stock)} عدد</span>
              </span>
            </button>
          )
        })}
      </div>
      {visible < all.length && (
        <button
          onClick={() => setVisible((v) => v + 24)}
          className="w-full rounded-xl border py-2.5 text-xs font-extrabold text-foreground/70 hover:border-primary/50"
        >
          نمایش بیشتر ({faNum(all.length - visible)} کالای دیگر)
        </button>
      )}
    </Modal>
  )
}
