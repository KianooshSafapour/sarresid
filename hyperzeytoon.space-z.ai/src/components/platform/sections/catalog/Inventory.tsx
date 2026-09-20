'use client'

import * as React from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/store/app'
import { SectionHeader, StatCard, EmptyState, LoadingBlock, StockIndicator } from '@/components/platform/ui/shared'
import { money, toFaDigits } from '@/lib/jalali'
import { STOCK_COLORS } from '@/lib/types'
import type { ProductDTO } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChipSelect } from '@/components/platform/ui/shared'
import { ToastAction } from '@/components/ui/toast'
import { useToast } from '@/hooks/use-toast'
import {
  Warehouse, AlertTriangle, PackageX, Boxes, Minus, Plus, Save, ShoppingCart, Loader2, Search, TrendingUp,
} from 'lucide-react'

interface CategoryRow {
  category: string
  totalItems: number
  totalStock: number
  lowCount: number
  value: number
}
interface InventoryData {
  products: ProductDTO[]
  byCategory: CategoryRow[]
  lowStock: ProductDTO[]
  outOfStock: number
  stockValue: number
  cover: Record<string, { avgDaily: number; daysCover: number; urgency: 'CRITICAL' | 'WARN' | 'SOON' | 'OK' } | null>
}

const BAR_COLORS = ['#3E7C59', '#C9A227', '#B07D2B', '#B33A3A', '#5E8C61', '#8A6F3C']

// days-of-cover badge — same urgency palette as the smart reorder engine
const COVER_COLORS: Record<string, string> = {
  CRITICAL: '#B33A3A', WARN: '#C9A227', SOON: '#B07D2B', OK: '#3E7C59',
}
function CoverBadge({ cover, name }: { cover: InventoryData['cover'][string]; name: string }) {
  if (!cover) return null
  const c = COVER_COLORS[cover.urgency] ?? COVER_COLORS.OK
  const label =
    cover.urgency === 'CRITICAL'
      ? 'بحرانی'
      : cover.urgency === 'WARN'
        ? 'کم'
        : cover.urgency === 'SOON'
          ? 'رو به اتمام'
          : 'سالم'
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold num whitespace-nowrap"
      style={{ backgroundColor: `${c}18`, color: c, border: `1px solid ${c}33` }}
      title={`پوشش فروش ${name}: ${cover.daysCover} روز با میانگین ${cover.avgDaily} فروش روزانه — وضعیت ${label}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${cover.urgency === 'CRITICAL' ? 'animate-pulse' : ''}`}
        style={{ backgroundColor: c }}
        aria-hidden
      />
      {toFaDigits(Math.round(cover.daysCover))} روز پوشش
    </span>
  )
}

