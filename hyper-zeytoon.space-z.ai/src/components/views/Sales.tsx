'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { faMoney, faNum, formatJalaliDateTime } from '@/lib/jalali'
import {
  SectionCard, Pill, EmptyState, Labeled, SearchInput, Avatar, CATEGORY_EMOJI,
} from '@/components/app/ui-bits'
import type { AppCtx } from '@/components/app/ui-bits'
import { Modal } from '@/components/views/Orders'
import { BarChart } from '@/components/app/charts'
import { cn } from '@/lib/utils'
import {
  ShoppingBag, CreditCard, TrendingUp, NotebookPen, Plus, Minus, X, Star, UserPlus,
  Send, Ban, Printer, ChevronDown, Trash2,
} from 'lucide-react'

type Customer = { id: string; name: string; phone: string; preferences: string; favorite: boolean }
type Product = { id: string; name: string; category: string; brand: string; unit: string; sellPrice: number; stock: number }
type PItem = { productId: string; name: string; qty: number; price: number }
type PreOrder = {
  id: string; code: string; customerName: string; items: PItem[]; total: number
  createdByName: string; cashierName?: string; status: string; note: string; createdAt: string
}
type CReq = { id: string; productName: string; count: number; lastByName: string }

const PO_STATUS: Record<string, { label: string; color: string }> = {
  NEW: { label: 'در صف صندوق', color: '#a16207' },
  CASHIER_EDITED: { label: 'ویرایش صندوق', color: '#a04c2a' },
  READY: { label: 'آماده/ارسال شده', color: '#0e7a4a' },
  DONE: { label: 'تکمیل', color: '#3f6212' },
  CANCELLED: { label: 'لغو', color: '#b3372f' },
}

const NAME_COLORS = ['#0e7a4a', '#c9a227', '#c96f4a', '#77934a', '#8a5a2b', '#207a63', '#a33d3d']
function nameColor(name: string): string {
  let h = 0
  for (const ch of name) h = (h + ch.charCodeAt(0)) % NAME_COLORS.length
  return NAME_COLORS[h]
}

export default function SalesView({ ctx }: { ctx: AppCtx }) {
  const role = ctx.user!.role
  const secondary: string[] = ctx.user!.secondaryRoles || []
  const canSell = ['SALES', 'HC', 'CASHIER', 'GM', 'PM', 'OM'].includes(role) || secondary.includes('SALES')
  const canCashier = ['HC', 'CASHIER', 'GM', 'OM'].includes(role)
  const canDeleteReqs = ['GM', 'PM', 'OM'].includes(role)

  const TABS = [
    ...(canSell ? [{ key: 'new', label: 'ثبت پیش‌فاکتور برای مشتری 🛍️', icon: <ShoppingBag size={14} /> }] : []),
    ...(canCashier ? [{ key: 'queue', label: 'صف صندوق 💳', icon: <CreditCard size={14} /> }] : []),
    { key: 'history', label: 'تاریخچه و عملکرد فروش 📈', icon: <TrendingUp size={14} /> },
    { key: 'requests', label: 'درخواست‌های مشتری 📝', icon: <NotebookPen size={14} /> },
  ]
  const [tab, setTab] = useState(
    role === 'CASHIER' || role === 'HC' ? 'queue' : canSell ? 'new' : 'history'
  )

  return (
    <div className="space-y-4">
      <div className="scroll-gold flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-extrabold transition',
              tab === t.key
                ? 'bg-primary text-white shadow-md'
                : 'border border-border bg-card text-foreground/70 hover:border-primary/50'
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* tab 1 — keep mounted so cart survives tab switches */}
      {canSell && (
        <div className={cn(tab === 'new' ? 'block' : 'hidden')}>
          <PreorderForm ctx={ctx} />
        </div>
      )}

      {/* tab 2 */}
      {canCashier && tab === 'queue' && <CashierQueue ctx={ctx} />}

      {/* tab 3 */}
      {tab === 'history' && <HistorySection />}

      {/* tab 4 — light, keep mounted */}
      <div className={cn(tab === 'requests' ? 'block' : 'hidden')}>
        <RequestsSection canDelete={canDeleteReqs} />
      </div>
    </div>
  )
}

