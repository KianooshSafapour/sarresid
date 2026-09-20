'use client'

// Multi-step order wizard: provider → products → review (also used for editing)
import * as React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Loader2, Minus, Plus, Check, ArrowLeft, ArrowRight, Ban } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { money, toFaDigits, isoDay, formatJalaliFull, formatJalali, addDays } from '@/lib/jalali'
import { StockIndicator, OrnateDivider } from '@/components/platform/ui/shared'
import { JalaliDatePicker } from '@/components/platform/ui/jalali-date-picker'
import { useApp } from '@/store/app'
import type { OrderDTO } from '@/lib/types'
import {
  useCatalog, holidaySetOf, isClosedDay, suggestOpenDay, rowCalc, ProductHistoryPopover,
  type CatalogBundle, type CatalogProduct,
} from './commerce-bits'

interface CartLine {
  qty: number
  unitPrice: number
}

// prefill contract from catalog sections (Providers quick-order / Inventory suggested order)
interface PrefillData {
  providerId?: string
  items: { productId: string; qty: number }[]
}

function readPrefillFromStorage(): PrefillData | null {
  try {
    const providerId = localStorage.getItem('hz_prefill_provider')
    const rawItems = localStorage.getItem('hz_prefill_items')
    if (!providerId && !rawItems) return null
    const items = rawItems ? (JSON.parse(rawItems) as { productId: string; qty: number }[]) : []
    if (providerId) localStorage.removeItem('hz_prefill_provider')
    if (rawItems) localStorage.removeItem('hz_prefill_items')
    return { providerId: providerId ?? undefined, items: Array.isArray(items) ? items.filter((i) => i?.productId) : [] }
  } catch {
    return null
  }
}

const STEPS = ['انتخاب تأمین‌کننده', 'افزودن کالا', 'بازبینی و ثبت']