export function Inventory() {
  const { toast } = useToast()
  const user = useApp((s) => s.user)
  const setSection = useApp((s) => s.setSection)
  const setQuickAction = useApp((s) => s.setQuickAction)
  const canEdit = !!user && (user.isManager || user.roleKeys.includes('inventory'))

  const [data, setData] = React.useState<InventoryData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [edits, setEdits] = React.useState<Record<string, { stock?: number; minStock?: number }>>({})
  const [savingBulk, setSavingBulk] = React.useState(false)
  const [rowSaving, setRowSaving] = React.useState<string | null>(null)

  const [search, setSearch] = React.useState('')
  const [category, setCategory] = React.useState<string | null>(null)
  const [syncingMin, setSyncingMin] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const d = await api<InventoryData>('/api/inventory')
      setData(d)
      setEdits({})
    } catch (e) {
      toast({ title: 'خطا در دریافت موجودی', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  React.useEffect(() => {
    load()
  }, [load])

  const current = (p: ProductDTO) => ({
    stock: edits[p.id]?.stock ?? p.stock,
    minStock: edits[p.id]?.minStock ?? p.minStock,
  })
  const setEdit = (id: string, patch: { stock?: number; minStock?: number }) =>
    setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }))

  const saveRow = async (id: string) => {
    const u = edits[id]
    if (!u) return
    setRowSaving(id)
    try {
      await api('/api/inventory', { method: 'PATCH', body: { updates: [{ id, ...u }] } })
      toast({ title: 'ذخیره شد' })
      await load()
    } catch (e) {
      toast({ title: 'خطا در ذخیره', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setRowSaving(null)
    }
  }

  const saveBulk = async () => {
    const updates = Object.entries(edits)
      .filter(([, v]) => v.stock !== undefined || v.minStock !== undefined)
      .map(([id, v]) => ({ id, ...v }))
    if (!updates.length) {
      toast({ title: 'تغییری برای ذخیره نیست' })
      return
    }
    setSavingBulk(true)
    try {
      const res = await api<{ applied: number }>('/api/inventory', { method: 'PATCH', body: { updates } })
      toast({ title: 'موجودی انبار به‌روزرسانی شد', description: `${toFaDigits(res.applied)} قلم ثبت شد` })
      await load()
    } catch (e) {
      toast({ title: 'خطا در ذخیره گروهی', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSavingBulk(false)
    }
  }

  // ---------- suggested order contract ----------
  // localStorage 'hz_prefill_items' = JSON [{productId, qty}] — consumed by Orders section
  const suggestOrder = (rows: { productId: string; qty: number }[]) => {
    try {
      window.localStorage.setItem('hz_prefill_items', JSON.stringify(rows))
    } catch {
      /* ignore */
    }
    setQuickAction('new-order')
    toast({
      title: 'سفارش پیشنهادی آماده شد',
      description: 'به سفارش‌ساز منتقل شوید و اقلام را تأیید کنید.',
      action: (
        <ToastAction altText="رفتن به سفارش‌ها" onClick={() => setSection('orders')}>
          رفتن به سفارش‌ها
        </ToastAction>
      ),
      duration: 8000,
    })
  }

  // ---------- self-learning reorder point (manager only) ----------
  // raises minStock to match 30-day sales velocity — 7-day cover floor
  const syncMinStocks = async () => {
    setSyncingMin(true)
    try {
      const res = await api<{
        updated: number
        changes: { name: string; old: number; new: number }[]
        windowDays: number
        coverDays: number
      }>('/api/inventory/sync-min', { method: 'POST', body: {} })
      if (!res.updated) {
        toast({
          title: 'حد سفارش‌ها هم‌تراز است ✅',
          description: `هیچ کالایی نیاز به افزایش نقطه سفارش نداشت (بر پایه فروش ${toFaDigits(res.windowDays)} روز).`,
        })
      } else {
        toast({
          title: `حد سفارش ${toFaDigits(res.updated)} قلم هم‌تراز شد`,
          description:
            res.changes.slice(0, 3).map((c) => `${c.name}: ${toFaDigits(c.old)}→${toFaDigits(c.new)}`).join(' · ') +
            (res.updated > 3 ? ' …' : ''),
        })
        await load()
      }
    } catch (e) {
      toast({ title: 'خطا در هم‌ترازی حد سفارش', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSyncingMin(false)
    }
  }

  const filtered = React.useMemo(() => {
    if (!data) return []
    return data.products.filter((p) => {
      if (category && p.category !== category) return false
      if (search.trim() && !(p.name.includes(search.trim()) || (p.brand ?? '').includes(search.trim()))) return false
      return true
    })
  }, [data, search, category])

  const dirtyCount = Object.values(edits).filter((v) => v.stock !== undefined || v.minStock !== undefined).length
  const maxCatValue = data?.byCategory.reduce((m, c) => Math.max(m, c.value), 0) ?? 0

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <SectionHeader icon={<Warehouse className="h-6 w-6" />} title="انبار و موجودی" />
        <LoadingBlock rows={6} />
      </div>
    )
  }
  if (!data) return null

  return (
    <div className="space-y-5">
      <SectionHeader
        icon={<Warehouse className="h-6 w-6" />}
        title="انبار و موجودی"
        subtitle="نمای کلی موجودی، ارزش انبار و اقلام نیازمند سفارش"
        actions={
          <>
            {user?.isManager && (
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 gap-1.5 border-[#3E7C59]/40 text-[#3E7C59] hover:bg-[#3E7C59]/10 hover:border-[#3E7C59]/70"
                onClick={syncMinStocks}
                disabled={syncingMin}
                title="حد سفارش کالاهای پرفروش را بر پایه فروش ۳۰ روز اخیر بالا می‌برد (هرگز پایین نمی‌آورد)"
              >
                {syncingMin ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
                هم‌ترازی حد سفارش با فروش
              </Button>
            )}
            {canEdit && dirtyCount > 0 ? (
              <Button onClick={saveBulk} disabled={savingBulk} className="min-h-11">
                {savingBulk ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                ذخیره گروهی ({toFaDigits(dirtyCount)})
              </Button>
            ) : undefined}
          </>
        }
      />

      {/* ---------- stats ---------- */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard title="ارزش موجودی انبار" value={`${money(data.stockValue)}`} hint="تومان" icon={<Boxes className="h-5 w-5" />} color="#3E7C59" />
        <StatCard title="اقلام کم‌موجود" value={toFaDigits(data.lowStock.length)} hint="به حد سفارش رسیده" icon={<AlertTriangle className="h-5 w-5" />} color="#C9A227" />
        <StatCard title="تمام‌شده‌ها" value={toFaDigits(data.outOfStock)} hint="موجودی صفر" icon={<PackageX className="h-5 w-5" />} color="#B33A3A" />
        <StatCard title="تعداد کل اقلام" value={toFaDigits(data.products.length)} hint="کالای فعال" icon={<Warehouse className="h-5 w-5" />} color="#B07D2B" />
      </div>

      {/* ---------- category summary ---------- */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold">خلاصه دسته‌ها</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {data.byCategory.map((c, i) => (
            <button
              key={c.category}
              type="button"
              onClick={() => setCategory(category === c.category ? null : c.category)}
              className={`rounded-2xl border bg-card p-4 text-right transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring ${
                category === c.category ? 'border-primary ring-2 ring-primary/30' : 'border-border'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-sm">{c.category}</p>
                {c.lowCount > 0 && (
                  <span className="text-[10px] font-bold num px-2 py-0.5 rounded-full" style={{ backgroundColor: `${STOCK_COLORS.low}22`, color: STOCK_COLORS.low }}>
                    {toFaDigits(c.lowCount)} کم‌موجود
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground num">
                <span>{toFaDigits(c.totalItems)} قلم · {toFaDigits(c.totalStock)} موجودی</span>
                <span>{money(c.value)} تومان</span>
              </div>
              <div
                className="mt-2 h-1.5 rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${BAR_COLORS[i % BAR_COLORS.length]} ${Math.max(4, (c.value / Math.max(1, maxCatValue)) * 100)}%, #eee6e0 ${Math.max(4, (c.value / Math.max(1, maxCatValue)) * 100)}%)`,
                }}
                aria-hidden
              />
            </button>
          ))}
        </div>
      </section>

      {/* ---------- low stock alerts ---------- */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" style={{ color: STOCK_COLORS.low }} />
            هشدار کم‌موجودی (بحرانی در اولویت)
          </h2>
          {data.lowStock.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={() =>
                suggestOrder(data.lowStock.map((p) => ({ productId: p.id, qty: Math.max(2, p.minStock * 2) })))
              }
            >
              <ShoppingCart className="h-4 w-4" /> سفارش پیشنهادی همه ({toFaDigits(data.lowStock.length)})
            </Button>
          )}
        </div>
        {data.lowStock.length === 0 ? (
          <EmptyState icon={<Boxes />} title="همه اقلام موجودی مناسب دارند" description="فعلاً نیازی به سفارش نیست." />
        ) : (
          <ul className="rounded-2xl border border-border bg-card divide-y divide-border max-h-96 overflow-y-auto">
            {data.lowStock.map((p) => {
              const cur = current(p)
              const pct = Math.min(100, Math.round((p.stock / Math.max(1, p.minStock * 2)) * 100))
              const dirty = !!edits[p.id]?.minStock && edits[p.id]?.minStock !== p.minStock
              return (
                <li key={p.id} className="p-3 flex flex-wrap items-center gap-3">
                  <div className="min-w-40 flex-1">
                    <p className="text-sm font-bold line-clamp-1">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{p.category} · حد سفارش: <span className="num">{toFaDigits(p.minStock)}</span></p>
                    <div className="mt-1.5 max-w-56">
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  </div>
                  <StockIndicator stock={p.stock} minStock={p.minStock} />
                  <CoverBadge cover={data.cover?.[p.id] ?? null} name={p.name} />
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <Input
                        className="num h-9 w-20 text-center"
                        inputMode="numeric"
                        aria-label={`حد سفارش ${p.name}`}
                        value={String(cur.minStock)}
                        onChange={(e) => setEdit(p.id, { minStock: Number(e.target.value.replace(/[^\d]/g, '')) || 0 })}
                      />
                      <Button
                        variant={dirty ? 'default' : 'ghost'}
                        size="icon"
                        className="h-9 w-9"
                        aria-label={`ذخیره حد سفارش ${p.name}`}
                        disabled={!dirty || rowSaving === p.id}
                        onClick={() => saveRow(p.id)}
                      >
                        {rowSaving === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      </Button>
                    </div>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    className="min-h-11"
                    onClick={() => suggestOrder([{ productId: p.id, qty: Math.max(2, p.minStock * 2) }])}
                  >
                    <ShoppingCart className="h-4 w-4" /> ثبت سفارش پیشنهادی
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ---------- full stock table ---------- */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold">جدول کامل موجودی</h2>
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-52">
              <Input
                placeholder="جستجوی کالا یا برند…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 pe-9"
              />
              <Search className="absolute end-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
            </div>
            <ChipSelect
              options={[{ key: '', label: 'همه' }, ...data.byCategory.map((c) => ({ key: c.category, label: c.category }))]}
              value={category ?? ''}
              onChange={(v) => setCategory(v || null)}
            />
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={<Warehouse />} title="کالایی مطابق فیلتر پیدا نشد" />
          ) : (
            <div className="rounded-xl border border-border max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-accent/85 backdrop-blur">
                  <TableRow>
                    <TableHead className="text-right">کالا</TableHead>
                    <TableHead className="text-right">موجودی</TableHead>
                    <TableHead className="text-right hidden md:table-cell">ظرفیت</TableHead>
                    <TableHead className="text-right hidden md:table-cell">قیمت خرید</TableHead>
                    <TableHead className="text-right">ارزش</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => {
                    const cur = current(p)
                    const cap = p.capacity > 0 ? p.capacity : Math.max(1, p.minStock * 2)
                    const pct = Math.min(100, Math.round((cur.stock / Math.max(1, cap)) * 100))
                    const level = cur.stock <= 0 ? 'critical' : cur.stock <= p.minStock ? 'low' : 'ok'
                    const dirty = (edits[p.id]?.stock !== undefined && edits[p.id]?.stock !== p.stock)
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="max-w-52">
                          <p className="text-sm font-medium line-clamp-1">{p.name}</p>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-[11px] text-muted-foreground">{p.category}{p.brand ? ` · ${p.brand}` : ''}</p>
                            <CoverBadge cover={data.cover?.[p.id] ?? null} name={p.name} />
                          </div>
                        </TableCell>
                        <TableCell>
                          {canEdit ? (
                            <div className="flex items-center gap-1">
                              <Button variant="outline" size="icon" className="h-8 w-8" aria-label={`کاهش ${p.name}`} onClick={() => setEdit(p.id, { stock: Math.max(0, cur.stock - 1) })}>
                                <Minus className="h-3.5 w-3.5" />
                              </Button>
                              <Input
                                className="num h-8 w-16 text-center px-1"
                                inputMode="numeric"
                                aria-label={`موجودی ${p.name}`}
                                value={String(cur.stock)}
                                onChange={(e) => setEdit(p.id, { stock: Number(e.target.value.replace(/[^\d]/g, '')) || 0 })}
                              />
                              <Button variant="outline" size="icon" className="h-8 w-8" aria-label={`افزایش ${p.name}`} onClick={() => setEdit(p.id, { stock: cur.stock + 1 })}>
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <span className="num text-sm">{toFaDigits(cur.stock)}</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell min-w-32">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: STOCK_COLORS[level] }} />
                            </div>
                            <span className="text-[10px] text-muted-foreground num">{toFaDigits(pct)}٪</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell num text-xs">{money(p.buyPrice)}</TableCell>
                        <TableCell className="num text-xs">{money(cur.stock * p.buyPrice)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {canEdit && dirtyCount > 0 && (
            <div className="flex justify-end">
              <Button onClick={saveBulk} disabled={savingBulk} className="min-h-11">
                {savingBulk ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                ذخیره گروهی تغییرات ({toFaDigits(dirtyCount)})
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