/* ═══════════════════════════ Tab 1: ثبت پیش‌فاکتور ═══════════════════════════ */
function PreorderForm({ ctx }: { ctx: AppCtx }) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [q, setQ] = useState('')
  const [hitQty, setHitQty] = useState<Record<string, number>>({})
  const [cart, setCart] = useState<PItem[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [showNewCust, setShowNewCust] = useState(false)
  const [nc, setNc] = useState({ name: '', phone: '', preferences: '' })

  useEffect(() => {
    api<{ customers: Customer[] }>('/api/customers').then((d) => setCustomers(d.customers)).catch(() => {})
    api<{ products: Product[] }>('/api/products').then((d) => setProducts(d.products)).catch(() => {})
  }, [])

  const hits = useMemo(() => {
    const needle = q.trim()
    if (!needle) return products.slice(0, 30)
    return products.filter((p) => p.name.includes(needle) || p.brand.includes(needle)).slice(0, 30)
  }, [products, q])

  const total = cart.reduce((s, i) => s + i.qty * i.price, 0)
  const selectedCust = customers.find((c) => c.id === selectedId)

  const addProduct = (p: Product) => {
    const qty = Math.max(1, Number(hitQty[p.id]) || 1)
    setCart((c) => {
      const ex = c.find((i) => i.productId === p.id)
      if (ex) return c.map((i) => (i.productId === p.id ? { ...i, qty: i.qty + qty } : i))
      return [...c, { productId: p.id, name: p.name, qty, price: p.sellPrice }]
    })
    setHitQty((m) => ({ ...m, [p.id]: 1 }))
  }

  const setCartQty = (productId: string, qty: number) =>
    setCart((c) => c.map((i) => (i.productId === productId ? { ...i, qty: Math.max(1, qty) } : i)))

  const saveCustomer = async () => {
    if (!nc.name.trim()) return toast.error('نام مشتری الزامی است')
    try {
      const res = await api<{ customer: Customer }>('/api/customers', {
        method: 'POST',
        body: { name: nc.name.trim(), phone: nc.phone.trim(), preferences: nc.preferences.trim() },
      })
      setCustomers((cs) => [res.customer, ...cs])
      setSelectedId(res.customer.id)
      setNc({ name: '', phone: '', preferences: '' })
      setShowNewCust(false)
      toast.success('مشتری جدید ثبت شد ✅')
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const submit = async () => {
    if (cart.length === 0) return toast.error('حداقل یک کالا به سبد اضافه کنید')
    setBusy(true)
    try {
      const res = await api<{ preOrder: PreOrder }>('/api/preorders', {
        method: 'POST',
        body: {
          customerId: selectedId || undefined,
          customerName: selectedCust?.name || 'مشتری حضوری',
          items: cart,
          note: note.trim(),
        },
      })
      toast.success(`پیش‌فاکتور ${res.preOrder.code} به صف صندوق ارسال شد ✅`)
      setCart([])
      setNote('')
      setSelectedId('')
      setHitQty({})
      ctx.refreshNotifications()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {/* customer + product adder */}
      <div className="space-y-4 lg:col-span-3">
        <SectionCard
          title="انتخاب مشتری"
          subtitle="مشتری‌های ⭐ منتخب اول هستند — یا «مشتری جدید» را ثبت کنید"
          icon={<Star size={18} />}
          actions={
            <button
              onClick={() => setShowNewCust((s) => !s)}
              className="flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-[11px] font-extrabold text-foreground/70 hover:border-primary/50"
            >
              <UserPlus size={13} /> مشتری جدید
            </button>
          }
        >
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedId('')}
              className={cn(
                'rounded-full border px-3.5 py-2 text-[11px] font-extrabold transition',
                !selectedId ? 'border-primary bg-primary text-white' : 'border-border bg-card text-foreground/70'
              )}
            >
              بدون مشتری (حضوری)
            </button>
            {customers.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                title={[c.phone, c.preferences].filter(Boolean).join(' • ')}
                className={cn(
                  'flex items-center gap-1 rounded-full border px-3.5 py-2 text-[11px] font-extrabold transition',
                  selectedId === c.id ? 'border-primary bg-primary text-white' : 'border-border bg-card text-foreground/70 hover:border-primary/50'
                )}
              >
                {c.favorite && <Star size={11} className={selectedId === c.id ? 'fill-white text-white' : 'fill-[#c9a227] text-[#c9a227]'} />}
                {c.name}
              </button>
            ))}
          </div>

          {showNewCust && (
            <div className="mt-3 space-y-2.5 rounded-2xl border border-[#c9a227]/40 bg-[#fdf6dd]/40 p-3">
              <div className="grid gap-2.5 sm:grid-cols-3">
                <Labeled label="نام مشتری *">
                  <input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} className="w-full rounded-xl border border-input bg-white/90 p-2.5 text-sm" placeholder="مثلاً: آقای رضایی" />
                </Labeled>
                <Labeled label="تلفن">
                  <input value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} dir="ltr" className="w-full rounded-xl border border-input bg-white/90 p-2.5 text-sm" placeholder="09xxxxxxxxx" />
                </Labeled>
                <Labeled label="سلیقه / یادداشت">
                  <input value={nc.preferences} onChange={(e) => setNc({ ...nc, preferences: e.target.value })} className="w-full rounded-xl border border-input bg-white/90 p-2.5 text-sm" placeholder="مثلاً: همیشه پنیر لیقوان" />
                </Labeled>
              </div>
              <button onClick={saveCustomer} className="w-full rounded-xl bg-[#77934a] py-2.5 text-xs font-extrabold text-white">
                ثبت مشتری ✅
              </button>
            </div>
          )}
        </SectionCard>

        <SectionCard title="افزودن کالا" subtitle="جستجو کنید و با دکمهٔ + به سبد اضافه کنید" icon={<Plus size={18} />}>
          <SearchInput value={q} onChange={setQ} placeholder="نام کالا یا برند…" />
          <div className="scroll-gold mt-3 max-h-[34vh] space-y-1.5 overflow-y-auto pl-1">
            {hits.length === 0 && <EmptyState emoji="🔍" title="کالایی پیدا نشد" />}
            {hits.map((p) => {
              const qty = Math.max(1, Number(hitQty[p.id]) || 1)
              return (
                <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-white/80 p-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-lg">{CATEGORY_EMOJI[p.category] || '📦'}</span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-foreground">{p.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {faMoney(p.sellPrice)} تومان / {p.unit}
                        {p.stock <= 0 ? <span className="font-black text-[#b3372f]"> • ناموجود</span> : ` • موجودی ${faNum(p.stock)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => setHitQty((m) => ({ ...m, [p.id]: Math.max(1, qty - 1) }))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card" title="کمتر">
                      <Minus size={12} />
                    </button>
                    <span className="w-7 text-center text-xs font-black">{faNum(qty)}</span>
                    <button onClick={() => setHitQty((m) => ({ ...m, [p.id]: qty + 1 }))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card" title="بیشتر">
                      <Plus size={12} />
                    </button>
                    <button
                      onClick={() => addProduct(p)}
                      className="ml-1 flex h-9 items-center gap-1 rounded-lg bg-primary px-3 text-[11px] font-black text-white"
                    >
                      <Plus size={13} /> افزودن
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>
      </div>

      {/* cart */}
      <SectionCard title="سبد پیش‌فاکتور" subtitle={selectedCust ? `برای: ${selectedCust.name}` : 'بدون مشتری — فروش حضوری'} icon={<ShoppingBag size={18} />} className="lg:col-span-2">
        <div className="scroll-gold max-h-[38vh] space-y-1.5 overflow-y-auto pl-1">
          {cart.length === 0 && <EmptyState emoji="🛒" title="سبد خالی است" hint="از ستون کناری کالا اضافه کنید" />}
          {cart.map((i) => (
            <div key={i.productId} className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 p-2.5">
              <div className="min-w-0">
                <p className="truncate text-xs font-bold">{i.name}</p>
                <p className="text-[10px] text-muted-foreground">{faMoney(i.price)} × {faNum(i.qty)} = {faMoney(i.qty * i.price)} تومان</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button onClick={() => setCartQty(i.productId, i.qty - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card"><Minus size={12} /></button>
                <span className="w-7 text-center text-xs font-black">{faNum(i.qty)}</span>
                <button onClick={() => setCartQty(i.productId, i.qty + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card"><Plus size={12} /></button>
                <button
                  onClick={() => setCart((c) => c.filter((x) => x.productId !== i.productId))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#b3372f]/10 text-[#b3372f]"
                  title="حذف از سبد"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3">
          <Labeled label="یادداشت برای صندوق">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="مثلاً: تحویل ساعت ۱۷"
              className="w-full resize-none rounded-xl border border-input bg-white/90 p-3 text-sm"
            />
          </Labeled>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-xl bg-[#0e7a4a]/10 px-4 py-3">
          <span className="text-xs font-bold text-foreground/80">جمع کل سبد</span>
          <span className="text-base font-black text-[#0e7a4a]">{faMoney(total)} تومان</span>
        </div>
        <button
          onClick={submit}
          disabled={busy || cart.length === 0}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-extrabold text-white disabled:opacity-40"
        >
          <Send size={15} /> {busy ? '…' : 'ارسال به صف صندوق'}
        </button>
      </SectionCard>
    </div>
  )
}

/* ═══════════════════════════ Tab 2: صف صندوق ═══════════════════════════ */
function CashierQueue({ ctx }: { ctx: AppCtx }) {
  const [list, setList] = useState<PreOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, PItem[]>>({})
  const [printing, setPrinting] = useState<PreOrder | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const d = await api<{ preOrders: PreOrder[] }>('/api/preorders?scope=cashier')
      setList(d.preOrders)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const toggle = (po: PreOrder) => {
    if (openId === po.id) return setOpenId(null)
    setOpenId(po.id)
    setDrafts((d) => ({ ...d, [po.id]: po.items.map((i) => ({ ...i })) }))
  }

  const setQty = (poId: string, idx: number, qty: number) =>
    setDrafts((d) => ({
      ...d,
      [poId]: (d[poId] || []).map((it, i) => (i === idx ? { ...it, qty: Math.max(1, qty) } : it)),
    }))

  const sendToPos = async (po: PreOrder) => {
    setBusy(true)
    try {
      const items = drafts[po.id] || po.items
      const res = await api<{ preOrder: PreOrder }>(`/api/preorders/${po.id}`, {
        method: 'PATCH',
        body: { action: 'cashier_edit', items },
      })
      toast.success('آماده پردازش در هلو — رسید چاپ شد 🖨️')
      setOpenId(null)
      setPrinting({ ...res.preOrder, items })
      await load()
      ctx.refreshNotifications()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const cancel = async (po: PreOrder) => {
    setBusy(true)
    try {
      await api(`/api/preorders/${po.id}`, { method: 'PATCH', body: { action: 'cancel' } })
      toast.success(`پیش‌فاکتور ${po.code} لغو شد`)
      setOpenId(null)
      await load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SectionCard
        title="صف صندوق 💳"
        subtitle="پیش‌فاکتورهای ثبت‌شدهٔ فروشندگان — ویرایش تعداد، ارسال به هلو و چاپ رسید"
        icon={<CreditCard size={18} />}
      >
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">در حال بارگذاری صف…</p>
        ) : list.length === 0 ? (
          <EmptyState emoji="💳" title="صف صندوق خالی است" hint="پیش‌فاکتورهای جدید فروشندگان اینجا ظاهر می‌شوند" />
        ) : (
          <div className="scroll-gold max-h-[60vh] space-y-2 overflow-y-auto pl-1">
            {list.map((po) => {
              const st = PO_STATUS[po.status] || PO_STATUS.NEW
              const open = openId === po.id
              const items = drafts[po.id] || po.items
              const dTotal = items.reduce((s, i) => s + i.qty * i.price, 0)
              return (
                <div key={po.id} className="glow-card overflow-hidden rounded-2xl bg-white/80">
                  <button type="button" onClick={() => toggle(po)} className="flex w-full flex-wrap items-center justify-between gap-2 p-3.5 text-right">
                    <div className="flex items-center gap-3">
                      <Avatar name={po.createdByName} color={nameColor(po.createdByName)} size={36} />
                      <div>
                        <p className="text-sm font-black">
                          {po.code} — {po.customerName}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {faNum(po.items.length)} قلم کالا • ثبت: {po.createdByName}
                          {po.note ? ` • 📝 ${po.note}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-[#0e7a4a]">{faMoney(po.total)} تومان</span>
                      <Pill label={st.label} color={st.color} />
                      <ChevronDown size={15} className={cn('text-muted-foreground transition', open && 'rotate-180')} />
                    </div>
                  </button>

                  {open && (
                    <div className="border-t border-border/60 bg-muted/20 p-3.5 fade-in-up">
                      <div className="space-y-1.5">
                        {items.map((it, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-2 rounded-xl bg-card p-2.5">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-bold">{it.name}</p>
                              <p className="text-[10px] text-muted-foreground">{faMoney(it.price)} تومان</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button onClick={() => setQty(po.id, idx, it.qty - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card"><Minus size={12} /></button>
                              <span className="w-8 text-center text-xs font-black">{faNum(it.qty)}</span>
                              <button onClick={() => setQty(po.id, idx, it.qty + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card"><Plus size={12} /></button>
                              <span className="w-24 text-left text-[11px] font-black text-[#0e7a4a]">{faMoney(it.qty * it.price)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center justify-between rounded-xl bg-[#0e7a4a]/10 px-3 py-2 text-xs font-black">
                        <span>جمع قابل پرداخت</span>
                        <span className="text-[#0e7a4a]">{faMoney(dTotal)} تومان</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => sendToPos(po)}
                          disabled={busy}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-3 text-xs font-extrabold text-white disabled:opacity-40"
                        >
                          <Printer size={14} /> ارسال به صندوق هلو و چاپ رسید 🖨️
                        </button>
                        <button
                          onClick={() => cancel(po)}
                          disabled={busy}
                          className="flex items-center justify-center gap-1.5 rounded-xl bg-[#b3372f]/10 px-4 py-3 text-xs font-extrabold text-[#b3372f] disabled:opacity-40"
                        >
                          <Ban size={14} /> لغو
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      {/* simulated print receipt */}
      {printing && (
        <Modal title="رسید صندوق هلو 🖨️" onClose={() => setPrinting(null)}>
          <div className="rounded-2xl border border-dashed border-border bg-white p-4 text-sm">
            <div className="border-b border-dashed border-border pb-2 text-center">
              <p className="text-base font-black">🫒 هایپر زیتون</p>
              <p className="text-[11px] text-muted-foreground">کرمان — رسید فروش</p>
            </div>
            <div className="flex justify-between py-2 text-[11px] text-muted-foreground">
              <span>کد: {printing.code}</span>
              <span>{formatJalaliDateTime(new Date())}</span>
            </div>
            <div className="space-y-1 border-y border-dashed border-border py-2">
              {printing.items.map((it, i) => (
                <div key={i} className="flex justify-between text-[11px]">
                  <span className="min-w-0 truncate">{it.name} × {faNum(it.qty)}</span>
                  <span className="shrink-0 font-bold">{faMoney(it.qty * it.price)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between pt-2 text-sm font-black">
              <span>جمع کل</span>
              <span>{faMoney(printing.items.reduce((s, i) => s + i.qty * i.price, 0))} تومان</span>
            </div>
            <p className="pt-2 text-center text-[10px] text-muted-foreground">
              مشتری: {printing.customerName} • صندوقدار: {ctx.user!.name}
            </p>
          </div>
          <p className="text-center text-[11px] font-bold text-[#0e7a4a]">رسید در صف چاپ هلو قرار گرفت ✅</p>
          <button onClick={() => setPrinting(null)} className="w-full rounded-xl bg-primary py-2.5 text-xs font-extrabold text-white">
            بستن
          </button>
        </Modal>
      )}
    </>
  )
}

/* ═══════════════════════════ Tab 3: تاریخچه و عملکرد ═══════════════════════════ */
function HistorySection() {
  const [all, setAll] = useState<PreOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [person, setPerson] = useState('')

  useEffect(() => {
    api<{ preOrders: PreOrder[] }>('/api/preorders?scope=all')
      .then((d) => setAll(d.preOrders))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [])

  const people = useMemo(() => [...new Set(all.map((p) => p.createdByName))], [all])
  const filtered = person ? all.filter((p) => p.createdByName === person) : all
  const perPerson = useMemo(
    () => people.map((n) => ({ label: n, value: all.filter((p) => p.createdByName === n).length })),
    [people, all]
  )

  return (
    <div className="space-y-4">
      <SectionCard title="فروش به تفکیک فروشنده" subtitle="تعداد پیش‌فاکتور ثبت‌شدهٔ هر همکار" icon={<TrendingUp size={18} />}>
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">در حال بارگذاری…</p>
        ) : perPerson.length === 0 ? (
          <EmptyState emoji="📈" title="هنوز پیش‌فاکتوری ثبت نشده" />
        ) : (
          <>
            <BarChart data={perPerson} color="#c9a227" />
            {/* SPHL card */}
            <div className="mt-4 rounded-2xl border border-[#c9a227]/40 bg-[#fdf6dd]/50 p-3.5">
              <p className="text-xs font-black text-[#8a6d10]">فروش به ازای ساعت کار (SPHL) = تعداد پیش‌فاکتور ÷ ساعت کاری شیفت</p>
              <p className="mt-1 text-[10px] text-muted-foreground">محاسبهٔ زیر با فرض شیفت ۸ ساعته انجام شده است.</p>
              <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
                {perPerson.map((p) => (
                  <div key={p.label} className="flex items-center justify-between rounded-xl bg-white/80 px-3 py-2">
                    <span className="text-xs font-bold">{p.label}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {faNum(p.value)} پیش‌فاکتور → SPHL: <b className="text-[#8a6d10]">{faNum((p.value / 8).toFixed(1))}</b>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard
        title="تاریخچه پیش‌فاکتورها"
        subtitle="همهٔ پیش‌فاکتورها با وضعیت — با فیلتر نام فروشنده"
        icon={<NotebookPen size={18} />}
      >
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            onClick={() => setPerson('')}
            className={cn('rounded-full border px-3.5 py-1.5 text-[11px] font-extrabold', !person ? 'border-primary bg-primary text-white' : 'border-border bg-card text-foreground/70')}
          >
            همه
          </button>
          {people.map((n) => (
            <button
              key={n}
              onClick={() => setPerson(n)}
              className={cn('rounded-full border px-3.5 py-1.5 text-[11px] font-extrabold', person === n ? 'border-primary bg-primary text-white' : 'border-border bg-card text-foreground/70')}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="scroll-gold max-h-[46vh] space-y-2 overflow-y-auto pl-1">
          {filtered.length === 0 && <EmptyState emoji="🧾" title="موردی یافت نشد" />}
          {filtered.map((po) => {
            const st = PO_STATUS[po.status] || PO_STATUS.NEW
            return (
              <div key={po.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-white/80 p-3.5">
                <div className="flex items-center gap-3">
                  <Avatar name={po.createdByName} color={nameColor(po.createdByName)} size={34} />
                  <div>
                    <p className="text-xs font-black">{po.code} — {po.customerName}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {faNum(po.items.length)} قلم • فروشنده: {po.createdByName}
                      {po.cashierName ? ` • صندوق: ${po.cashierName}` : ''} • {formatJalaliDateTime(po.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-[#0e7a4a]">{faMoney(po.total)} تومان</span>
                  <Pill label={st.label} color={st.color} />
                </div>
              </div>
            )
          })}
        </div>
      </SectionCard>
    </div>
  )
}

/* ═══════════════════════════ Tab 4: درخواست‌های مشتری ═══════════════════════════ */
function RequestsSection({ canDelete }: { canDelete: boolean }) {
  const [reqs, setReqs] = useState<CReq[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const d = await api<{ requests: CReq[] }>('/api/customer-requests')
      setReqs(d.requests)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const add = async () => {
    if (!name.trim()) return toast.error('نام کالا را وارد کنید')
    setBusy(true)
    try {
      const res = await api<{ repeated: boolean }>('/api/customer-requests', { method: 'POST', body: { productName: name.trim() } })
      toast.success(res.repeated ? 'تعداد درخواست این کالا افزایش یافت ✅' : 'درخواست مشتری ثبت شد 📝')
      setName('')
      await load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const del = async (r: CReq) => {
    try {
      await api(`/api/customer-requests?id=${r.id}`, { method: 'DELETE' })
      toast.success('حذف شد')
      await load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  return (
    <SectionCard
      title="درخواست‌های مشتری برای کالاهای ناموجود"
      subtitle="هر بار مشتری دنبال کالایی بود که نداشتیم، اینجا ثبت کنید تا در تصمیم خرید دیده شود"
      icon={<NotebookPen size={18} />}
    >
      <div className="mb-3 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="نام کالایی که مشتری خواست…"
          className="flex-1 rounded-xl border border-input bg-white/90 p-3 text-sm"
        />
        <button
          onClick={add}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-3 text-xs font-extrabold text-white disabled:opacity-40"
        >
          <Plus size={14} /> ثبت درخواست
        </button>
      </div>
      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">در حال بارگذاری…</p>
      ) : reqs.length === 0 ? (
        <EmptyState emoji="📝" title="هنوز درخواستی ثبت نشده" hint="اولین درخواست را همین بالا ثبت کنید" />
      ) : (
        <div className="scroll-gold max-h-[42vh] space-y-1.5 overflow-y-auto pl-1">
          {reqs.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-white/80 p-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-9 shrink-0 items-center rounded-xl bg-[#c9a227]/15 px-2.5 text-xs font-black text-[#8a6d10]">
                  ×{faNum(r.count)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold">{r.productName}</p>
                  <p className="text-[10px] text-muted-foreground">آخرین ثبت: {r.lastByName || '—'}</p>
                </div>
              </div>
              {canDelete && (
                <button
                  onClick={() => del(r)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#b3372f]/10 text-[#b3372f]"
                  title="حذف درخواست"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
