'use client'
import * as React from 'react'
import { toast } from 'sonner'
import {
  LayoutGrid, Eye, Pencil, Archive, Plus, Minus, X, Search, Send, Trash2, ArrowRight, Layers, Printer,
} from 'lucide-react'
import { api } from '@/lib/api'
import { fmtJalali, fmtJalaliTime, toFaDigits } from '@/lib/jalali'
import { hasRole, type PUser, type ProductT } from '@/lib/types'
import {
  Card, SectionHeader, Badge, stockDot, Field, inputCls, PrimaryButton, GoldButton, GhostButton,
  DangerButton, EmptyState, Loading, Modal, Avatar, ProductImage, Spinner,
} from './kit'

/* ---------- local types ---------- */
type Slot = { productId: number; facing: number }
type Shelf = { label: string; slots: Slot[] }
type LayoutT = { shelves: Shelf[] }
type PlanogramT = {
  id: number
  name: string
  layout: LayoutT
  status: string // DRAFT | PUBLISHED | ARCHIVED
  assignedToId: number | null
  createdById: number
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  assignedTo?: { id: number; name: string; color: string } | null
}
type UserRow = { id: number; name: string; roles: string; color: string; active: boolean }

const PG_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'پیش‌نویس', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  PUBLISHED: { label: 'منتشر شده', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  ARCHIVED: { label: 'آرشیو', cls: 'border-stone-200 bg-stone-100 text-stone-600' },
}

function normalizeLayout(raw: unknown): LayoutT {
  let obj: unknown = raw
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw) } catch { obj = null }
  }
  const shelvesRaw = Array.isArray((obj as { shelves?: unknown } | null)?.shelves)
    ? (obj as { shelves: unknown[] }).shelves
    : []
  return {
    shelves: shelvesRaw.map((s) => {
      const sh = (s ?? {}) as { label?: unknown; slots?: unknown }
      const slotsRaw = Array.isArray(sh.slots) ? sh.slots : []
      return {
        label: typeof sh.label === 'string' ? sh.label : '',
        slots: slotsRaw
          .map((x) => {
            const sl = (x ?? {}) as { productId?: unknown; facing?: unknown }
            const pid = Number(sl.productId)
            if (!Number.isFinite(pid) || pid <= 0) return null
            return { productId: pid, facing: Math.max(1, Math.floor(Number(sl.facing) || 1)) }
          })
          .filter((x): x is Slot => x !== null),
      }
    }),
  }
}

/** border color of a slot card, from product stock (same logic as stockDot) */
function slotBorder(stock: number | undefined, minStock: number | undefined): string {
  const min = minStock ?? 0
  const ratio = min > 0 ? (stock ?? 0) / min : (stock ?? 0) > 0 ? 99 : 0
  if ((stock ?? 0) <= 0 || ratio < 0.5) return 'border-red-400'
  if (ratio < 1) return 'border-amber-400'
  return 'border-emerald-400'
}

