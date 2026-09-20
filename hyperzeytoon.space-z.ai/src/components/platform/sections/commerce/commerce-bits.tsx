'use client'

// Shared building blocks for the commerce sections (orders/deliveries/accounting/payments)
import * as React from 'react'
import { api } from '@/lib/api'
import { money, toFaDigits, formatJalali, formatJalaliDateTime, isoDay, addDays } from '@/lib/jalali'
import { cn } from '@/lib/utils'
import type { OrderHistoryDTO, OrderItemDTO } from '@/lib/types'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

// ---------- item status catalog (delivery/inventory colors) ----------
export const ITEM_STATUSES = [
  { key: 'OK', label: 'سالم', color: '#3E7C59' },
  { key: 'MISSING', label: 'ناقص', color: '#B33A3A' },
  { key: 'REJECTED', label: 'رد شده', color: '#7A1F1F' },
  { key: 'CORRECTED', label: 'اصلاح قیمت', color: '#B07D2B' },
  { key: 'PENDING', label: 'در انتظار بررسی', color: '#8A8F98' },
] as const

export function itemStatusInfo(key: string) {
  return ITEM_STATUSES.find((s) => s.key === key) ?? ITEM_STATUSES[4]
}

export function ItemStatusBadge({ status, className }: { status: string; className?: string }) {
  const info = itemStatusInfo(status)
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap', className)}
      style={{ backgroundColor: `${info.color}1a`, color: info.color, border: `1px solid ${info.color}55` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: info.color }} />
      {info.label}
    </span>
  )
}

// ---------- money ----------
export function Toman({ v, className, bold }: { v: number | null | undefined; className?: string; bold?: boolean }) {
  return (
    <span className={cn('num whitespace-nowrap', bold && 'font-bold', className)}>
      {money(v)} <span className="text-[0.75em] text-muted-foreground">تومان</span>
    </span>
  )
}

// ---------- catalog bundle (wizard + product history) ----------
export interface CatalogCompany {
  id: string
  name: string
  kind: string
}
export interface CatalogProvider {
  id: string
  name: string
  phone?: string | null
  kind: string // DIRECT | DISTRIBUTOR
  color?: string
  paymentTermsDays?: number | null // agreed cheque window (برنامه‌ریز چک / wizard hint)
  companies: CatalogCompany[]
}
export interface CatalogProduct {
  id: string
  name: string
  altName?: string | null
  category: string
  brand?: string | null
  unit: string
  sellPrice: number
  buyPrice: number
  taxRate?: number
  stock: number
  minStock: number
  image?: string | null
  status?: string
  barcodes: { id: string; code: string; isPrimary: boolean }[]
}
export interface CatalogBundle {
  providers: CatalogProvider[]
  products: CatalogProduct[]
  sales30: Record<string, { qty: number; amount: number }>
  holidays: { date: string; name: string }[]
  recentOrders: {
    id: string
    code: string
    createdAt: string
    receivingDate: string
    items: { productId?: string | null; name: string; qty: number }[]
  }[]
}

let catalogPromise: Promise<CatalogBundle> | null = null

export function loadCatalog(): Promise<CatalogBundle> {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const base = await api<CatalogBundle>('/api/orders/context')
      // canonical endpoints (products/providers modules) — used when available
      try {
        const [provs, prods] = await Promise.all([
          api<CatalogProvider[]>('/api/providers'),
          api<CatalogProduct[]>('/api/products'),
        ])
        if (Array.isArray(provs) && provs.length > 0) base.providers = provs
        if (Array.isArray(prods) && prods.length > 0) base.products = prods
      } catch {
        /* fallback bundle already complete */
      }
      return base
    })().catch((e) => {
      catalogPromise = null
      throw e
    })
  }
  return catalogPromise
}

export function useCatalog() {
  const [data, setData] = React.useState<CatalogBundle | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const reload = React.useCallback(() => {
    setLoading(true)
    setError(null)
    loadCatalog()
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : 'خطا در دریافت اطلاعات'))
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    reload()
  }, [reload])

  return { data, loading, error, reload }
}

// ---------- holiday helpers (client side, mirrors server rule) ----------
export function holidaySetOf(bundle: CatalogBundle | null): Set<string> {
  return new Set((bundle?.holidays ?? []).map((h) => h.date))
}