export function NewOrderWizard({
  open,
  onOpenChange,
  onSaved,
  editOrder,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSaved: () => void
  editOrder?: OrderDTO | null
}) {
  const user = useApp((s) => s.user)
  const { data: catalog, loading } = useCatalog()
  const [step, setStep] = React.useState(0)
  const [saving, setSaving] = React.useState(false)
  const [bump, setBump] = React.useState<string | null>(null)

  const [providerId, setProviderId] = React.useState<string | null>(null)
  const [companyFilter, setCompanyFilter] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [category, setCategory] = React.useState<string | null>(null)
  const [cart, setCart] = React.useState<Record<string, CartLine>>({})

  const tomorrow = React.useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d
  }, [])
  const [receivingDate, setReceivingDate] = React.useState<Date | null>(tomorrow)
  const [paymentType, setPaymentType] = React.useState<'CASH' | 'CHEQUE'>('CHEQUE')
  const [note, setNote] = React.useState('')

  // auto-prefill of the cheque note from the provider's payment terms (شرایط پرداخت تأمین‌کننده)
  const noteTouched = React.useRef(false)
  const applyNote = (v: string) => {
    noteTouched.current = true
    setNote(v)
  }

  const holidaySet = React.useMemo(() => holidaySetOf(catalog), [catalog])

  const provider = catalog?.providers.find((p) => p.id === providerId) ?? null

  // پیشنهاد سررسید چک = تاریخ دریافت + شرایط پرداخت تأمین‌کننده، تعدیل‌شده به نزدیک‌ترین روز باز
  const suggestedChequeDue = React.useMemo(() => {
    if (!provider?.paymentTermsDays || !receivingDate) return null
    const base = addDays(receivingDate, provider.paymentTermsDays)
    return isClosedDay(base, holidaySet) ? suggestOpenDay(base, holidaySet) : base
  }, [provider, receivingDate, holidaySet])

  // pending prefill from catalog quick-order flows (applied once catalog is ready)
  const [prefill, setPrefill] = React.useState<PrefillData | null>(null)

  // reset / prefill on open
  React.useEffect(() => {
    if (!open) return
    setStep(0)
    setSaving(false)
    setSearch('')
    setCategory(null)
    setCompanyFilter(null)
    setBump(null)
    if (editOrder) {
      setProviderId(editOrder.providerId ?? null)
      const lines: Record<string, CartLine> = {}
      for (const it of editOrder.items) {
        if (it.productId) lines[it.productId] = { qty: it.qty, unitPrice: it.unitPrice }
      }
      setCart(lines)
      setReceivingDate(new Date(editOrder.receivingDate))
      setPaymentType(editOrder.paymentType === 'CASH' ? 'CASH' : 'CHEQUE')
      setNote(editOrder.note ?? '')
      setPrefill(null)
    } else {
      setCart({})
      const t = new Date()
      t.setDate(t.getDate() + 1)
      setReceivingDate(t)
      setPaymentType('CHEQUE')
      setNote('')
      setPrefill(readPrefillFromStorage())
    }
    noteTouched.current = false
  }, [open, editOrder])

  // apply prefill once the catalog (buy prices / providers) is available
  React.useEffect(() => {
    if (!open || !catalog || !prefill) return
    if (prefill.providerId && catalog.providers.some((p) => p.id === prefill.providerId)) {
      setProviderId(prefill.providerId)
    }
    if (prefill.items.length > 0) {
      setCart((prev) => {
        const next = { ...prev }
        for (const it of prefill.items) {
          const product = catalog.products.find((p) => p.id === it.productId)
          if (!product) continue
          next[product.id] = {
            qty: Math.max(1, Number(it.qty) || 1),
            unitPrice: next[product.id]?.unitPrice ?? product.buyPrice,
          }
        }
        return next
      })
    }
    setPrefill(null)
  }, [open, catalog, prefill])

  // prefill the cheque note when the selected provider has payment terms (new orders only)
  React.useEffect(() => {
    if (!open || editOrder) return
    if (!provider?.paymentTermsDays || !receivingDate || paymentType !== 'CHEQUE') return
    if (noteTouched.current) return
    setNote(
      `چک ${toFaDigits(provider.paymentTermsDays)} روزه — سررسید پیشنهادی: ${suggestedChequeDue ? formatJalali(suggestedChequeDue) : '—'}`
    )
  }, [open, editOrder, provider, receivingDate, paymentType, suggestedChequeDue])

  const categories = React.useMemo(() => {
    const set = new Set<string>()
    for (const p of catalog?.products ?? []) set.add(p.category)
    return Array.from(set).slice(0, 14)
  }, [catalog])

  const cartEntries = React.useMemo(() => {
    const out: { product: CatalogProduct; line: CartLine; row: ReturnType<typeof rowCalc> }[] = []
    for (const [pid, line] of Object.entries(cart)) {
      const product = catalog?.products.find((p) => p.id === pid)
      if (!product) continue
      out.push({ product, line, row: rowCalc(line.qty, line.unitPrice) })
    }
    return out
  }, [cart, catalog])

  const cartTotal = cartEntries.reduce((s, e) => s + e.row.total, 0)
  const cartBase = cartEntries.reduce((s, e) => s + e.row.base, 0)
  const cartVat = cartTotal - cartBase
  const itemsCount = Object.keys(cart).length

  const setQty = (p: CatalogProduct, qty: number) => {
    setCart((prev) => {
      const next = { ...prev }
      if (qty <= 0) delete next[p.id]
      else next[p.id] = { qty, unitPrice: next[p.id]?.unitPrice ?? p.buyPrice }
      return next
    })
    if (qty > 0) {
      setBump(p.id)
      setTimeout(() => setBump((b) => (b === p.id ? null : b)), 350)
    }
  }

  const setPrice = (p: CatalogProduct, price: number) => {
    setCart((prev) => {
      if (!prev[p.id]) return prev
      return { ...prev, [p.id]: { ...prev[p.id], unitPrice: price } }
    })
  }

  const canNext = step === 0 ? Boolean(providerId) : step === 1 ? itemsCount > 0 : true

  const submit = async () => {
    if (!provider || !receivingDate) {
      toast({ title: 'تأمین‌کننده و تاریخ دریافت لازم است', variant: 'destructive' })
      return
    }
    if (itemsCount === 0) {
      toast({ title: 'سبد خالی است', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const items = cartEntries.map((e) => ({
        productId: e.product.id,
        name: e.product.name,
        barcode: e.product.barcodes[0]?.code ?? null,
        unit: e.product.unit,
        qty: e.line.qty,
        unitPrice: e.line.unitPrice,
      }))
      const payload = {
        providerId: provider.id,
        providerName: provider.name,
        companyName: provider.companies[0]?.name ?? null,
        paymentType,
        receivingDate: receivingDate.toISOString(),
        note: note.trim() || undefined,
        items,
      }
      if (editOrder) {
        await api(`/api/orders/${editOrder.id}`, { method: 'PATCH', body: payload })
        toast({ title: 'سفارش ویرایش شد', description: payload.providerName })
      } else {
        const res = await api<{ success: boolean; order: OrderDTO }>('/api/orders', { body: payload })
        toast({ title: `سفارش ${res.order.code} ثبت شد`, description: 'برای تأیید به مدیر ارسال شد ✅' })
      }
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast({ title: 'خطا در ثبت سفارش', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v) }}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[92vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border shrink-0">
          <DialogTitle className="text-base md:text-lg flex items-center gap-2">
            {editOrder ? `ویرایش سفارش ${editOrder.code}` : 'سفارش خرید جدید'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {editOrder ? 'ردیف‌ها و اطلاعات سفارش را ویرایش کنید' : 'در سه گام: تأمین‌کننده، کالاها و بازبینی نهایی'}
          </DialogDescription>
          {/* step chips */}
          <div className="flex items-center gap-1.5 mt-3" role="tablist" aria-label="مراحل سفارش">
            {STEPS.map((label, i) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={step === i}
                onClick={() => { if (i <= step || canGo(i)) setStep(i) }}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition-colors touch-target',
                  step === i ? 'bg-primary text-primary-foreground' : i < step ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                )}
              >
                <span className={cn('h-5 w-5 rounded-full text-[10px] flex items-center justify-center num', step === i ? 'bg-white/25' : 'bg-background/60')}>
                  {i < step ? <Check className="h-3 w-3" /> : toFaDigits(i + 1)}
                </span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && !catalog ? (
            <div className="flex items-center justify-center py-16 gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> در حال دریافت اطلاعات…
            </div>
          ) : step === 0 ? (
            <ProviderStep
              catalog={catalog}
              providerId={providerId}
              onSelect={(id) => { setProviderId(id); setCompanyFilter(null) }}
              companyFilter={companyFilter}
              onCompanyFilter={setCompanyFilter}
              onNext={() => setStep(1)}
            />
          ) : step === 1 ? (
            <ProductsStep
              catalog={catalog}
              provider={provider}
              companyFilter={companyFilter}
              search={search}
              onSearch={setSearch}
              category={category}
              categories={categories}
              onCategory={setCategory}
              cart={cart}
              bump={bump}
              setQty={setQty}
              setPrice={setPrice}
            />
          ) : (
            <ReviewStep
              provider={provider}
              entries={cartEntries}
              receivingDate={receivingDate}
              onReceivingDate={setReceivingDate}
              holidaySet={holidaySet}
              paymentType={paymentType}
              onPaymentType={setPaymentType}
              note={note}
              onNote={applyNote}
              cartBase={cartBase}
              cartVat={cartVat}
              cartTotal={cartTotal}
              suggestedChequeDue={suggestedChequeDue}
            />
          )}
        </div>

        {/* sticky bottom bar */}
        <div className="shrink-0 border-t border-border bg-card/70 backdrop-blur px-4 py-3 flex items-center gap-2">
          <div className="text-xs leading-5">
            <span className="text-muted-foreground">{toFaDigits(itemsCount)} قلم • ارزش افزوده: </span>
            <span className="num text-muted-foreground">{money(cartVat)}</span>
            <span className="num font-bold text-base text-primary"> {money(cartTotal)}</span>{' '}
            <span className="text-muted-foreground">تومان</span>
          </div>
          <div className="ms-auto flex items-center gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" className="touch-target" onClick={() => setStep(step - 1)} disabled={saving}>
                <ArrowRight className="h-4 w-4" /> قبلی
              </Button>
            )}
            {step < 2 ? (
              <Button size="sm" className="touch-target" onClick={() => setStep(step + 1)} disabled={!canNext}>
                بعدی <ArrowLeft className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="sm" className="touch-target font-bold" onClick={submit} disabled={saving || itemsCount === 0 || !receivingDate}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {editOrder ? 'ذخیره ویرایش' : 'ثبت و ارسال برای تأیید'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )

  function canGo(i: number): boolean {
    if (i === 0) return true
    if (i === 1) return Boolean(providerId)
    return Boolean(providerId) && itemsCount > 0
  }
}

// ---------- step 1: provider ----------
function ProviderStep({
  catalog, providerId, onSelect, companyFilter, onCompanyFilter, onNext,
}: {
  catalog: CatalogBundle | null
  providerId: string | null
  onSelect: (id: string) => void
  companyFilter: string | null
  onCompanyFilter: (v: string | null) => void
  onNext: () => void
}) {
  const providers = catalog?.providers ?? []
  const selected = providers.find((p) => p.id === providerId)
  return (
    <div>
      <p className="text-sm font-bold mb-3">تأمین‌کننده را انتخاب کنید</p>
      {providers.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">تأمین‌کننده‌ای ثبت نشده است</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {providers.map((p) => {
            const active = p.id === providerId
            const direct = p.kind === 'DIRECT'
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p.id)}
                aria-pressed={active}
                className={cn(
                  'text-right rounded-2xl border p-4 transition-all touch-target bg-card hover:-translate-y-0.5',
                  active ? 'border-primary ring-2 ring-primary/30 bg-primary/5' : 'border-border'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sm">{p.name}</span>
                  {active && <Check className="h-4 w-4 text-primary shrink-0" />}
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <Badge className={cn('text-[10px]', direct ? 'bg-[#3E7C59]/15 text-[#3E7C59]' : 'bg-[#C9A227]/15 text-[#8a6f3c]')} variant="secondary">
                    {direct ? 'مستقیم' : 'واسطه'}
                  </Badge>
                  {p.paymentTermsDays != null && p.paymentTermsDays > 0 && (
                    <Badge variant="secondary" className="text-[10px] bg-[#3E7C59]/10 text-[#3E7C59] border border-[#3E7C59]/30" title="شرایط پرداخت تأمین‌کننده">
                      چک {toFaDigits(p.paymentTermsDays)} روزه
                    </Badge>
                  )}
                  {p.phone && <span className="num text-[11px] text-muted-foreground">☎ {toFaDigits(p.phone)}</span>}
                </div>
                {p.companies.length > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-2 line-clamp-1">شرکت‌ها: {p.companies.map((c) => c.name).join('، ')}</p>
                )}
              </button>
            )
          })}
        </div>
      )}

      {selected && selected.companies.length > 0 && (
        <div className="mt-4 rounded-xl border border-border p-3 bg-card/60">
          <p className="text-xs font-bold mb-2">فیلتر کالا بر اساس شرکت (اختیاری)</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onCompanyFilter(null)}
              className={cn('rounded-full px-3 py-1.5 text-xs border touch-target', !companyFilter ? 'bg-primary text-primary-foreground border-transparent' : 'bg-card')}
            >
              همه
            </button>
            {selected.companies.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onCompanyFilter(c.id)}
                className={cn('rounded-full px-3 py-1.5 text-xs border touch-target', companyFilter === c.id ? 'bg-primary text-primary-foreground border-transparent' : 'bg-card')}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <div className="mt-4 flex justify-end">
          <Button size="sm" className="touch-target" onClick={onNext}>
            مرحله بعد: افزودن کالا <ArrowLeft className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

// ---------- step 2: products ----------
function ProductsStep({
  catalog, provider, companyFilter, search, onSearch, category, categories, onCategory, cart, bump, setQty, setPrice,
}: {
  catalog: CatalogBundle | null
  provider: CatalogBundle['providers'][number] | null
  companyFilter: string | null
  search: string
  onSearch: (v: string) => void
  category: string | null
  categories: string[]
  onCategory: (v: string | null) => void
  cart: Record<string, CartLine>
  bump: string | null
  setQty: (p: CatalogProduct, qty: number) => void
  setPrice: (p: CatalogProduct, price: number) => void
}) {
  const products = catalog?.products ?? []
  const list = React.useMemo(() => {
    let l = products
    if (search.trim()) {
      const q = search.trim()
      l = l.filter((p) => p.name.includes(q) || (p.altName ?? '').includes(q) || (p.brand ?? '').includes(q) || p.barcodes.some((b) => b.code.includes(q)))
    }
    if (category) l = l.filter((p) => p.category === category)
    if (provider) {
      const compNames = provider.companies.map((c) => c.name)
      if (compNames.length > 0) {
        l = [...l].sort((a, b) => {
          const aM = compNames.some((n) => (a.brand ?? '').includes(n) || a.name.includes(n)) ? 0 : 1
          const bM = compNames.some((n) => (b.brand ?? '').includes(n) || b.name.includes(n)) ? 0 : 1
          return aM - bM
        })
      }
    }
    // company chip filter (from step 1) — brand/product-name token match, fallback keeps everything
    if (provider && companyFilter) {
      const comp = provider.companies.find((c) => c.id === companyFilter)
      if (comp) {
        const tokens = comp.name.split(/[\s()\-–_/،,.]+/).filter((t) => t.length >= 3)
        const matched = l.filter((p) => tokens.some((t) => (p.brand ?? '').includes(t) || p.name.includes(t)))
        if (matched.length > 0) l = matched
      }
    }
    return l.slice(0, 60)
  }, [products, search, category, provider, companyFilter])

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="جستجوی کالا، برند یا بارکد…"
          className="touch-target bg-card"
          aria-label="جستجوی کالا"
        />
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        <button
          type="button"
          onClick={() => onCategory(null)}
          className={cn('rounded-full px-3 py-1.5 text-xs border touch-target', !category ? 'bg-primary text-primary-foreground border-transparent' : 'bg-card')}
        >
          همه دسته‌ها
        </button>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onCategory(c)}
            className={cn('rounded-full px-3 py-1.5 text-xs border touch-target', category === c ? 'bg-primary text-primary-foreground border-transparent' : 'bg-card')}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {list.map((p) => {
          const line = cart[p.id]
          const inCart = Boolean(line)
          return (
            <div
              key={p.id}
              className={cn(
                'rounded-2xl border p-3 bg-card transition-all duration-200',
                inCart ? 'border-primary ring-1 ring-primary/25' : 'border-border',
                bump === p.id && 'scale-[1.02] shadow-md'
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className="h-12 w-12 rounded-xl shrink-0 flex items-center justify-center font-bold text-white text-lg bg-accent text-primary"
                  style={p.image ? { backgroundImage: `url(${p.image})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                  aria-hidden
                >
                  {!p.image && p.name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold line-clamp-1">{p.name}</p>
                    <ProductHistoryPopover productId={p.id} name={p.name} bundle={catalog} compact />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                    <StockIndicator stock={p.stock} minStock={p.minStock} />
                    <span className="text-[11px] num text-muted-foreground">خرید: {money(p.buyPrice)}</span>
                    <span className="text-[11px] num text-muted-foreground">فروش: {money(p.sellPrice)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {/* qty stepper */}
                <div className="flex items-center gap-1 rounded-xl border border-border p-1">
                  <button
                    type="button"
                    aria-label="کاهش"
                    onClick={() => setQty(p, (line?.qty ?? 0) - 1)}
                    className="h-10 w-10 rounded-lg flex items-center justify-center hover:bg-accent touch-target active:scale-90 transition-transform"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    aria-label={`تعداد ${p.name}`}
                    value={line ? String(line.qty) : '۰'}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(/[^\d.]/g, ''))
                      setQty(p, isNaN(n) ? 0 : n)
                    }}
                    inputMode="decimal"
                    className="w-12 h-9 text-center text-sm font-bold num bg-transparent outline-none"
                  />
                  <button
                    type="button"
                    aria-label="افزایش"
                    onClick={() => setQty(p, (line?.qty ?? 0) + 1)}
                    className="h-10 w-10 rounded-lg flex items-center justify-center hover:bg-accent touch-target active:scale-90 transition-transform text-primary"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                {/* unit price override */}
                {inCart && (
                  <div className="flex items-center gap-1.5 animate-in fade-in">
                    <label className="text-[11px] text-muted-foreground whitespace-nowrap">قیمت واحد:</label>
                    <Input
                      value={String(line.unitPrice)}
                      onChange={(e) => setPrice(p, Number(e.target.value.replace(/[^\d.]/g, '')) || 0)}
                      inputMode="numeric"
                      className="h-10 w-28 num text-sm"
                      aria-label={`قیمت واحد ${p.name}`}
                    />
                  </div>
                )}

                {!inCart && (
                  <Button
                    size="sm"
                    className="ms-auto touch-target font-bold active:scale-90 transition-transform"
                    onClick={() => setQty(p, Math.max(1, line?.qty ?? 1))}
                    aria-label={`افزودن ${p.name} به سفارش`}
                  >
                    <Plus className="h-4 w-4" /> افزودن
                  </Button>
                )}

                {inCart && (
                  <span className="ms-auto text-xs num font-bold text-primary">
                    {money(rowCalc(line.qty, line.unitPrice).total)}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {list.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">کالایی یافت نشد</p>}
    </div>
  )
}

// ---------- step 3: review ----------
function ReviewStep({
  provider, entries, receivingDate, onReceivingDate, holidaySet, paymentType, onPaymentType,
  note, onNote, cartBase, cartVat, cartTotal, suggestedChequeDue,
}: {
  provider: CatalogBundle['providers'][number] | null
  entries: { product: CatalogProduct; line: CartLine; row: ReturnType<typeof rowCalc> }[]
  receivingDate: Date | null
  onReceivingDate: (d: Date | null) => void
  holidaySet: Set<string>
  paymentType: 'CASH' | 'CHEQUE'
  onPaymentType: (v: 'CASH' | 'CHEQUE') => void
  note: string
  onNote: (v: string) => void
  cartBase: number
  cartVat: number
  cartTotal: number
  suggestedChequeDue: Date | null
}) {
  const closed = receivingDate ? isClosedDay(receivingDate, holidaySet) : false
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs font-bold mb-2">📅 تاریخ دریافت</p>
          <JalaliDatePicker value={receivingDate} onChange={onReceivingDate} holidays={holidaySet} allowClear={false} />
          <p className="text-[11px] text-muted-foreground mt-1.5">{receivingDate ? formatJalaliFull(receivingDate) : 'انتخاب نشده'}</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs font-bold mb-2">💳 نوع پرداخت</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={paymentType === 'CASH'}
              onClick={() => onPaymentType('CASH')}
              className={cn('rounded-xl border py-3 text-sm font-bold touch-target', paymentType === 'CASH' ? 'border-primary bg-primary/10 text-primary' : 'bg-card')}
            >
              💵 نقدی هنگام تحویل
            </button>
            <button
              type="button"
              aria-pressed={paymentType === 'CHEQUE'}
              onClick={() => onPaymentType('CHEQUE')}
              className={cn('rounded-xl border py-3 text-sm font-bold touch-target', paymentType === 'CHEQUE' ? 'border-primary bg-primary/10 text-primary' : 'bg-card')}
            >
              🧾 چک
            </button>
          </div>
        </div>
      </div>

      {closed && (
        <div className="rounded-xl border p-3 bg-[#C9A227]/10 border-[#C9A227]/40 text-sm flex items-center gap-2" role="alert">
          <Ban className="h-4 w-4 shrink-0 text-[#8a6f3c]" />
          <span className="font-bold text-[#8a6f3c]">روز تعطیل — دریافت انجام نمی‌شود</span>
        </div>
      )}

      {/* payment terms of the selected provider (task 9-a) */}
      {provider?.paymentTermsDays != null && provider.paymentTermsDays > 0 && (
        <div className="rounded-xl border border-[#3E7C59]/40 bg-[#3E7C59]/10 p-3 space-y-1" role="note">
          <p className="text-xs font-bold text-[#3E7C59] flex items-center gap-1.5">
            <Check className="h-4 w-4" />
            شرایط پرداخت تأمین‌کننده: چک {toFaDigits(provider.paymentTermsDays)} روزه
          </p>
          {suggestedChequeDue && (
            <p className="text-[11px] text-muted-foreground leading-5">
              سررسید پیشنهادی چک = تاریخ دریافت + {toFaDigits(provider.paymentTermsDays)} روز، تعدیل‌شده به نزدیک‌ترین روز باز:{' '}
              <b className="num text-foreground">{formatJalaliFull(suggestedChequeDue)}</b>
            </p>
          )}
        </div>
      )}

      <Textarea value={note} onChange={(e) => onNote(e.target.value)} placeholder="یادداشت سفارش (اختیاری)…" className="min-h-20" aria-label="یادداشت سفارش" />

      {/* summary */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="bg-accent/60 px-3 py-2 text-xs font-bold flex items-center justify-between">
          <span>بازبینی سفارش</span>
          <span className="text-muted-foreground font-normal">{provider?.name ?? '—'}</span>
        </div>
        <OrnateDivider className="!my-0 border-b border-border py-1.5 bg-card" />
        <div className="max-h-44 overflow-y-auto divide-y divide-border">
          {entries.map((e) => (
            <div key={e.product.id} className="flex items-center gap-2 px-3 py-2 text-xs">
              <span className="font-medium line-clamp-1 flex-1">{e.product.name}</span>
              <span className="num text-muted-foreground">{toFaDigits(Math.round(e.line.qty))} × {money(e.line.unitPrice)}</span>
              <span className="num font-bold w-28 text-left">{money(e.row.total)}</span>
            </div>
          ))}
        </div>
        <div className="bg-card px-3 py-2.5 text-xs space-y-1 border-t border-border">
          <div className="flex justify-between"><span className="text-muted-foreground">جمع کالاها</span><span className="num">{money(cartBase)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">ارزش افزوده (۹٪)</span><span className="num">{money(cartVat)}</span></div>
          <div className="flex justify-between font-bold text-sm pt-1 border-t border-border"><span>مبلغ نهایی</span><span className="num text-primary">{money(cartTotal)} تومان</span></div>
        </div>
      </div>
    </div>
  )
}