export default function PlanogramSection({ user }: { user: PUser }) {
  const designer =
    hasRole(user, 'GENERAL_MANAGER') || hasRole(user, 'PRODUCT_MANAGER') ||
    hasRole(user, 'OPERATION_MANAGER') || hasRole(user, 'IT_ADMIN')
  const isMerch = hasRole(user, 'MERCHANDISER')

  const [planograms, setPlanograms] = React.useState<PlanogramT[]>([])
  const [products, setProducts] = React.useState<ProductT[]>([])
  const [loading, setLoading] = React.useState(true)
  const [viewing, setViewing] = React.useState<PlanogramT | null>(null)
  const [printOpen, setPrintOpen] = React.useState(false)

  const pmap = React.useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [pg, pr] = await Promise.all([
        api.get<{ planograms: PlanogramT[] }>('/api/planograms'),
        api.get<{ products: ProductT[] }>('/api/products?limit=500'),
      ])
      setPlanograms((pg.planograms ?? []).map((p) => ({ ...p, layout: normalizeLayout(p.layout) })))
      setProducts(pr.products ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در دریافت پلانوگرام‌ها')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void load() }, [load])

  /* merchandiser sees published first */
  const statusRank = (s: string) => (s === 'PUBLISHED' ? 0 : s === 'DRAFT' ? 1 : 2)
  const sorted = React.useMemo(() => {
    const arr = [...planograms]
    if (isMerch) {
      arr.sort((a, b) => statusRank(a.status) - statusRank(b.status) ||
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    }
    return arr
  }, [planograms, isMerch])

  /* ---------- designer modal ---------- */
  const [designerOpen, setDesignerOpen] = React.useState(false)
  const [editingP, setEditingP] = React.useState<PlanogramT | null>(null)
  const [dName, setDName] = React.useState('')
  const [dShelves, setDShelves] = React.useState<Shelf[]>([])
  const [slotQ, setSlotQ] = React.useState<Record<number, string>>({})
  const [assignId, setAssignId] = React.useState('')
  const [users, setUsers] = React.useState<UserRow[]>([])
  const [saving, setSaving] = React.useState(false)
  const [publishing, setPublishing] = React.useState(false)
  const [archiving, setArchiving] = React.useState(false)

  const merchandisers = React.useMemo(
    () => users.filter((u) => u.active && u.roles.split(',').map((s) => s.trim()).includes('MERCHANDISER')),
    [users]
  )

  const openDesigner = async (p: PlanogramT | null) => {
    setEditingP(p)
    setDName(p?.name ?? '')
    setDShelves(p ? p.layout.shelves.map((s) => ({ label: s.label, slots: s.slots.map((x) => ({ ...x })) })) : [])
    setSlotQ({})
    setAssignId(p?.assignedToId ? String(p.assignedToId) : '')
    setDesignerOpen(true)
    if (users.length === 0) {
      try {
        const res = await api.get<{ users: UserRow[] }>('/api/users')
        setUsers(res.users ?? [])
      } catch { /* select stays empty */ }
    }
  }

  const addShelf = () =>
    setDShelves((s) => [...s, { label: `قفسه ${toFaDigits(s.length + 1)}`, slots: [] }])

  const removeShelf = (i: number) => setDShelves((s) => s.filter((_, x) => x !== i))

  const setShelfLabel = (i: number, label: string) =>
    setDShelves((s) => s.map((sh, x) => (x === i ? { ...sh, label } : sh)))

  const addSlot = (i: number, productId: number) =>
    setDShelves((s) =>
      s.map((sh, x) => (x === i ? { ...sh, slots: [...sh.slots, { productId, facing: 5 }] } : sh))
    )

  const removeSlot = (i: number, j: number) =>
    setDShelves((s) => s.map((sh, x) => (x === i ? { ...sh, slots: sh.slots.filter((_, y) => y !== j) } : sh)))

  const stepFacing = (i: number, j: number, delta: number) =>
    setDShelves((s) =>
      s.map((sh, x) =>
        x === i
          ? { ...sh, slots: sh.slots.map((sl, y) => (y === j ? { ...sl, facing: Math.max(1, sl.facing + delta) } : sl)) }
          : sh
      )
    )

  const savePlanogram = async () => {
    if (!dName.trim()) { toast.error('نام پلانوگرام الزامی است'); return }
    setSaving(true)
    try {
      const layout: LayoutT = { shelves: dShelves }
      if (editingP?.id) {
        await api.patch('/api/planograms', { id: editingP.id, action: 'update', name: dName.trim(), layout, userId: user.id })
        toast.success('پلانوگرام ذخیره شد')
      } else {
        await api.post('/api/planograms', { name: dName.trim(), layout, createdById: user.id })
        toast.success('پلانوگرام جدید ساخته شد')
      }
      setDesignerOpen(false)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در ذخیره پلانوگرام')
    } finally {
      setSaving(false)
    }
  }

  const publishPlanogram = async () => {
    if (!editingP?.id) return
    setPublishing(true)
    try {
      await api.patch('/api/planograms', {
        id: editingP.id,
        action: 'publish',
        assignedToId: assignId ? Number(assignId) : null,
        userId: user.id,
      })
      toast.success('برای چیدمان‌دار ارسال شد')
      setDesignerOpen(false)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در انتشار')
    } finally {
      setPublishing(false)
    }
  }

  const archivePlanogram = async (p: PlanogramT) => {
    setArchiving(true)
    try {
      await api.patch('/api/planograms', { id: p.id, action: 'archive', userId: user.id })
      toast.info('پلانوگرام آرشیو شد')
      setDesignerOpen(false)
      setViewing((v) => (v?.id === p.id ? null : v))
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در آرشیو')
    } finally {
      setArchiving(false)
    }
  }

  /* ---------- render: single planogram view ---------- */
  if (viewing) {
    const st = PG_STATUS[viewing.status] ?? { label: viewing.status, cls: 'border-stone-200 bg-stone-100 text-stone-600' }
    return (
      <div>
        <SectionHeader
          title={viewing.name}
          subtitle={`نقشه چیدمان قفسه‌ها — آخرین بروزرسانی ${fmtJalali(viewing.updatedAt)}`}
          icon={<Layers className="h-5 w-5" />}
          actions={
            <div className="flex flex-wrap gap-2">
              {designer && viewing.status !== 'ARCHIVED' && (
                <GhostButton onClick={() => void openDesigner(viewing)} className="min-h-[44px]">
                  <Pencil className="h-4 w-4" /> ویرایش
                </GhostButton>
              )}
              <GhostButton
                onClick={() => { setPrintOpen(true); setTimeout(() => window.print(), 120) }}
                className="min-h-[44px]"
                title="چاپ برگه چیدمان قفسه"
              >
                <Printer className="h-4 w-4" /> چاپ | Print
              </GhostButton>
              <GhostButton onClick={() => { setPrintOpen(false); setViewing(null) }} className="min-h-[44px]">
                <ArrowRight className="h-4 w-4" /> همه پلانوگرام‌ها
              </GhostButton>
            </div>
          }
        />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge className={st.cls}>{st.label}</Badge>
          {viewing.assignedTo && (
            <span className="flex items-center gap-2 rounded-full border border-[#E4DCC8] bg-white px-2 py-0.5 text-xs font-medium text-[#4A5A44]">
              <Avatar name={viewing.assignedTo.name} color={viewing.assignedTo.color || '#3E6B4A'} size={22} />
              چیدمان‌دار: {viewing.assignedTo.name}
            </span>
          )}
        </div>

        {viewing.layout.shelves.length === 0 ? (
          <EmptyState icon={<Layers className="h-10 w-10" />} title="قفسه‌ای در این پلانوگرام تعریف نشده" hint={designer ? 'با دکمه ویرایش، قفسه و کالا اضافه کنید.' : undefined} />
        ) : (
          <div className="space-y-5">
            {viewing.layout.shelves.map((shelf, i) => (
              <div key={i}>
                <div
                  className="rounded-2xl border border-[#D9C9A8] p-4 shadow-inner print:shadow-none"
                  style={{ background: 'linear-gradient(180deg, #E8DCC0 0%, #D9C9A8 100%)' }}
                >
                  {shelf.slots.length === 0 ? (
                    <div className="py-6 text-center text-xs font-medium text-[#8A7A55]">قفسه خالی</div>
                  ) : (
                    <div className="flex gap-3 overflow-x-auto pz-scroll pb-1">
                      {shelf.slots.map((slot, j) => {
                        const p = pmap.get(slot.productId)
                        return (
                          <div
                            key={`${slot.productId}-${j}`}
                            className={`w-24 shrink-0 rounded-xl border-2 bg-white/95 p-2 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md print:shadow-none ${slotBorder(p?.stock, p?.minStock)}`}
                          >
                            <ProductImage src={p?.imageUrl} name={p?.name ?? 'کالا'} size={44} className="mx-auto" />
                            <div dir="auto" className="mt-1 truncate text-[11px] font-semibold text-[#33402F]" title={p?.name ?? ''}>
                              {p?.name ?? 'کالای حذف‌شده'}
                            </div>
                            <div className="mt-1 flex items-center justify-center gap-1.5">
                              <Badge className="border-[#EAD9A8] bg-[#FBF3DC] px-1.5 text-[10px] text-[#8A6508]">×{toFaDigits(slot.facing)}</Badge>
                              {p && (
                                <span className={`text-[10px] font-black tabular-nums ${stockDot(p.stock, p.minStock)}`}>
                                  {toFaDigits(Math.floor(p.stock))}
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div className="mt-2">
                  <Badge className="border-[#D9C9A8] bg-[#F5EFE0] text-[#6B5B2A]">{shelf.label || `قفسه ${toFaDigits(i + 1)}`}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ---------- Print sheet (visible only when printing) ---------- */}
        {printOpen && (
          <div className="pz-print-only" dir="rtl">
            <div style={{ fontFamily: 'inherit', padding: 24, color: '#111' }}>
              {/* brand header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #3E6B4A', paddingBottom: 10, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#8A6508' }}>هایپر زیتون</div>
                  <div style={{ fontSize: 11, color: '#555' }}>چیدمان قفسه | Planogram</div>
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{viewing.name}</div>
                  <div style={{ fontSize: 11, color: '#555' }}>{fmtJalali(new Date())}</div>
                </div>
              </div>

              {/* meta line */}
              <table style={{ width: '100%', fontSize: 12, marginBottom: 14 }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '3px 0' }}><b>وضعیت:</b> {st.label}</td>
                    <td style={{ padding: '3px 0' }}><b>چیدمان‌دار:</b> {viewing.assignedTo?.name ?? '—'}</td>
                    <td style={{ padding: '3px 0' }}><b>تعداد قفسه:</b> {toFaDigits(viewing.layout.shelves.length)}</td>
                  </tr>
                </tbody>
              </table>

              {/* one compact table per shelf */}
              {viewing.layout.shelves.map((shelf, i) => (
                <div key={i} style={{ marginBottom: 16, pageBreakInside: 'avoid' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#3E6B4A', marginBottom: 6 }}>
                    {shelf.label || `قفسه ${toFaDigits(i + 1)}`}
                  </div>
                  {shelf.slots.length === 0 ? (
                    <div style={{ fontSize: 11, color: '#777', padding: '4px 0' }}>قفسه خالی</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ background: '#EAF0E2' }}>
                          <th style={{ border: '1px solid #999', padding: 5, width: 42 }}>ردیف</th>
                          <th style={{ border: '1px solid #999', padding: 5, textAlign: 'right' }}>کالا</th>
                          <th style={{ border: '1px solid #999', padding: 5, width: 120 }}>بارکد</th>
                          <th style={{ border: '1px solid #999', padding: 5, width: 60 }}>فیصینگ</th>
                          <th style={{ border: '1px solid #999', padding: 5, width: 60 }}>موجودی</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shelf.slots.map((slot, j) => {
                          const p = pmap.get(slot.productId)
                          return (
                            <tr key={`${slot.productId}-${j}`}>
                              <td style={{ border: '1px solid #999', padding: 5, textAlign: 'center' }}>{toFaDigits(j + 1)}</td>
                              <td style={{ border: '1px solid #999', padding: 5 }}>
                                {p?.name ?? '—'}{p?.nameFa ? ` — ${p.nameFa}` : ''}
                              </td>
                              <td style={{ border: '1px solid #999', padding: 5, direction: 'ltr', textAlign: 'center', fontFamily: 'ui-monospace, monospace' }}>
                                {p?.barcode ?? '—'}
                              </td>
                              <td style={{ border: '1px solid #999', padding: 5, textAlign: 'center' }}>{toFaDigits(slot.facing)}</td>
                              <td style={{ border: '1px solid #999', padding: 5, textAlign: 'center' }}>{p ? toFaDigits(Math.floor(p.stock)) : '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}

              {/* signature footer */}
              <div style={{ marginTop: 28, display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span>امضا | Signature: ....................</span>
                <span>چاپ شده: {fmtJalaliTime(new Date())}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ---------- render: list ---------- */
  return (
    <div>
      <SectionHeader
        title="پلانوگرام | Planogram"
        subtitle="نقشه چیدمان قفسه‌ها؛ چیدمان‌دار پلانوگرام منتشرشده را می‌بیند"
        icon={<LayoutGrid className="h-5 w-5" />}
        actions={
          designer ? (
            <PrimaryButton onClick={() => void openDesigner(null)} className="min-h-[44px]">
              <Plus className="h-4 w-4" /> پلانوگرام جدید
            </PrimaryButton>
          ) : undefined
        }
      />

      {loading ? (
        <Loading label="در حال دریافت پلانوگرام‌ها…" />
      ) : sorted.length === 0 ? (
        <EmptyState icon={<LayoutGrid className="h-10 w-10" />} title="پلانوگرامی ثبت نشده" hint={designer ? 'اولین نقشه چیدمان را بسازید.' : 'هنوز مدیریتی پلانوگرامی نساخته است.'} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((p) => {
            const st = PG_STATUS[p.status] ?? { label: p.status, cls: 'border-stone-200 bg-stone-100 text-stone-600' }
            const shelfCount = p.layout.shelves.length
            const slotCount = p.layout.shelves.reduce((n, s) => n + s.slots.length, 0)
            const facingCount = p.layout.shelves.reduce((n, s) => n + s.slots.reduce((m, sl) => m + sl.facing, 0), 0)
            return (
              <Card key={p.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div dir="auto" className="truncate text-base font-bold text-[#253A2A]" title={p.name}>{p.name}</div>
                    <div className="mt-1 text-xs text-[#8A9884]">بروزرسانی {fmtJalali(p.updatedAt)}</div>
                  </div>
                  <Badge className={st.cls}>{st.label}</Badge>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#4A5A44]">
                  <Badge className="border-[#E4DCC8] bg-white text-[#4A5A44]">{toFaDigits(shelfCount)} قفسه</Badge>
                  <Badge className="border-[#E4DCC8] bg-white text-[#4A5A44]">{toFaDigits(slotCount)} کالا</Badge>
                  <Badge className="border-[#EAD9A8] bg-[#FBF3DC] text-[#8A6508]">مجموع فیصینگ {toFaDigits(facingCount)}</Badge>
                  {p.assignedTo && (
                    <span className="flex items-center gap-1.5 rounded-full border border-[#E4DCC8] bg-white py-0.5 pl-2.5 pr-1">
                      <Avatar name={p.assignedTo.name} color={p.assignedTo.color || '#3E6B4A'} size={20} />
                      {p.assignedTo.name}
                    </span>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2 border-t border-[#EFEAD8] pt-3">
                  <GhostButton onClick={() => setViewing(p)} className="min-h-[44px] flex-1">
                    <Eye className="h-4 w-4" /> مشاهده
                  </GhostButton>
                  {designer && p.status !== 'ARCHIVED' && (
                    <>
                      <GhostButton onClick={() => void openDesigner(p)} className="min-h-[44px]" title="ویرایش">
                        <Pencil className="h-4 w-4" /> ویرایش
                      </GhostButton>
                      <DangerButton onClick={() => void archivePlanogram(p)} disabled={archiving} className="min-h-[44px]" title="آرشیو">
                        <Archive className="h-4 w-4" /> آرشیو
                      </DangerButton>
                    </>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* ---------- designer modal ---------- */}
      <Modal open={designerOpen} onClose={() => setDesignerOpen(false)} wide title={editingP ? `ویرایش پلانوگرام: ${editingP.name}` : 'پلانوگرام جدید'}>
        <div className="space-y-4">
          <Field label="نام پلانوگرام" required>
            <input value={dName} onChange={(e) => setDName(e.target.value)} className={inputCls} placeholder="مثلاً یخچال ۲ — لبنیات" />
          </Field>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-[#4A5A44]">قفسه‌ها و کالاها</span>
              <GhostButton onClick={addShelf} className="min-h-[36px]">
                <Plus className="h-4 w-4" /> افزودن قفسه
              </GhostButton>
            </div>

            {dShelves.length === 0 && (
              <div className="rounded-xl border border-dashed border-[#D8D2BC] bg-white/60 p-4 text-center text-xs text-[#8A9884]">
                هنوز قفسه‌ای ندارید — «افزودن قفسه» را بزنید.
              </div>
            )}

            <div className="space-y-3">
              {dShelves.map((shelf, i) => {
                const q = (slotQ[i] ?? '').trim().toLowerCase()
                const inShelf = new Set(shelf.slots.map((s) => s.productId))
                const options = products
                  .filter((p) => !inShelf.has(p.id))
                  .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.nameFa ?? '').includes(q) || (p.barcode ?? '').includes(q))
                  .slice(0, 12)
                return (
                  <div key={i} className="rounded-2xl border border-[#E4DCC8] bg-white p-3">
                    <div className="flex items-center gap-2">
                      <input
                        value={shelf.label}
                        onChange={(e) => setShelfLabel(i, e.target.value)}
                        className={`${inputCls} flex-1`}
                        placeholder={`قفسه ${toFaDigits(i + 1)}`}
                      />
                      <DangerButton onClick={() => removeShelf(i)} className="min-h-[44px] shrink-0" title="حذف قفسه">
                        <Trash2 className="h-4 w-4" />
                      </DangerButton>
                    </div>

                    {shelf.slots.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {shelf.slots.map((slot, j) => (
                          <span key={`${slot.productId}-${j}`} className="inline-flex items-center gap-0.5 rounded-full border border-[#E4DCC8] bg-[#FBF9F3] py-0.5 pl-1 pr-2 text-xs">
                            <span dir="auto" className="max-w-28 truncate font-medium text-[#33402F]" title={pmap.get(slot.productId)?.name ?? ''}>
                              {pmap.get(slot.productId)?.name ?? `#${slot.productId}`}
                            </span>
                            <button type="button" onClick={() => stepFacing(i, j, -1)} className="flex h-6 w-6 items-center justify-center rounded-full text-[#6B7A66] hover:bg-white" aria-label="کاهش فیسینگ"><Minus className="h-3 w-3" /></button>
                            <span className="w-6 text-center font-bold tabular-nums text-[#8A6508]">×{toFaDigits(slot.facing)}</span>
                            <button type="button" onClick={() => stepFacing(i, j, 1)} className="flex h-6 w-6 items-center justify-center rounded-full text-[#6B7A66] hover:bg-white" aria-label="افزایش فیسینگ"><Plus className="h-3 w-3" /></button>
                            <button type="button" onClick={() => removeSlot(i, j)} className="flex h-6 w-6 items-center justify-center rounded-full text-rose-500 hover:bg-white" aria-label="حذف کالا"><X className="h-3 w-3" /></button>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-2">
                      <div className="relative">
                        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A8A28C]" />
                        <input
                          value={slotQ[i] ?? ''}
                          onChange={(e) => setSlotQ((m) => ({ ...m, [i]: e.target.value }))}
                          className={`${inputCls} min-h-[40px] pr-9 text-xs`}
                          placeholder="افزودن کالا به این قفسه…"
                        />
                      </div>
                      {(slotQ[i] ?? '').trim() !== '' && (
                        <div className="mt-1.5 max-h-36 divide-y divide-[#EFEAD8] overflow-y-auto rounded-xl border border-[#E4DCC8] bg-white pz-scroll">
                          {options.length === 0 && <div className="p-2.5 text-xs text-[#8A9884]">کالایی پیدا نشد</div>}
                          {options.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => { addSlot(i, p.id); setSlotQ((m) => ({ ...m, [i]: '' })) }}
                              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-right text-xs transition hover:bg-[#F3F7EF]"
                            >
                              <span dir="auto" className="min-w-0 truncate font-medium text-[#33402F]">{p.name}</span>
                              <span className={`shrink-0 tabular-nums ${stockDot(p.stock, p.minStock)}`}>{toFaDigits(Math.floor(p.stock))}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-[#EFEAD8] pt-3">
            <GhostButton onClick={() => setDesignerOpen(false)} className="min-h-[44px]">انصراف</GhostButton>
            <PrimaryButton onClick={() => void savePlanogram()} disabled={saving} className="min-h-[44px]">
              {saving ? <Spinner /> : <Plus className="h-4 w-4" />} ذخیره پلانوگرام
            </PrimaryButton>
          </div>

          {/* publish flow — only for existing planograms */}
          {editingP && editingP.status !== 'ARCHIVED' && (
            <div className="rounded-2xl border border-[#EAD9A8] bg-[#FBF6E8] p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-[#8A6508]">
                <Send className="h-4 w-4" /> انتشار برای چیدمان‌دار
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Field label="واگذار به چیدمان‌دار">
                    <select value={assignId} onChange={(e) => setAssignId(e.target.value)} className={inputCls}>
                      <option value="">— بدون واگذاری —</option>
                      {merchandisers.map((u) => (
                        <option key={u.id} value={String(u.id)}>{u.name}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <GoldButton onClick={() => void publishPlanogram()} disabled={publishing} className="min-h-[44px]">
                  {publishing ? <Spinner /> : <Send className="h-4 w-4" />} انتشار
                </GoldButton>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