export function isClosedDay(d: Date, holidaySet: Set<string>): boolean {
  return d.getDay() === 5 || holidaySet.has(isoDay(d))
}

export function suggestOpenDay(d: Date, holidaySet: Set<string>): Date {
  let cur = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  for (let i = 0; i < 30; i++) {
    cur = addDays(cur, -1)
    if (!isClosedDay(cur, holidaySet)) return cur
  }
  return addDays(d, -1)
}

// ---------- overdue order check ----------
export function isOverdueOrder(o: { receivingDate: string; status: string }): boolean {
  return isoDay(o.receivingDate) < isoDay(new Date()) && ['APPROVED', 'SENT'].includes(o.status)
}

// ---------- row totals (mirrors server calc) ----------
export function rowCalc(qty: number, price: number, discount = 0) {
  const base = Math.max(0, Math.round((Number(qty) || 0) * (Number(price) || 0)) - (Number(discount) || 0))
  const vat = Math.round(base * 0.09)
  return { base, vat, total: base + vat }
}

// ---------- product history popover (sales last 30d + previous orders) ----------
interface ProductHistoryAPI {
  totals: { qty: number; amount: number }
  recentOrders: {
    orderId: string
    code: string
    providerName: string
    receivingDate: string
    status: string
    qty: number
    unitPrice: number
    total: number
  }[]
}

