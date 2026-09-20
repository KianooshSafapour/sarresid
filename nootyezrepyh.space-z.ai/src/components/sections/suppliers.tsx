'use client'

import * as React from 'react'
import { api, ClientUser } from '@/lib/api-client'
import { toFaDigits, formatMoney, todayJalali, addDaysJalali } from '@/lib/jalali'
import { canUser, PERMISSIONS, STOCK_STATUS, stockStatus } from '@/lib/constants'
import { SectionHeader, EmptyState, GlowCard, StockBadge, Money, OrnamentDivider } from '@/components/zeytoon-ui'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { JalaliDatePicker } from '@/components/jalali-date-picker'
import { ProductRecentOrdersPopover, PAYMENT_LABELS, type ZSupplier, type ZProduct } from './orders'
import {
  Store, Phone, User, PlusCircle, Pencil, ArrowRight, ShoppingCart, Package,
  Loader2, Search, Truck, Building2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const SUPPLIER_TYPES: Record<string, string> = {
  MANUFACTURER: 'تولیدکننده',
  DISTRIBUTOR: 'پخش‌کننده',
  BOTH: 'تولید و پخش',
}

interface CompanyLite { id: string; name: string }

// ==================== QUICK ORDER DIALOG ====================

function QuickOrderDialog({
  product,
  supplier,
  user,
  onClose,
}: {
  product: ZProduct
  supplier: ZSupplier
  user: ClientUser
  onClose: () => void
}) {
  const { toast } = useToast()
  const canApprove = canUser(user.roles, PERMISSIONS.APPROVE_ORDERS)
  // friendly suggestion: if stock is below minimum, suggest enough to reach ~2× minimum
  const suggested = product.stock < product.minStock ? Math.max(1, Math.ceil(product.minStock * 2 - product.stock)) : 1
  const [qty, setQty] = React.useState(suggested)
  const [deliveryDate, setDeliveryDate] = React.useState(addDaysJalali(todayJalali(), 1))
  const [paymentType, setPaymentType] = React.useState(supplier.paymentType === 'CASH_ON_DELIVERY' ? 'CASH_ON_DELIVERY' : 'CHEQUE')
  const [busy, setBusy] = React.useState(false)

  async function submit() {
    setBusy(true)
    try {
      const created = await api.post<{ number: number; status: string }>('/api/orders', {
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: qty, unitPrice: product.cost, sellPrice: product.price }],
        deliveryDate,
        paymentType,
      })
      toast({
        title: 'سفارش ثبت شد 🎉',
        description:
          created.status === 'PENDING_APPROVAL'
            ? `سفارش ${toFaDigits(created.number)} برای تأیید مدیر فروشگاه ارسال شد`
            : `سفارش ${toFaDigits(created.number)} — ${created.status === 'APPROVED' ? 'تأیید و ثبت شد' : 'ذخیره شد'}`,
      })
      onClose()
    } catch (e) {
      toast({ title: 'خطا در ثبت سفارش', description: e instanceof Error ? e.message : '', variant: 'destructive' })
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="size-5 text-olive" />
            سفارش سریع — {product.name}
          </DialogTitle>
          <DialogDescription className="text-xs">
            سفارش از «{supplier.name}» — {canApprove ? 'با ثبت شما مستقیم تأیید می‌شود' : 'پس از ثبت، برای تأیید به مدیر فروشگاه می‌رود'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-2xl bg-accent/50 border border-gold/20 p-3 flex items-center justify-between">
            <div>
              <StockBadge stock={product.stock} minStock={product.minStock} unit={product.unit} />
              <div className="text-xs text-muted-foreground mt-1.5 tabular-nums">قیمت خرید: <b className="text-foreground">{formatMoney(product.cost)}</b> تومان</div>
            </div>
            {/* qty stepper */}
            <div className="flex items-center gap-1" dir="ltr">
              <button type="button" aria-label="افزودن" className="size-11 rounded-xl bg-olive text-white font-black text-lg flex items-center justify-center active:scale-90 transition-transform" onClick={() => setQty((q) => q + 1)}>+</button>
              <div className="w-16 h-11 rounded-xl border border-gold/30 bg-card flex items-center justify-center font-bold tabular-nums">{toFaDigits(qty)}</div>
              <button type="button" aria-label="کاهش" disabled={qty <= 1} className="size-11 rounded-xl border border-gold/30 bg-card font-black text-lg flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold mb-1.5 block">📅 تاریخ تحویل</label>
            <JalaliDatePicker value={deliveryDate} onChange={setDeliveryDate} />
          </div>

          <div>
            <label className="text-xs font-bold mb-1.5 block">💳 نحوه پرداخت</label>
            <div className="grid grid-cols-2 gap-2">
              {(['CASH_ON_DELIVERY', 'CHEQUE'] as const).map((pt) => (
                <button
                  key={pt}
                  type="button"
                  onClick={() => setPaymentType(pt)}
                  className={cn('h-11 rounded-xl border-2 text-xs font-bold transition-all active:scale-95', paymentType === pt ? 'bg-olive text-white border-olive' : 'bg-card border-gold/25 hover:border-gold/60')}
                >
                  {PAYMENT_LABELS[pt]}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-olive/10 border border-olive/30 p-3 flex items-center justify-between text-sm font-bold">
            <span>مبلغ تقریبی</span>
            <Money value={qty * product.cost} className="text-olive font-black" />
          </div>

          <Button className="w-full h-12 text-base bg-olive hover:bg-olive/90 text-white" onClick={submit} disabled={busy || qty <= 0}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : <><Truck className="size-5" /> ثبت سفارش</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ==================== SUPPLIER MANAGE DIALOG ====================

interface SupplierForm {
  name: string
  phone: string
  contactName: string
  type: string
  paymentType: string
  notes: string
  companyIds: string[]
}

const EMPTY_FORM: SupplierForm = { name: '', phone: '', contactName: '', type: 'DISTRIBUTOR', paymentType: 'CHEQUE', notes: '', companyIds: [] }

function SupplierManageDialog({
  editSupplier,
  companies,
  onClose,
  onSaved,
}: {
  editSupplier: ZSupplier | null
  companies: CompanyLite[]
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [form, setForm] = React.useState<SupplierForm>(EMPTY_FORM)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (editSupplier) {
      setForm({
        name: editSupplier.name,
        phone: editSupplier.phone || '',
        contactName: editSupplier.contactName || '',
        type: editSupplier.type || 'DISTRIBUTOR',
        paymentType: editSupplier.paymentType,
        notes: editSupplier.notes || '',
        companyIds: editSupplier.companies.map((c) => c.id),
      })
    } else {
      setForm(EMPTY_FORM)
    }
  }, [editSupplier])

  async function save() {
    setBusy(true)
    try {
      if (editSupplier) {
        await api.patch('/api/suppliers', { id: editSupplier.id, ...form })
        toast({ title: 'تأمین‌کننده به‌روزرسانی شد ✅' })
      } else {
        await api.post('/api/suppliers', form)
        toast({ title: 'تأمین‌کننده جدید ثبت شد 🎉', description: form.name })
      }
      onSaved()
      onClose()
    } catch (e) {
      toast({ title: 'خطا در ذخیره', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const valid = form.name.trim().length > 1

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[92dvh] overflow-y-auto nice-scrollbar">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="size-5 text-olive" />
            {editSupplier ? `ویرایش «${editSupplier.name}»` : 'تأمین‌کننده جدید'}
          </DialogTitle>
          <DialogDescription className="text-xs">اطلاعات تماس و شرکت‌هایی که تأمین می‌کند را وارد کنید.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs font-bold mb-1.5 block">نام تأمین‌کننده / نمایندگی *</label>
              <Input className="h-11 bg-card" placeholder="مثلاً: پخش سپهر کرمان" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-bold mb-1.5 block">تلفن</label>
              <Input className="h-11 bg-card" dir="ltr" placeholder="034-XXXXXXX" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-bold mb-1.5 block">نام رابط</label>
              <Input className="h-11 bg-card" placeholder="مثلاً: آقای رضایی" value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold mb-1.5 block">نوع فعالیت</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(SUPPLIER_TYPES).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, type: k }))}
                  className={cn('h-11 rounded-xl border-2 text-xs font-bold transition-all active:scale-95', form.type === k ? 'bg-olive text-white border-olive' : 'bg-card border-gold/25 hover:border-gold/60')}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold mb-1.5 block">نحوه پرداخت پیش‌فرض</label>
            <div className="grid grid-cols-2 gap-2">
              {(['CASH_ON_DELIVERY', 'CHEQUE'] as const).map((pt) => (
                <button
                  key={pt}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, paymentType: pt }))}
                  className={cn('h-11 rounded-xl border-2 text-xs font-bold transition-all active:scale-95', form.paymentType === pt ? 'bg-olive text-white border-olive' : 'bg-card border-gold/25 hover:border-gold/60')}
                >
                  {PAYMENT_LABELS[pt]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold mb-1.5 block">شرکت‌های تحت پوشش</label>
            <div className="flex flex-wrap gap-2 rounded-2xl border border-gold/25 bg-card p-3">
              {companies.map((c) => {
                const on = form.companyIds.includes(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, companyIds: on ? f.companyIds.filter((x) => x !== c.id) : [...f.companyIds, c.id] }))}
                    className={cn('rounded-full border-2 px-3 h-9 text-xs font-bold transition-all active:scale-95', on ? 'bg-olive text-white border-olive' : 'bg-card border-gold/20 hover:border-gold/50')}
                  >
                    {on ? '✓ ' : '+ '}{c.name}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold mb-1.5 block">یادداشت (اختیاری)</label>
            <Textarea rows={2} className="bg-card" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>

          <Button className="w-full h-12 text-base bg-olive hover:bg-olive/90 text-white" onClick={save} disabled={busy || !valid}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : editSupplier ? 'ذخیره تغییرات' : 'ثبت تأمین‌کننده'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ==================== PRODUCT CARD (supplier detail) ====================

function SupplierProductCard({
  product,
  canOrder,
  onOrder,
}: {
  product: ZProduct
  canOrder: boolean
  onOrder: () => void
}) {
  const st = STOCK_STATUS[stockStatus(product.stock, product.minStock)]
  return (
    <div className={cn('rounded-2xl border bg-card p-3 flex flex-col gap-2 transition-shadow hover:shadow-md', product.stock <= product.minStock ? 'border-red-200' : 'border-gold/20')}>
      <div className="flex gap-3">
        {product.image ? (
          <img src={product.image} alt={product.name} className="size-16 rounded-xl object-cover border border-gold/25 shrink-0" />
        ) : (
          <div className="size-16 rounded-xl bg-accent flex items-center justify-center text-2xl shrink-0" aria-hidden>📦</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm leading-snug line-clamp-2">{product.name}</div>
          <div className="mt-1.5"><StockBadge stock={product.stock} minStock={product.minStock} unit={product.unit} /></div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-gold/10">
        <div>
          <div className="text-sm font-extrabold tabular-nums">{formatMoney(product.price)} <span className="text-[10px] font-medium opacity-60">تومان</span></div>
          <div className="text-[10px] text-muted-foreground">هزینه خرید: {formatMoney(product.cost)} ت</div>
        </div>
        {canOrder && (
          <Button size="sm" className={cn('h-10 gap-1.5 text-white', product.stock <= product.minStock ? 'bg-red-600 hover:bg-red-700' : 'bg-olive hover:bg-olive/90')} onClick={onOrder}>
            <ShoppingCart className="size-4" />
            سفارش
          </Button>
        )}
      </div>
      <ProductRecentOrdersPopover productId={product.id} />
      {/* sr summary for a11y */}
      <span className="sr-only">{`${product.name}، موجودی ${Math.round(product.stock)} ${product.unit}، وضعیت ${st.label}، قیمت فروش ${Math.round(product.price)} تومان`}</span>
    </div>
  )
}

// ==================== MAIN SECTION ====================

export function SuppliersSection({ user }: { user: ClientUser }) {
  const { toast } = useToast()
  const canManage = canUser(user.roles, PERMISSIONS.MANAGE_SUPPLIERS) || canUser(user.roles, PERMISSIONS.MANAGE_ORDERS)
  const canOrder = canUser(user.roles, PERMISSIONS.MANAGE_ORDERS)

  const [data, setData] = React.useState<{ suppliers: ZSupplier[]; companies: CompanyLite[] } | null>(null)
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [companyFilter, setCompanyFilter] = React.useState('ALL')
  const [search, setSearch] = React.useState('')
  const [manageOpen, setManageOpen] = React.useState(false)
  const [editSupplier, setEditSupplier] = React.useState<ZSupplier | null>(null)
  const [quickProduct, setQuickProduct] = React.useState<{ product: ZProduct; supplier: ZSupplier } | null>(null)
  const [reloadKey, setReloadKey] = React.useState(0)

  React.useEffect(() => {
    let alive = true
    api.get<{ suppliers: ZSupplier[]; companies: CompanyLite[] }>('/api/suppliers?withStats=1')
      .then((d) => { if (alive) setData(d) })
      .catch((e) => {
        if (!alive) return
        toast({ title: 'خطا در دریافت تأمین‌کنندگان', description: e instanceof Error ? e.message : '', variant: 'destructive' })
        setData({ suppliers: [], companies: [] })
      })
    return () => { alive = false }
  }, [reloadKey])

  const load = React.useCallback(() => setReloadKey((k) => k + 1), [])

  const supplier = data?.suppliers.find((s) => s.id === openId) || null

  const detailProducts: ZProduct[] = React.useMemo(() => {
    if (!supplier) return []
    const map = new Map<string, ZProduct>()
    for (const c of supplier.companies) {
      if (companyFilter !== 'ALL' && c.id !== companyFilter) continue
      for (const p of c.products) map.set(p.id, p)
    }
    const q = search.trim()
    let list = [...map.values()]
    if (q) list = list.filter((p) => p.name.includes(q) || (p.barcode || '').includes(q))
    // low-stock first — needs attention on top
    return list.sort((a, b) => a.stock / Math.max(a.minStock, 1) - b.stock / Math.max(b.minStock, 1))
  }, [supplier, companyFilter, search])

  const visibleSuppliers = React.useMemo(() => {
    if (!data) return []
    const q = search.trim()
    if (!q || supplier) return data.suppliers
    return data.suppliers.filter((s) => s.name.includes(q) || (s.contactName || '').includes(q) || s.companies.some((c) => c.name.includes(q)))
  }, [data, search, supplier])

  // ---- supplier detail sub-view ----
  if (supplier) {
    return (
      <div className="animate-fade-up">
        <Button variant="ghost" className="h-11 mb-2 gap-1.5" onClick={() => { setOpenId(null); setCompanyFilter('ALL'); setSearch('') }}>
          <ArrowRight className="size-4" /> بازگشت به لیست تأمین‌کنندگان
        </Button>

        <GlowCard className="p-4 md:p-5 mb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black flex items-center gap-2">
                <Store className="size-5 text-olive" />
                {supplier.name}
              </h2>
              <div className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-3">
                {supplier.phone && <span className="flex items-center gap-1" dir="ltr"><Phone className="size-3.5" />{toFaDigits(supplier.phone)}</span>}
                {supplier.contactName && <span className="flex items-center gap-1"><User className="size-3.5" />{supplier.contactName}</span>}
                <span>{SUPPLIER_TYPES[supplier.type || 'DISTRIBUTOR']}</span>
                <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-bold text-[#8a6d1f]">💳 {PAYMENT_LABELS[supplier.paymentType]}</span>
              </div>
              {typeof supplier.orderCount === 'number' && (
                <div className="text-xs text-muted-foreground mt-1.5 tabular-nums">
                  {toFaDigits(supplier.orderCount)} سفارش ثبت‌شده • مجموع خرید: {formatMoney(supplier.totalSpend || 0)} تومان
                </div>
              )}
            </div>
            {canManage && (
              <Button variant="outline" className="h-10 border-gold/40 gap-1.5" onClick={() => { setEditSupplier(supplier); setManageOpen(true) }}>
                <Pencil className="size-4" /> ویرایش تأمین‌کننده
              </Button>
            )}
          </div>
          {supplier.notes && <div className="mt-2 text-sm bg-gold/10 rounded-xl px-3 py-2">📝 {supplier.notes}</div>}
          <OrnamentDivider />
          <div className="flex flex-wrap gap-2" role="group" aria-label="فیلتر شرکت">
            <button
              onClick={() => setCompanyFilter('ALL')}
              className={cn('rounded-full border-2 px-3.5 h-9 text-xs font-bold transition-all active:scale-95', companyFilter === 'ALL' ? 'bg-olive text-white border-olive' : 'bg-card border-gold/20 hover:border-gold/50')}
            >
              🧺 همه محصولات
            </button>
            {supplier.companies.map((c) => (
              <button
                key={c.id}
                onClick={() => setCompanyFilter(c.id)}
                className={cn('rounded-full border-2 px-3.5 h-9 text-xs font-bold transition-all active:scale-95', companyFilter === c.id ? 'bg-olive text-white border-olive' : 'bg-card border-gold/20 hover:border-gold/50')}
              >
                <Building2 className="inline size-3.5 ml-1" aria-hidden />{c.name}
                <span className="opacity-70 mr-1">({toFaDigits(c.products.length)})</span>
              </button>
            ))}
          </div>
        </GlowCard>

        <div className="relative mb-4">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden />
          <Input className="h-11 pr-9 bg-card" placeholder="جستجو در کالاهای این تأمین‌کننده..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="جستجوی کالا" />
        </div>

        {detailProducts.length === 0 ? (
          <EmptyState icon={<Package className="size-6" />} title="کالایی یافت نشد" description="برای این تأمین‌کننده/شرکت هنوز کالایی ثبت نشده یا فیلتر را تغییر دهید." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {detailProducts.map((p) => (
              <SupplierProductCard key={p.id} product={p} canOrder={canOrder} onOrder={() => setQuickProduct({ product: p, supplier })} />
            ))}
          </div>
        )}

        {quickProduct && (
          <QuickOrderDialog product={quickProduct.product} supplier={quickProduct.supplier} user={user} onClose={() => setQuickProduct(null)} />
        )}
        {manageOpen && (
          <SupplierManageDialog editSupplier={supplier} companies={data?.companies || []} onClose={() => setManageOpen(false)} onSaved={load} />
        )}
      </div>
    )
  }

  // ---- suppliers list ----
  return (
    <div>
      <SectionHeader
        title="تأمین‌کنندگان"
        subtitle={canOrder ? 'مشاهده کالاها و ثبت سفارش سریع از هر تأمین‌کننده' : 'مشاهده تأمین‌کنندگان و کالاهای آن‌ها'}
        actions={
          canManage && (
            <Button size="lg" className="h-12 text-base bg-olive hover:bg-olive/90 text-white shadow-lg shadow-olive/25 gap-2" onClick={() => { setEditSupplier(null); setManageOpen(true) }}>
              <PlusCircle className="size-5" />
              تأمین‌کننده جدید
            </Button>
          )
        }
      />

      <div className="relative mb-4">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden />
        <Input className="h-11 pr-9 bg-card" placeholder="جستجو: نام تأمین‌کننده، رابط یا شرکت..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="جستجوی تأمین‌کننده" />
      </div>

      {data === null ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
        </div>
      ) : visibleSuppliers.length === 0 ? (
        <EmptyState
          icon={<Store className="size-6" />}
          title={data.suppliers.length === 0 ? 'هنوز تأمین‌کننده‌ای ثبت نشده' : 'نتیجه‌ای پیدا نشد'}
          description={data.suppliers.length === 0 ? 'با دکمه «تأمین‌کننده جدید» اولین تأمین‌کننده را اضافه کنید 🌿' : 'عبارت جستجو را تغییر دهید.'}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleSuppliers.map((s) => (
            <GlowCard key={s.id} interactive>
              <button onClick={() => setOpenId(s.id)} className="w-full text-right p-4 focus:outline-none" aria-label={`مشاهده کالاهای ${s.name}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="font-extrabold flex items-center gap-2">
                    <Store className="size-4 text-gold shrink-0" />
                    {s.name}
                  </div>
                  {canManage && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`ویرایش ${s.name}`}
                      className="size-8 -m-1 rounded-lg text-muted-foreground hover:text-olive hover:bg-accent flex items-center justify-center shrink-0"
                      onClick={(e) => { e.stopPropagation(); setEditSupplier(s); setManageOpen(true) }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setEditSupplier(s); setManageOpen(true) } }}
                    >
                      <Pencil className="size-3.5" />
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {s.phone && <span className="flex items-center gap-1" dir="ltr"><Phone className="size-3" />{toFaDigits(s.phone)}</span>}
                  {s.contactName && <span className="flex items-center gap-1"><User className="size-3" />{s.contactName}</span>}
                </div>
                <div className="flex flex-wrap gap-1 mt-2.5">
                  {s.companies.slice(0, 4).map((c) => (
                    <span key={c.id} className="rounded-full bg-olive/10 text-olive px-2 py-0.5 text-[10px] font-bold">{c.name}</span>
                  ))}
                  {s.companies.length > 4 && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold">+{toFaDigits(s.companies.length - 4)}</span>}
                </div>
                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-gold/15 text-xs">
                  <span className="text-muted-foreground">
                    {toFaDigits(s.companies.reduce((n, c) => n + c.products.length, 0))} کالا
                    {typeof s.orderCount === 'number' && s.orderCount > 0 && <> • {toFaDigits(s.orderCount)} سفارش</>}
                  </span>
                  <span className="rounded-full bg-gold/15 text-[#8a6d1f] font-bold px-2 py-0.5">{PAYMENT_LABELS[s.paymentType]}</span>
                </div>
              </button>
            </GlowCard>
          ))}
        </div>
      )}

      {manageOpen && (
        <SupplierManageDialog
          editSupplier={editSupplier}
          companies={data?.companies || []}
          onClose={() => setManageOpen(false)}
          onSaved={load}
        />
      )}
      {quickProduct && (
        <QuickOrderDialog product={quickProduct.product} supplier={quickProduct.supplier} user={user} onClose={() => setQuickProduct(null)} />
      )}
    </div>
  )
}
