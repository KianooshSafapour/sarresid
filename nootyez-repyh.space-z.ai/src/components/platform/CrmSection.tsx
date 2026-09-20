'use client'
import * as React from 'react'
import { api, uploadFile } from '@/lib/api'
import { hasRole } from '@/lib/types'
import type { PUser } from '@/lib/types'
import { toFaDigits, fmtJalali, fmtJalaliTime, fmtMoney, fmtMoneyShort, isoToJalali, JALALI_MONTHS } from '@/lib/jalali'
import {
  Avatar, Badge, Card, DangerButton, EmptyState, Field, GhostButton, GoldButton, Loading, Modal,
  Money, PrimaryButton, SectionHeader, StatCard, Tabs, Td, Th, TimeAgo, inputCls,
} from './kit'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import {
  ClipboardList, Users, Plus, Search, ChevronDown, ChevronUp, Minus, HeartHandshake,
  UserRound, Phone, Pencil, Info, Sparkles, PackageSearch,
  ShoppingBag, Banknote, CalendarRange, BarChart3, Gauge, Trash2,
  Upload, FileSpreadsheet,
} from 'lucide-react'

type PreOrderItem = { productId?: number | null; name: string; qty: number; sellPrice: number }
type PreOrder = {
  id: number
  customerId: number | null
  customerName: string | null
  salespersonId: number
  cashierId: number | null
  items: PreOrderItem[]
  status: string
  total: number
  note: string | null
  createdAt: string
  salesperson?: { id: number; name: string; color: string } | null
  cashier?: { id: number; name: string; color: string } | null
}
type Customer = {
  id: number
  name: string
  phone: string | null
  preference: string | null
  createdById: number
  createdAt: string
}
type ProductLite = {
  id: number
  name: string
  nameFa: string | null
  barcode: string | null
  sellPrice: number
  stock: number
  unit: string
}
type SaleT = {
  id: number
  productId: number | null
  name: string
  qty: number
  unitPrice: number
  total: number
  customerId: number | null
  customerName: string | null
  channel: string
  salespersonId: number
  cashierId: number | null
  preOrderId: number | null
  note: string | null
  createdAt: string
  salesperson?: { id: number; name: string; color: string } | null
  cashier?: { id: number; name: string; color: string } | null
}
type SalesSummary = {
  todayTotal: number
  todayCount: number
  weekTotal: number
  monthTotal: number
  count: number
  byDay: { day: string; total: number }[]
  bySalesperson: { userId: number; name: string; color: string; total: number; count: number; sphl: number }[]
  sphlOverall: number
  topProducts: { name: string; qty: number; total: number }[]
}
type StaffUser = { id: number; name: string; roles: string; color: string; active: boolean }

type ImportRowT = {
  name: string
  barcode?: string
  qty: number
  unitPrice: number
  total: number
  isoDate: string
  sellerName?: string
  sellerId?: number
  sellerMatched?: boolean
  productId?: number
  matchedName?: string
  status: 'ok' | 'duplicate' | 'invalid'
  reason?: string
}
type ImportParseResp = {
  rows: ImportRowT[]
  total: number
  ok: number
  duplicates: number
  invalid: number
  sellers: { id: number; name: string }[]
}
type ImportCommitResp = { created: number; skippedDuplicates: number; invalid: number }

const CHANNEL_BADGE: Record<string, string> = {
  WALKIN: 'border-[#C8D8C0] bg-[#F3F7EF] text-[#3E6B4A]',
  PREORDER: 'border-[#EAD9A8] bg-[#FBF3DC] text-[#8A6508]',
}
const SALES_TOOLTIP_STYLE: React.CSSProperties = {
  borderRadius: 12,
  border: '1px solid #E4DCC8',
  background: '#FFFDF7',
  fontSize: 12,
  direction: 'rtl',
}

const PO_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'در انتظار آماده‌سازی', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  PREPARED: { label: 'آماده تحویل', cls: 'bg-violet-50 text-violet-800 border-violet-200' },
  DONE: { label: 'تسویه شد', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  CANCELLED: { label: 'لغو شده', cls: 'bg-stone-100 text-stone-600 border-stone-200' },
}