export function ProductHistoryPopover({
  productId,
  name,
  bundle,
  compact = false,
}: {
  productId?: string | null
  name: string
  bundle?: CatalogBundle | null
  compact?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [apiData, setApiData] = React.useState<ProductHistoryAPI | null>(null)
  const [apiLoading, setApiLoading] = React.useState(false)
  const [apiFailed, setApiFailed] = React.useState(false)
  const own = useCatalog() // module-level cache shared across all popovers
  const data = bundle ?? own.data

  // fetch authoritative per-product history when opened (GET /api/products/[id])
  React.useEffect(() => {
    if (!open || !productId || apiData || apiFailed) return
    setApiLoading(true)
    api<ProductHistoryAPI>(`/api/products/${productId}`)
      .then((d) => setApiData(d))
      .catch(() => setApiFailed(true))
      .finally(() => setApiLoading(false))
  }, [open, productId, apiData, apiFailed])

  const fallbackSales = productId ? data?.sales30?.[productId] : undefined
  const fallbackOrders = React.useMemo(() => {
    if (!data || !productId) return []
    return data.recentOrders
      .filter((o) => o.items.some((i) => i.productId === productId))
      .map((o) => ({ code: o.code, date: o.receivingDate ?? o.createdAt, qty: o.items.find((i) => i.productId === productId)?.qty ?? 0 }))
      .slice(0, 8)
  }, [data, productId])

  const salesQty = apiData ? apiData.totals.qty : fallbackSales?.qty
  const salesAmount = apiData ? apiData.totals.amount : fallbackSales?.amount
  const pastOrders = apiData
    ? apiData.recentOrders.map((o) => ({ code: o.code, date: o.receivingDate, qty: o.qty }))
    : fallbackOrders

  if (!productId) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {compact ? (
          <button
            type="button"
            aria-label={`تاریخچه ${name}`}
            title="فروش و سفارش‌ها"
            className="h-9 w-9 shrink-0 rounded-lg border border-border bg-card text-sm hover:bg-accent touch-target transition-transform active:scale-90"
          >
            📋
          </button>
        ) : (
          <button
            type="button"
            aria-label={`فروش و سفارش‌های ${name}`}
            className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-bold text-primary hover:bg-accent touch-target whitespace-nowrap"
          >
            فروش و سفارش‌ها
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end">
        <p className="text-xs font-bold mb-2">فروش ۳۰ روز اخیر</p>
        {apiLoading && !apiData ? (
          <p className="text-xs text-muted-foreground py-2">در حال بارگذاری…</p>
        ) : salesQty !== undefined && salesAmount !== undefined ? (
          <div className="flex items-center gap-3 text-xs num mb-3">
            <span className="rounded-lg bg-accent px-2 py-1">{toFaDigits(Math.round(salesQty))} فروش</span>
            <span className="rounded-lg bg-accent px-2 py-1">{money(salesAmount)} تومان</span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground mb-3">فروشی در ۳۰ روز اخیر ثبت نشده</p>
        )}
        <p className="text-xs font-bold mb-1.5">سفارش‌های قبلی حاوی این کالا</p>
        {pastOrders.length === 0 ? (
          <p className="text-xs text-muted-foreground">سفارش قبلی ندارد</p>
        ) : (
          <div className="max-h-40 overflow-y-auto space-y-1.5 pl-1">
            {pastOrders.map((o) => (
              <div key={o.code} className="flex items-center justify-between text-xs rounded-lg border border-border px-2 py-1.5 bg-card/60">
                <span className="num font-bold text-primary">{o.code}</span>
                <span className="text-muted-foreground">{formatJalali(o.date)}</span>
                <span className="num">{toFaDigits(Math.round(o.qty))}</span>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ---------- vertical status timeline ----------
export function StatusTimeline({ history }: { history: OrderHistoryDTO[] }) {
  const entries = [...history].reverse()
  if (entries.length === 0) return <p className="text-xs text-muted-foreground">تاریخچه‌ای ثبت نشده</p>
  return (
    <div className="relative pr-4">
      <span className="absolute right-[7px] top-2 bottom-2 w-px bg-border" aria-hidden />
      <div className="space-y-3.5">
        {entries.map((h) => (
          <div key={h.id} className="relative">
            <span className="absolute -right-4 top-1.5 h-3 w-3 rounded-full border-2 border-background bg-primary shadow-sm" aria-hidden />
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-xs font-bold">{h.action}</span>
              <span className="text-[11px] text-muted-foreground">{h.userName}</span>
              <span className="text-[11px] num text-muted-foreground ms-auto">{formatJalaliDateTime(h.createdAt)}</span>
            </div>
            {h.detail && <p className="text-xs text-muted-foreground mt-0.5 leading-5">{h.detail}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- items table (detail dialog) ----------
export function OrderItemsTable({
  items,
  bundle,
  showCorrections = true,
}: {
  items: OrderItemDTO[]
  bundle?: CatalogBundle | null
  showCorrections?: boolean
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-xs min-w-[640px]">
        <thead>
          <tr className="bg-accent/60 text-muted-foreground">
            <th className="px-2 py-2 text-right font-medium">کالا</th>
            <th className="px-2 py-2 text-center font-medium">تعداد</th>
            <th className="px-2 py-2 text-center font-medium">قیمت واحد</th>
            <th className="px-2 py-2 text-center font-medium">تخفیف</th>
            <th className="px-2 py-2 text-center font-medium">ارزش افزوده</th>
            <th className="px-2 py-2 text-center font-medium">جمع</th>
            <th className="px-2 py-2 text-center font-medium">تحویل</th>
            <th className="px-2 py-2 text-center font-medium">وضعیت</th>
            <th className="px-2 py-2 text-center font-medium">📋</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const corrected = showCorrections && (it.itemStatus === 'CORRECTED' || it.itemStatus === 'MISSING' || it.itemStatus === 'REJECTED')
            return (
              <tr key={it.id} className={cn('border-t border-border', corrected && 'bg-saffron/10')}>
                <td className="px-2 py-2 font-medium max-w-44">
                  <span className="line-clamp-1">{it.name}</span>
                  {it.barcode && <span className="num text-[10px] text-muted-foreground block">{it.barcode}</span>}
                </td>
                <td className="px-2 py-2 text-center num">{toFaDigits(Math.round(it.qty))}</td>
                <td className="px-2 py-2 text-center num">{money(it.unitPrice)}</td>
                <td className="px-2 py-2 text-center num">{it.discount ? money(it.discount) : '—'}</td>
                <td className="px-2 py-2 text-center num">{money(it.vat)}</td>
                <td className="px-2 py-2 text-center num font-bold">{money(it.total)}</td>
                <td className="px-2 py-2 text-center num">
                  {it.deliveredQty !== null && it.deliveredQty !== undefined ? toFaDigits(Math.round(it.deliveredQty)) : '—'}
                </td>
                <td className="px-2 py-2 text-center">
                  <ItemStatusBadge status={it.itemStatus} />
                </td>
                <td className="px-2 py-2 text-center">
                  <ProductHistoryPopover productId={it.productId} name={it.name} bundle={bundle} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