export default function CrmSection({ user }: { user: PUser }) {
  const [tab, setTab] = React.useState('preorders')

  const isSalesperson = hasRole(user, 'SALESPERSON')
  const isCashier = hasRole(user, 'CASHIER')
  const canManage = isSalesperson || hasRole(user, 'GENERAL_MANAGER') || hasRole(user, 'OPERATION_MANAGER')

  return (
    <div>
      <SectionHeader
        title="CRM و مشتریان"
        subtitle="پیش‌صورتحساب‌ها و مشتریان وفادار"
        icon={<HeartHandshake size={20} />}
      />
      <Tabs
        tabs={[
          { key: 'preorders', label: 'پیش‌صورتحساب', icon: <ClipboardList size={15} /> },
          { key: 'customers', label: 'مشتریان وفادار', icon: <Users size={15} /> },
          { key: 'sales', label: 'فروش و SPHL', icon: <ShoppingBag size={15} /> },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'preorders' ? (
        <PreOrdersTab user={user} isSalesperson={isSalesperson} isCashier={isCashier} />
      ) : tab === 'customers' ? (
        <CustomersTab canManage={canManage} />
      ) : (
        <SalesTab user={user} />
      )}
    </div>
  )
}

/* ==================== PREORDERS ==================== */

function PreOrdersTab({ user, isSalesperson, isCashier }: { user: PUser; isSalesperson: boolean; isCashier: boolean }) {
  const [preorders, setPreorders] = React.useState<PreOrder[]>([])
  const [loading, setLoading] = React.useState(true)
  const [expanded, setExpanded] = React.useState<Set<number>>(new Set())
  const [newOpen, setNewOpen] = React.useState(false)

  const prevStatuses = React.useRef<Map<number, string> | null>(null)

  const load = React.useCallback(async () => {
    try {
      const r = await api.get<{ preorders: PreOrder[] }>('/api/preorders')
      // notify salesperson when their own preorder changes status
      if (prevStatuses.current) {
        for (const p of r.preorders) {
          const prev = prevStatuses.current.get(p.id)
          if (prev && prev !== p.status && p.salespersonId === user.id) {
            const who = p.customerName ?? 'مشتری'
            if (p.status === 'PREPARED') toast.success(`✅ سفارش ${who} آماده شد — کنار صندوق منتظر است`)
            else if (p.status === 'DONE') toast.success(`🎉 پیش‌صورتحساب ${who} تسویه شد (+۲ امتیاز)`)
            else if (p.status === 'CANCELLED') toast.info(`پیش‌صورتحساب ${who} لغو شد`)
          }
        }
      }
      prevStatuses.current = new Map(r.preorders.map((p) => [p.id, p.status]))
      setPreorders(r.preorders)
    } catch (e) {
      if (prevStatuses.current === null) toast.error(e instanceof Error ? e.message : 'خطا در دریافت پیش‌صورتحساب‌ها')
    } finally {
      setLoading(false)
    }
  }, [user.id])

  React.useEffect(() => {
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [load])

  const act = async (p: PreOrder, action: 'prepare' | 'done') => {
    try {
      await api.patch('/api/preorders', { id: p.id, action, cashierId: user.id, userId: user.id })
      toast.success(action === 'prepare' ? 'ثبت شد — محصولات کنار صندوق آماده است' : 'تسویه و چاپ رسید ثبت شد ✓')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'عملیات ناموفق بود')
    }
  }

  const toggleExpand = (id: number) => {
    setExpanded((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  return (
    <div>
      {/* friendly explainer */}
      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#EAD9A8] bg-gradient-to-l from-[#FBF4DE] to-[#FBF9F3] px-4 py-3">
        <Info size={18} className="mt-0.5 shrink-0 text-[#8A6508]" />
        <p className="text-xs leading-relaxed text-[#6B5A20] sm:text-sm">
          فروشنده محصولاتی که مشتری می‌خواهد را از قبل ثبت می‌کند؛ صندوق‌دار فقط اسکن می‌کند و با مشتری گفتگو می‌کند 💬
        </p>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-sm font-bold text-[#4A5A44]">
          {preorders.length > 0 && <span>{toFaDigits(preorders.length)} پیش‌صورتحساب</span>}
        </div>
        {isSalesperson && (
          <PrimaryButton onClick={() => setNewOpen(true)} className="min-h-[44px]">
            <Plus size={16} /> پیش‌صورتحساب جدید
          </PrimaryButton>
        )}
      </div>

      {loading ? <Loading /> : preorders.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={38} />}
          title="هنوز پیش‌صورتحسابی ثبت نشده"
          hint={isSalesperson ? 'با دکمه «پیش‌صورتحساب جدید» اولین سفارش مشتری را ثبت کنید' : 'به‌محض ثبت توسط فروشندگان، اینجا نمایش داده می‌شود'}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {preorders.map((p) => {
            const st = PO_STATUS[p.status] ?? { label: p.status, cls: 'bg-stone-100 text-stone-600 border-stone-200' }
            const open = expanded.has(p.id)
            return (
              <Card key={p.id} className={cn('p-4 transition-shadow', p.status === 'PENDING' && 'ring-1 ring-amber-200')}>
                <div className="flex items-start gap-3">
                  <Avatar name={p.salesperson?.name ?? '؟'} color={p.salesperson?.color ?? '#5F7A4E'} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="truncate text-sm font-bold text-[#253A2A]">
                        {p.customerName ?? 'مشتری مهمان'}
                      </span>
                      <Badge className={st.cls}>{st.label}</Badge>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] text-[#8A9884]">فروشنده: {p.salesperson?.name ?? '—'}</span>
                      <TimeAgo iso={p.createdAt} />
                    </div>
                  </div>
                </div>

                {/* items expandable */}
                <button
                  onClick={() => toggleExpand(p.id)}
                  className="mt-3 flex min-h-[36px] w-full items-center justify-between rounded-xl bg-[#F5F2E8] px-3 py-1.5 text-xs font-semibold text-[#4A5A44] transition hover:bg-[#EFF5EA]"
                  aria-expanded={open}
                >
                  <span>اقلام سفارش ({toFaDigits(p.items.length)} قلم)</span>
                  {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {open && (
                  <div className="pz-scroll mt-2 max-h-44 space-y-1.5 overflow-y-auto rounded-xl border border-[#EFEAD8] bg-white p-2.5">
                    {p.items.map((it, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 flex-1 truncate text-[#33402F]">{it.name}</span>
                        <span className="shrink-0 text-[#8A9884]">× {toFaDigits(it.qty)}</span>
                        <Money value={it.qty * it.sellPrice} className="shrink-0 font-semibold text-[#3E6B4A]" />
                      </div>
                    ))}
                  </div>
                )}

                {p.note && (
                  <p className="mt-2 rounded-lg bg-[#FBF4DE] px-2.5 py-1.5 text-[11px] text-[#6B5A20]">📝 {p.note}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#EFEAD8] pt-3">
                  <div>
                    <span className="block text-[10px] text-[#8A9884]">مبلغ کل</span>
                    <Money value={p.total} className="text-base font-black text-[#3E6B4A]" />
                  </div>
                  {isCashier && p.status === 'PENDING' && (
                    <div className="flex flex-col items-stretch gap-1">
                      <PrimaryButton onClick={() => act(p, 'prepare')} className="min-h-[44px]">
                        آماده‌سازی شد
                      </PrimaryButton>
                      <span className="text-[10px] text-[#8A9884]">محصولات را کنار صندوق بگذار</span>
                    </div>
                  )}
                  {isCashier && p.status === 'PREPARED' && (
                    <div className="flex flex-col items-stretch gap-1">
                      <GoldButton onClick={() => act(p, 'done')} className="min-h-[44px]">
                        تسویه/چاپ شد ✓
                      </GoldButton>
                      <span className="text-[10px] text-[#8A9884]">در Holoo اسکن و رسید چاپ شد</span>
                    </div>
                  )}
                  {p.cashier && (p.status === 'PREPARED' || p.status === 'DONE') && (
                    <span className="text-[10px] text-[#8A9884]">صندوق‌دار: {p.cashier.name}</span>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <NewPreorderModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        user={user}
        onDone={load}
      />
    </div>
  )
}

/* ---------- new preorder modal (salesperson) ---------- */

function NewPreorderModal({ open, onClose, user, onDone }: {
  open: boolean; onClose: () => void; user: PUser; onDone: () => Promise<void> | void
}) {
  const [customers, setCustomers] = React.useState<Customer[]>([])
  const [products, setProducts] = React.useState<ProductLite[]>([])
  const [custId, setCustId] = React.useState<string>('')
  const [newCustName, setNewCustName] = React.useState('')
  const [items, setItems] = React.useState<{ productId: number | null; name: string; qty: number; sellPrice: number }[]>([])
  const [note, setNote] = React.useState('')
  const [pQuery, setPQuery] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setCustId(''); setNewCustName(''); setItems([]); setNote(''); setPQuery('')
    api.get<{ customers: Customer[] }>('/api/customers').then((r) => setCustomers(r.customers)).catch(() => {})
    api.get<{ products: ProductLite[] }>('/api/products?limit=500').then((r) => setProducts(r.products)).catch(() => {})
  }, [open])

  const filteredProducts = React.useMemo(() => {
    const q = pQuery.trim().toLowerCase()
    if (!q) return products.slice(0, 30)
    return products
      .filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.nameFa ?? '').includes(pQuery.trim()) ||
        (p.barcode ?? '').includes(q))
      .slice(0, 30)
  }, [products, pQuery])

  const addProduct = (p: ProductLite) => {
    setItems((arr) => {
      const idx = arr.findIndex((x) => x.productId === p.id)
      if (idx >= 0) {
        const n = [...arr]
        n[idx] = { ...n[idx], qty: n[idx].qty + 1 }
        return n
      }
      return [...arr, { productId: p.id, name: p.name, qty: 1, sellPrice: p.sellPrice }]
    })
  }

  const setQty = (i: number, d: number) => {
    setItems((arr) => arr
      .map((x, j) => (j === i ? { ...x, qty: Math.max(0, x.qty + d) } : x))
      .filter((x) => x.qty > 0))
  }

  const total = items.reduce((s, it) => s + it.qty * it.sellPrice, 0)

  const submit = async () => {
    if (items.length === 0) { toast.error('حداقل یک قلم کالا اضافه کنید'); return }
    if (!custId && !newCustName.trim()) { toast.error('مشتری را انتخاب کنید یا نام مشتری جدید را بنویسید'); return }
    setSaving(true)
    try {
      const cid = custId ? Number(custId) : undefined
      const customerName = custId
        ? customers.find((c) => c.id === Number(custId))?.name ?? null
        : newCustName.trim()
      await api.post('/api/preorders', {
        customerId: cid ?? undefined,
        customerName,
        salespersonId: user.id,
        items: items.map((it) => ({ productId: it.productId, name: it.name, qty: it.qty, sellPrice: it.sellPrice })),
        note: note.trim() || undefined,
      })
      toast.success('پیش‌صورتحساب ثبت شد — صندوق‌داران مطلع شدند ✅')
      onClose()
      await onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ثبت ناموفق بود')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="پیش‌صورتحساب جدید" wide>
      <div className="space-y-4">
        {/* customer */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="مشتری" required>
            <select value={custId} onChange={(e) => setCustId(e.target.value)} className={inputCls}>
              <option value="">— مشتری جدید / انتخاب کنید —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ''}</option>
              ))}
            </select>
          </Field>
          <Field label="یا نام مشتری جدید" hint="اگر مشتری در فهرست نیست، نامش را بنویسید">
            <input
              value={newCustName}
              onChange={(e) => { setNewCustName(e.target.value); if (e.target.value) setCustId('') }}
              placeholder="مثلاً: خانم رضایی"
              className={inputCls}
              disabled={!!custId}
            />
          </Field>
        </div>

        {/* product picker */}
        <div>
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-[#D8D2BC] bg-white px-3">
            <Search size={15} className="shrink-0 text-[#8A9884]" />
            <input
              value={pQuery}
              onChange={(e) => setPQuery(e.target.value)}
              placeholder="جستجوی محصول (نام یا بارکد)…"
              className="min-h-[44px] w-full bg-transparent text-sm outline-none placeholder:text-[#A8A28C]"
              aria-label="جستجوی محصول"
            />
            <PackageSearch size={15} className="shrink-0 text-[#A8A28C]" />
          </div>
          <div className="pz-scroll max-h-48 overflow-y-auto rounded-xl border border-[#E4DCC8] bg-white">
            {filteredProducts.length === 0 ? (
              <div className="p-4 text-center text-xs text-[#8A9884]">محصولی یافت نشد</div>
            ) : filteredProducts.map((p) => (
              <button
                key={p.id}
                onClick={() => addProduct(p)}
                className="flex w-full items-center justify-between gap-2 border-b border-[#EFEAD8] px-3 py-2 text-right text-xs transition last:border-0 hover:bg-[#F3F7EF]"
              >
                <span className="min-w-0 flex-1 truncate font-semibold text-[#33402F]">{p.name}</span>
                <span className="shrink-0 text-[#8A9884]">{toFaDigits(p.stock)} موجود</span>
                <Money value={p.sellPrice} className="shrink-0 text-[#3E6B4A]" />
                <Plus size={14} className="shrink-0 text-[#5F8F55]" />
              </button>
            ))}
          </div>
        </div>

        {/* selected rows */}
        {items.length > 0 && (
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={it.productId ?? it.name} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#E4DCC8] bg-white p-2">
                <span className="min-w-[120px] flex-1 truncate text-xs font-bold text-[#253A2A]">{it.name}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setQty(i, -1)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F5F2E8] text-[#4A5A44] transition hover:bg-rose-50 hover:text-rose-600" aria-label="کاهش تعداد">
                    <Minus size={15} />
                  </button>
                  <span className="w-10 text-center text-sm font-black tabular-nums text-[#253A2A]">{toFaDigits(it.qty)}</span>
                  <button onClick={() => setQty(i, 1)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F5F2E8] text-[#4A5A44] transition hover:bg-[#EFF5EA] hover:text-[#3E6B4A]" aria-label="افزایش تعداد">
                    <Plus size={15} />
                  </button>
                </div>
                <input
                  type="number"
                  min={0}
                  value={it.sellPrice}
                  onChange={(e) => setItems((arr) => arr.map((x, j) => (j === i ? { ...x, sellPrice: Number(e.target.value) || 0 } : x)))}
                  className="w-32 rounded-xl border border-[#D8D2BC] bg-white px-2 py-2 text-left text-xs tabular-nums outline-none focus:border-[#5F8F55] focus:ring-2 focus:ring-[#93C572]/30"
                  aria-label={`قیمت ${it.name}`}
                />
                <Money value={it.qty * it.sellPrice} className="w-28 shrink-0 text-left text-xs font-bold text-[#3E6B4A]" />
              </div>
            ))}
          </div>
        )}

        <Field label="یادداشت (اختیاری)">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={cn(inputCls, 'resize-none')} placeholder="مثلاً: مشتری بعدازظهر می‌آید" />
        </Field>

        <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#F5F2E8] px-4 py-3">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-[#4A5A44]">
            <Sparkles size={14} className="text-[#B8860B]" /> جمع کل
          </span>
          <Money value={total} className="text-lg font-black text-[#3E6B4A]" />
        </div>

        <div className="flex justify-end gap-2">
          <GhostButton onClick={onClose} className="min-h-[44px]">انصراف</GhostButton>
          <PrimaryButton onClick={submit} disabled={saving || items.length === 0} className="min-h-[44px]">
            {saving ? 'در حال ثبت…' : 'ثبت پیش‌صورتحساب'}
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  )
}

/* ==================== CUSTOMERS ==================== */

function CustomersTab({ canManage }: { canManage: boolean }) {
  const [customers, setCustomers] = React.useState<Customer[]>([])
  const [loading, setLoading] = React.useState(true)
  const [q, setQ] = React.useState('')
  const [editing, setEditing] = React.useState<Customer | null>(null)
  const [addOpen, setAddOpen] = React.useState(false)

  const load = React.useCallback(async (query: string) => {
    try {
      const r = await api.get<{ customers: Customer[] }>(`/api/customers${query ? `?q=${encodeURIComponent(query)}` : ''}`)
      setCustomers(r.customers)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در دریافت مشتریان')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    setLoading(true)
    const t = setTimeout(() => load(q), q ? 350 : 0)
    return () => clearTimeout(t)
  }, [q, load])

  const prefsOf = (c: Customer): string[] =>
    (c.preference ?? '').split(/،|,/).map((s) => s.trim()).filter(Boolean)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-[#D8D2BC] bg-white px-3">
          <Search size={15} className="shrink-0 text-[#8A9884]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجو بر اساس نام یا شماره تماس…"
            className="min-h-[44px] w-full bg-transparent text-sm outline-none placeholder:text-[#A8A28C]"
            aria-label="جستجوی مشتری"
          />
        </div>
        {canManage && (
          <PrimaryButton onClick={() => setAddOpen(true)} className="min-h-[44px]">
            <Plus size={16} /> مشتری جدید
          </PrimaryButton>
        )}
      </div>

      {loading ? <Loading /> : customers.length === 0 ? (
        <EmptyState
          icon={<Users size={38} />}
          title={q ? 'مشتری‌ای با این جستجو پیدا نشد' : 'هنوز مشتری وفاداری ثبت نشده'}
          hint={canManage ? 'با دکمه «مشتری جدید» اولین مشتری را اضافه کنید' : undefined}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {customers.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#F3F7EF] to-[#EAD9A8] text-[#3E6B4A]">
                    <UserRound size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-[#253A2A]">{c.name}</div>
                    {c.phone && (
                      <div className="flex items-center gap-1 text-[11px] tabular-nums text-[#8A9884]">
                        <Phone size={11} /> {toFaDigits(c.phone)}
                      </div>
                    )}
                  </div>
                </div>
                {canManage && (
                  <button
                    onClick={() => setEditing(c)}
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-[#8A9884] transition hover:bg-[#F3F7EF] hover:text-[#3E6B4A]"
                    aria-label={`ویرایش ${c.name}`}
                  >
                    <Pencil size={15} />
                  </button>
                )}
              </div>
              {prefsOf(c).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {prefsOf(c).map((p, i) => (
                    <Badge key={i} className="border-[#D8E2D0] bg-[#F3F7EF] text-[#3E6B4A]">🌿 {p}</Badge>
                  ))}
                </div>
              )}
              <div className="mt-3 border-t border-[#EFEAD8] pt-2">
                <TimeAgo iso={c.createdAt} />
              </div>
            </Card>
          ))}
        </div>
      )}

      <CustomerModal
        open={addOpen || !!editing}
        customer={editing}
        onClose={() => { setAddOpen(false); setEditing(null) }}
        onDone={() => load(q)}
      />
    </div>
  )
}

function CustomerModal({ open, customer, onClose, onDone }: {
  open: boolean; customer: Customer | null; onClose: () => void; onDone: () => void
}) {
  const [name, setName] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [preference, setPreference] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setName(customer?.name ?? '')
      setPhone(customer?.phone ?? '')
      setPreference(customer?.preference ?? '')
    }
  }, [open, customer])

  const save = async () => {
    if (!name.trim()) { toast.error('نام مشتری الزامی است'); return }
    setSaving(true)
    try {
      if (customer) {
        await api.patch('/api/customers', { id: customer.id, name: name.trim(), phone: phone.trim() || null, preference: preference.trim() || null })
        toast.success('مشتری ویرایش شد ✅')
      } else {
        await api.post('/api/customers', { name: name.trim(), phone: phone.trim() || null, preference: preference.trim() || null })
        toast.success('مشتری جدید ثبت شد ✅')
      }
      onClose()
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ذخیره ناموفق بود')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={customer ? 'ویرایش مشتری' : 'مشتری جدید'}>
      <div className="space-y-3">
        <Field label="نام مشتری" required>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="مثلاً: خانم رضایی" />
        </Field>
        <Field label="شماره تماس" hint="اختیاری — برای تماس و پیگیری">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={cn(inputCls, 'text-left')} placeholder="۰۹۱۲…" dir="ltr" />
        </Field>
        <Field label="سلیقه‌ها / ترجیحات" hint="با «،» جدا کنید — مثلاً: پنیر لیقوان، ماست کم‌چرب، نان سنگک">
          <textarea value={preference} onChange={(e) => setPreference(e.target.value)} rows={2} className={cn(inputCls, 'resize-none')} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <GhostButton onClick={onClose} className="min-h-[44px]">انصراف</GhostButton>
          <PrimaryButton onClick={save} disabled={saving} className="min-h-[44px]">{saving ? '…' : 'ذخیره'}</PrimaryButton>
        </div>
      </div>
    </Modal>
  )
}

/* ==================== SALES & SPHL ==================== */

function sameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function SalesTab({ user }: { user: PUser }) {
  const [data, setData] = React.useState<{ sales: SaleT[]; summary: SalesSummary } | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [products, setProducts] = React.useState<ProductLite[]>([])
  const [staff, setStaff] = React.useState<StaffUser[]>([])

  // quick-log form
  const [pQuery, setPQuery] = React.useState('')
  const [pFocus, setPFocus] = React.useState(false)
  const [picked, setPicked] = React.useState<ProductLite | null>(null)
  const [qty, setQty] = React.useState(1)
  const [unitPrice, setUnitPrice] = React.useState(0)
  const [salespersonId, setSalespersonId] = React.useState<number>(user.id)
  const [channel, setChannel] = React.useState<'WALKIN' | 'PREORDER'>('WALKIN')
  const [customerName, setCustomerName] = React.useState('')
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [confirmId, setConfirmId] = React.useState<number | null>(null)

  const isMgmt =
    hasRole(user, 'OWNER') ||
    hasRole(user, 'GENERAL_MANAGER') ||
    hasRole(user, 'OPERATION_MANAGER') ||
    hasRole(user, 'IT_ADMIN')
  const canImport = isMgmt || hasRole(user, 'ACCOUNTANT')
  const [importOpen, setImportOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const r = await api.get<{ sales: SaleT[]; summary: SalesSummary }>('/api/sales?limit=200')
      setData(r)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در دریافت فروش‌ها')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  React.useEffect(() => {
    api.get<{ products: ProductLite[] }>('/api/products?limit=500').then((r) => setProducts(r.products)).catch(() => {})
    api
      .get<{ users: StaffUser[] }>('/api/users')
      .then((r) =>
        setStaff(
          r.users.filter(
            (u) => u.active && (u.roles.includes('SALESPERSON') || u.roles.includes('CASHIER'))
          )
        )
      )
      .catch(() => {})
  }, [])

  // management can pick any seller; everyone else is locked to self
  const sellerOptions = React.useMemo(() => {
    const list = [...staff]
    if (!isMgmt && !list.some((u) => u.id === user.id)) {
      list.unshift({ id: user.id, name: user.name, roles: user.roles, color: user.color, active: true })
    }
    return list
  }, [staff, isMgmt, user])

  React.useEffect(() => {
    if (!isMgmt) return
    setSalespersonId((prev) => (staff.some((u) => u.id === prev) ? prev : staff[0]?.id ?? prev))
  }, [staff, isMgmt])

  const filteredProducts = React.useMemo(() => {
    const q = pQuery.trim().toLowerCase()
    const base = q
      ? products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.nameFa ?? '').includes(pQuery.trim()) ||
            (p.barcode ?? '').includes(q)
        )
      : products
    return base.slice(0, 8)
  }, [products, pQuery])

  const pickProduct = (p: ProductLite) => {
    setPicked(p)
    setUnitPrice(p.sellPrice)
    setPQuery('')
    setPFocus(false)
  }

  const summary = data?.summary
  const chartData = React.useMemo(
    () =>
      (summary?.byDay ?? []).map((d) => {
        const { jm, jd } = isoToJalali(d.day)
        return { label: `${toFaDigits(jd)} ${JALALI_MONTHS[jm - 1]}`, total: d.total }
      }),
    [summary]
  )

  const todaySales = React.useMemo(() => {
    const now = new Date()
    return (data?.sales ?? []).filter((s) => sameCalendarDay(new Date(s.createdAt), now))
  }, [data])

  const submit = async () => {
    if (!picked) {
      toast.error('محصول را از فهرست انتخاب کنید')
      return
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error('تعداد باید بزرگ‌تر از صفر باشد')
      return
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      toast.error('قیمت واحد نامعتبر است')
      return
    }
    if (!salespersonId) {
      toast.error('فروشنده را انتخاب کنید')
      return
    }
    setSaving(true)
    try {
      await api.post('/api/sales', {
        userId: user.id,
        productId: picked.id,
        name: picked.name,
        qty,
        unitPrice,
        salespersonId,
        cashierId: user.id,
        channel,
        customerName: customerName.trim() || undefined,
        note: note.trim() || undefined,
      })
      toast.success('فروش ثبت شد ✓')
      setPicked(null)
      setPQuery('')
      setQty(1)
      setUnitPrice(0)
      setCustomerName('')
      setNote('')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ثبت فروش ناموفق بود')
    } finally {
      setSaving(false)
    }
  }

  const canDelete = (s: SaleT) => isMgmt || s.salespersonId === user.id || s.cashierId === user.id

  const del = async (s: SaleT) => {
    if (confirmId !== s.id) {
      setConfirmId(s.id)
      setTimeout(() => setConfirmId((c) => (c === s.id ? null : c)), 3500)
      return
    }
    setConfirmId(null)
    try {
      await api.del(`/api/sales?id=${s.id}&userId=${user.id}`)
      toast.info('فروش حذف شد (−۲ امتیاز به فروشنده)')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'حذف ناموفق بود')
    }
  }

  const sellers = summary?.bySalesperson ?? []

  return (
    <div dir="rtl">
      {/* friendly explainer */}
      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#EAD9A8] bg-gradient-to-l from-[#FBF4DE] to-[#FBF9F3] px-4 py-3">
        <Info size={18} className="mt-0.5 shrink-0 text-[#8A6508]" />
        <p className="text-xs leading-relaxed text-[#6B5A20] sm:text-sm">
          فروش ثبت‌شدهٔ صندوق و فروشندگان + شاخص <b>SPHL</b> (فروش ساعتی: فروش ÷ ساعت کاری) — Sales &amp; SPHL · هر ثبت فروش ۲+
          امتیاز برای فروشنده دارد
        </p>
      </div>

      {loading || !summary ? (
        <Loading />
      ) : (
        <>
          {/* ---------- stat cards ---------- */}
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="فروش امروز | Today"
              value={<Money value={summary.todayTotal} />}
              sub={`${toFaDigits(summary.todayCount)} فاکتور`}
              icon={<Banknote size={18} />}
              tone="gold"
            />
            <StatCard
              label="۷ روز اخیر | Week"
              value={<Money value={summary.weekTotal} />}
              icon={<CalendarRange size={18} />}
              tone="olive"
            />
            <StatCard
              label="۳۰ روز اخیر | Month"
              value={<Money value={summary.monthTotal} />}
              sub={`${toFaDigits(summary.count)} فاکتور`}
              icon={<BarChart3 size={18} />}
              tone="olive"
            />
            <StatCard
              label="SPHL فروش ساعتی"
              value={`${toFaDigits(summary.sphlOverall)} تومان/ساعت`}
              sub="میانده تیم در ۳۰ روز"
              icon={<Gauge size={18} />}
              tone="gold"
            />
          </div>

          {/* ---------- quick-log + 14-day chart ---------- */}
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            {/* quick-log form */}
            <Card className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[#253A2A]">ثبت سریع فروش | Quick log</h3>
                {canImport && (
                  <GhostButton
                    onClick={() => setImportOpen(true)}
                    className="min-h-[44px]"
                    title="ورود فروش از فایل XLS هولو | Import register sales from Holoo XLS"
                  >
                    <Upload size={15} /> ورود فروش هولو | Holoo import
                  </GhostButton>
                )}
              </div>
              <div className="space-y-3">
                {/* product picker */}
                <div className="relative">
                  <div className="flex items-center gap-2 rounded-xl border border-[#D8D2BC] bg-white px-3">
                    <Search size={15} className="shrink-0 text-[#8A9884]" />
                    <input
                      value={pQuery}
                      onChange={(e) => setPQuery(e.target.value)}
                      onFocus={() => setPFocus(true)}
                      onBlur={() => setTimeout(() => setPFocus(false), 180)}
                      placeholder={picked ? picked.name : 'جستجوی محصول (نام یا بارکد)…'}
                      disabled={!!picked}
                      className="min-h-[44px] w-full bg-transparent text-sm outline-none placeholder:text-[#A8A28C]"
                      aria-label="جستجوی محصول"
                    />
                    <PackageSearch size={15} className="shrink-0 text-[#A8A28C]" />
                  </div>
                  {!picked && pFocus && (
                    <div className="pz-scroll absolute inset-x-0 z-20 mt-1 max-h-52 overflow-y-auto rounded-xl border border-[#E4DCC8] bg-white shadow-lg">
                      {filteredProducts.length === 0 ? (
                        <div className="p-4 text-center text-xs text-[#8A9884]">محصولی یافت نشد</div>
                      ) : (
                        filteredProducts.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickProduct(p)}
                            className="flex min-h-[44px] w-full items-center justify-between gap-2 border-b border-[#EFEAD8] px-3 py-2 text-right text-xs transition last:border-0 hover:bg-[#F3F7EF]"
                          >
                            <span className="min-w-0 flex-1 truncate font-semibold text-[#33402F]">{p.name}</span>
                            <Money value={p.sellPrice} className="shrink-0 text-[#3E6B4A]" />
                            <Plus size={14} className="shrink-0 text-[#5F8F55]" />
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* qty + unitPrice */}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="تعداد | Qty" required>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setQty((q) => Math.max(1, q - 1))}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F5F2E8] text-[#4A5A44] transition hover:bg-rose-50 hover:text-rose-600"
                        aria-label="کاهش تعداد"
                      >
                        <Minus size={15} />
                      </button>
                      <input
                        type="number"
                        min={1}
                        value={qty}
                        onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                        className="w-full rounded-xl border border-[#D8D2BC] bg-white px-2 py-2.5 text-center text-sm font-bold tabular-nums outline-none focus:border-[#5F8F55] focus:ring-2 focus:ring-[#93C572]/30"
                        aria-label="تعداد"
                      />
                      <button
                        type="button"
                        onClick={() => setQty((q) => q + 1)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F5F2E8] text-[#4A5A44] transition hover:bg-[#EFF5EA] hover:text-[#3E6B4A]"
                        aria-label="افزایش تعداد"
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </Field>
                  <Field label="قیمت واحد (تومان) | Unit price" required>
                    <input
                      type="number"
                      min={0}
                      value={unitPrice}
                      onChange={(e) => setUnitPrice(Number(e.target.value) || 0)}
                      className={cn(inputCls, 'text-left tabular-nums')}
                      dir="ltr"
                      aria-label="قیمت واحد"
                    />
                  </Field>
                </div>

                {/* salesperson + channel */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="فروشنده | Salesperson" hint={isMgmt ? undefined : 'ثبت به نام خودتان'}>
                    <select
                      value={salespersonId}
                      onChange={(e) => setSalespersonId(Number(e.target.value))}
                      disabled={!isMgmt}
                      className={cn(inputCls, 'min-h-[44px] disabled:bg-[#F5F2E8] disabled:text-[#6B7A66]')}
                      aria-label="فروشنده"
                    >
                      {sellerOptions.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="کانال فروش | Channel">
                    <div className="flex gap-2">
                      {(
                        [
                          ['WALKIN', 'حضوری'],
                          ['PREORDER', 'پیش‌فروش'],
                        ] as const
                      ).map(([v, label]) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setChannel(v)}
                          aria-pressed={channel === v}
                          className={cn(
                            'min-h-[44px] flex-1 rounded-xl border px-2 text-xs font-semibold transition',
                            channel === v
                              ? 'border-[#3E6B4A] bg-gradient-to-b from-[#4A7A52] to-[#3A6242] text-white shadow'
                              : 'border-[#D8D2BC] bg-white text-[#4A5A44] hover:bg-[#F3F7EF]'
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </Field>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="نام مشتری (اختیاری)">
                    <input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className={inputCls}
                      placeholder="مثلاً: خانم رضایی"
                    />
                  </Field>
                  <Field label="یادداشت (اختیاری)">
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className={inputCls}
                      placeholder="مثلاً: فروش ویژه"
                    />
                  </Field>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#F5F2E8] px-4 py-3">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-[#4A5A44]">
                    <Sparkles size={14} className="text-[#B8860B]" /> جمع فروش
                  </span>
                  <Money value={qty * unitPrice} className="text-base font-black text-[#3E6B4A]" />
                </div>

                <PrimaryButton onClick={submit} disabled={saving || !picked} className="min-h-[44px] w-full">
                  <ShoppingBag size={16} /> {saving ? 'در حال ثبت…' : 'ثبت فروش'}
                </PrimaryButton>
              </div>
            </Card>

            {/* 14-day chart */}
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[#253A2A]">فروش ۱۴ روز اخیر | Last 14 days</h3>
                <Badge className="border-[#EAD9A8] bg-[#FBF3DC] text-[#8A6508]">
                  {fmtMoneyShort(summary.byDay.reduce((s, b) => s + b.total, 0))}
                </Badge>
              </div>
              <div className="h-60 w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EFEAD8" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: '#5F7A4E', fontSize: 9 }}
                      axisLine={{ stroke: '#93C572' }}
                      tickLine={false}
                      interval={1}
                    />
                    <YAxis
                      tick={{ fill: '#8A9884', fontSize: 10 }}
                      width={58}
                      tickFormatter={(v) => fmtMoneyShort(Number(v))}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={SALES_TOOLTIP_STYLE}
                      cursor={{ fill: 'rgba(218,165,32,0.10)' }}
                      formatter={(v) => fmtMoney(Number(v))}
                    />
                    <Bar dataKey="total" fill="#DAA520" radius={[6, 6, 0, 0]} maxBarSize={26} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* ---------- SPHL leaderboard ---------- */}
          <div className="mb-4">
            <h3 className="mb-2 text-sm font-bold text-[#4A5A44]">جدول فروشندگان و SPHL | Leaderboard</h3>
            {sellers.length === 0 ? (
              <EmptyState
                icon={<ShoppingBag size={38} />}
                title="هنوز فروشی ثبت نشده"
                hint="با فرم «ثبت سریع فروش» اولین فروش را ثبت کنید"
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sellers.map((p, i) => (
                  <Card key={p.userId} className={cn('p-4', i === 0 && 'ring-2 ring-[#DAA520]')}>
                    <div className="flex items-start gap-3">
                      <Avatar name={p.name} color={p.color} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-bold text-[#253A2A]">{p.name}</span>
                          {i === 0 ? (
                            <Badge className="border-[#DAA520] bg-[#FBF3DC] text-[#8A6508]">برترین 🏆</Badge>
                          ) : (
                            <Badge className="border-[#D8E2D0] bg-[#F3F7EF] text-[#3E6B4A]">
                              SPHL {toFaDigits(p.sphl)}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <Money value={p.total} className="text-sm font-black text-[#3E6B4A]" />
                          <span className="text-[11px] text-[#8A9884]">{toFaDigits(p.count)} فاکتور</span>
                        </div>
                        <div className="mt-1 text-[11px] text-[#8A9884]">
                          فروش ساعتی: {toFaDigits(p.sphl)} تومان/ساعت
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* ---------- today's sales ---------- */}
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[#253A2A]">فروش‌های امروز | Today&apos;s sales</h3>
              <Badge className="border-[#EAD9A8] bg-[#FBF3DC] text-[#8A6508]">{toFaDigits(todaySales.length)} فاکتور</Badge>
            </div>
            {todaySales.length === 0 ? (
              <EmptyState
                icon={<Banknote size={34} />}
                title="امروز فروشی ثبت نشده"
                hint="با فرم «ثبت سریع فروش» اولین فروش امروز را ثبت کنید"
              />
            ) : (
              <div className="pz-scroll max-h-96 space-y-2 overflow-y-auto">
                {todaySales.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-[#EFEAD8] bg-white px-3 py-2"
                  >
                    <Avatar
                      name={s.salesperson?.name ?? '؟'}
                      color={s.salesperson?.color ?? '#5F7A4E'}
                      size={32}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-xs font-bold text-[#253A2A]">{s.name}</span>
                        <Badge className={CHANNEL_BADGE[s.channel] ?? CHANNEL_BADGE.WALKIN}>
                          {s.channel === 'PREORDER' ? 'پیش‌فروش' : 'حضوری'}
                        </Badge>
                      </div>
                      <div className="truncate text-[10px] text-[#8A9884]">
                        {s.salesperson?.name ?? '—'} · {toFaDigits(s.qty)} × {fmtMoney(s.unitPrice)} ·{' '}
                        {fmtJalaliTime(s.createdAt)}
                        {s.customerName ? ` · ${s.customerName}` : ''}
                      </div>
                    </div>
                    <Money value={s.total} className="shrink-0 text-sm font-black text-[#3E6B4A]" />
                    {canDelete(s) &&
                      (confirmId === s.id ? (
                        <DangerButton onClick={() => del(s)} className="min-h-[44px] px-3 text-xs">
                          مطمئنی؟ حذف
                        </DangerButton>
                      ) : (
                        <button
                          onClick={() => setConfirmId(s.id)}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#B8B29A] transition hover:bg-rose-50 hover:text-rose-600"
                          aria-label={`حذف فروش ${s.name}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      ))}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {/* Holoo XLS import modal (management/accountant only) */}
      {canImport && (
        <HolooImportModal user={user} open={importOpen} onClose={() => setImportOpen(false)} onImported={load} />
      )}
    </div>
  )
}

/* ==================== HOLOO SALES IMPORT MODAL ==================== */

function HolooImportModal({ user, open, onClose, onImported }: {
  user: PUser
  open: boolean
  onClose: () => void
  onImported: () => void | Promise<void>
}) {
  const [file, setFile] = React.useState<File | null>(null)
  const [parsing, setParsing] = React.useState(false)
  const [rows, setRows] = React.useState<ImportRowT[] | null>(null)
  const [sellers, setSellers] = React.useState<{ id: number; name: string }[]>([])
  const [defaultSellerId, setDefaultSellerId] = React.useState<number>(user.id)
  const [committing, setCommitting] = React.useState(false)

  const reset = () => {
    setFile(null)
    setRows(null)
    setParsing(false)
    setCommitting(false)
  }
  const close = () => {
    reset()
    onClose()
  }

  const okRows = React.useMemo(() => rows?.filter((r) => r.status === 'ok') ?? [], [rows])
  const dupCount = rows?.filter((r) => r.status === 'duplicate').length ?? 0
  const invalidCount = rows?.filter((r) => r.status === 'invalid').length ?? 0
  // rows that will need the default seller on commit
  const needsSeller = okRows.some((r) => !r.sellerId)

  const sellerOptions = React.useMemo(() => {
    if (sellers.length > 0) return sellers
    return [{ id: user.id, name: user.name }]
  }, [sellers, user])

  React.useEffect(() => {
    if (open) setDefaultSellerId(sellerOptions[0]?.id ?? user.id)
  }, [open, sellerOptions, user.id])

  const parse = async () => {
    if (!file) {
      toast.error('ابتدا فایل هولو را انتخاب کنید')
      return
    }
    setParsing(true)
    try {
      const r = await uploadFile<ImportParseResp>('/api/sales/import', file, { userId: String(user.id) })
      if (!r.rows?.length) {
        toast.error('ردیف قابل پردازشی در فایل یافت نشد')
        setRows(null)
        return
      }
      setRows(r.rows)
      setSellers(r.sellers ?? [])
      toast.success(`${toFaDigits(r.rows.length)} ردیف خوانده شد — بررسی و ثبت کنید`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در بررسی فایل')
    } finally {
      setParsing(false)
    }
  }

  const commit = async () => {
    if (okRows.length === 0) return
    setCommitting(true)
    try {
      const r = await api.post<ImportCommitResp>('/api/sales/import', {
        userId: user.id,
        defaultSellerId: needsSeller ? defaultSellerId : undefined,
        rows: okRows.map((r) => ({
          name: r.name,
          barcode: r.barcode || undefined,
          qty: r.qty,
          unitPrice: r.unitPrice,
          total: r.total,
          isoDate: r.isoDate,
          sellerId: r.sellerId,
          productId: r.productId,
        })),
      })
      toast.success(
        `${toFaDigits(r.created)} قلم فروش ثبت شد ✓${r.skippedDuplicates ? ` · ${toFaDigits(r.skippedDuplicates)} ردیف تکراری رد شد` : ''}`
      )
      close()
      await onImported()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ثبت فروش ناموفق بود')
    } finally {
      setCommitting(false)
    }
  }

  const statusBadge = (r: ImportRowT) => {
    if (r.status === 'invalid') return <Badge className="border-rose-200 bg-rose-50 text-rose-700">نامعتبر</Badge>
    if (r.status === 'duplicate') return <Badge className="border-stone-200 bg-stone-100 text-stone-600">تکراری</Badge>
    if (r.sellerName && !r.sellerId)
      return <Badge className="border-amber-200 bg-amber-50 text-amber-700">فروشنده نامعتبر</Badge>
    return <Badge className="border-[#C8D8C0] bg-[#F3F7EF] text-[#3E6B4A]">قابل ثبت</Badge>
  }

  return (
    <Modal open={open} onClose={close} title="ورود فروش از هولو | Holoo sales import" wide>
      <div dir="rtl" className="space-y-4">
        {/* ---------- step 1: file ---------- */}
        <label
          className={cn(
            'flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-sm transition',
            'border-[#C8B98A] bg-[#FBF7EA] hover:bg-[#F7F1DD]'
          )}
        >
          <FileSpreadsheet size={18} className="shrink-0 text-[#8A6508]" />
          <span className="min-w-0 flex-1 truncate text-[#4A5A44]">
            {file ? file.name : 'انتخاب فایل XLS صادراتی هولو… | Choose Holoo export (.xls/.xlsx/.csv)'}
          </span>
          {file && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                setFile(null)
                setRows(null)
              }}
              className="shrink-0 rounded-lg px-2 py-1 text-xs text-[#8A6508] transition hover:bg-[#F0E6C8]"
              aria-label="حذف فایل انتخاب‌شده"
            >
              تغییر
            </button>
          )}
          <input
            type="file"
            accept=".xls,.xlsx,.csv"
            className="sr-only"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null)
              setRows(null)
            }}
            aria-label="فایل فروش هولو"
          />
        </label>
        <p className="rounded-xl bg-[#F5F2E8] px-3 py-2 text-[11px] leading-relaxed text-[#6B5A20]">
          ستون‌های مورد انتظار: <b>نام کالا</b>، <b>بارکد</b>، <b>تعداد</b>، <b>قیمت فروش</b>، <b>جمع کل</b>،{' '}
          <b>تاریخ</b> (شمسی یا میلادی)، <b>فروشنده</b> (اختیاری). اگر «جمع کل» نباشد از تعداد × قیمت ساخته می‌شود و
          اگر «قیمت فروش» نباشد از جمع کل ÷ تعداد به‌دست می‌آید. Expected columns: item name, barcode, qty, unit
          price, total, date (Jalali/Gregorian), seller (optional).
        </p>
        <PrimaryButton onClick={parse} disabled={!file || parsing} className="min-h-[44px] w-full">
          {parsing ? 'در حال بررسی…' : 'بررسی فایل | Parse'}
        </PrimaryButton>

        {/* ---------- step 2: preview ---------- */}
        {rows && rows.length > 0 && (
          <div className="space-y-3 border-t border-[#EFEAD8] pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-[#C8D8C0] bg-[#F3F7EF] text-[#3E6B4A]">
                {toFaDigits(okRows.length)} قابل ثبت
              </Badge>
              <Badge className="border-stone-200 bg-stone-100 text-stone-600">{toFaDigits(dupCount)} تکراری</Badge>
              <Badge className="border-rose-200 bg-rose-50 text-rose-700">{toFaDigits(invalidCount)} نامعتبر</Badge>
            </div>

            <div className="pz-scroll max-h-72 overflow-y-auto rounded-2xl border border-[#E4DCC8] bg-white">
              <table className="w-full min-w-[560px] text-xs">
                <thead>
                  <tr>
                    <Th className="sticky top-0 z-10">نام کالا</Th>
                    <Th className="sticky top-0 z-10">تعداد</Th>
                    <Th className="sticky top-0 z-10">قیمت</Th>
                    <Th className="sticky top-0 z-10">مبلغ</Th>
                    <Th className="sticky top-0 z-10">تاریخ</Th>
                    <Th className="sticky top-0 z-10">وضعیت</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={cn(r.status === 'duplicate' && 'bg-stone-50/70', r.status === 'invalid' && 'bg-rose-50/40')}>
                      <Td className="max-w-[190px]">
                        <div dir="auto" className="truncate font-semibold text-[#253A2A]" title={r.name}>
                          {r.name}
                        </div>
                        {r.matchedName && r.matchedName !== r.name && (
                          <div dir="auto" className="truncate text-[10px] text-[#8A9884]" title={r.matchedName}>
                            {r.matchedName}
                          </div>
                        )}
                        {r.reason && <div className="text-[10px] text-rose-500">{r.reason}</div>}
                      </Td>
                      <Td className="whitespace-nowrap tabular-nums">{toFaDigits(r.qty)}</Td>
                      <Td className="whitespace-nowrap tabular-nums">{fmtMoney(r.unitPrice)}</Td>
                      <Td className="whitespace-nowrap">
                        <Money value={r.total} className="font-bold text-[#3E6B4A]" />
                      </Td>
                      <Td className="whitespace-nowrap text-[#6B7A66]">{fmtJalali(r.isoDate)}</Td>
                      <Td>{statusBadge(r)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {needsSeller && (
              <Field
                label="فروشنده پیش‌فرض (برای ردیف‌های بدون فروشنده) | Default seller"
                hint="ردیف‌هایی که فروشنده‌شان در فایل نبود یا شناخته نشد، به این نفر ثبت می‌شوند"
              >
                <select
                  value={defaultSellerId}
                  onChange={(e) => setDefaultSellerId(Number(e.target.value))}
                  className={cn(inputCls, 'min-h-[44px]')}
                  aria-label="فروشنده پیش‌فرض"
                >
                  {sellerOptions.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <GhostButton onClick={reset} className="min-h-[44px] sm:w-40">
                فایل دیگر | Change file
              </GhostButton>
              <GoldButton onClick={commit} disabled={okRows.length === 0 || committing} className="min-h-[44px] flex-1">
                <Upload size={15} />
                {committing ? 'در حال ثبت…' : `ثبت ${toFaDigits(okRows.length)} قلم فروش | Import`}
              </GoldButton>
            </div>
            <p className="text-[11px] leading-relaxed text-[#8A9884]">
              فروش‌های ثبت‌شده از هولو امتیاز ثبت‌دستی ندارند و مستقیم در آمار SPHL روزِ تاریخ فایل حساب می‌شوند.
              Imported register sales are recorded with the file&apos;s date and feed the SPHL stats.
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}
