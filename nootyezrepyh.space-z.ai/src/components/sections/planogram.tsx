'use client'

import * as React from 'react'
import { api, ClientUser } from '@/lib/api-client'
import { SectionHeader, EmptyState, GlowCard, StockBadge } from '@/components/zeytoon-ui'
import { toFaDigits, formatJalali } from '@/lib/jalali'
import { canUser, PERMISSIONS, stockStatus, STOCK_STATUS, ROLES } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  Plus, Search, Grid3X3, Loader2, Pencil, Trash2, CheckCircle2, ArrowRight,
  Warehouse, Eraser, RefreshCw, Send, Users, Package,
} from 'lucide-react'

// ================= Types =================

interface StaffMember {
  id: string
  name: string
  roles: string[]
  primaryRole: string
  color: string
}

interface PlanogramDTO {
  id: string
  name: string
  rows: number
  cols: number
  cells: (string | null)[]
  assignedTo?: string | null
  assignedUser?: { id: string; name: string; color: string } | null
  status: 'DRAFT' | 'PUBLISHED' | 'DONE'
  createdById: string
  creatorName?: string
  createdAt: string
  updatedAt: string
}

interface PlanogramDetail {
  planogram: PlanogramDTO
  products: ProductLite[]
}

interface ProductLite {
  id: string
  name: string
  stock: number
  minStock: number
  unit: string
  price: number
  image?: string | null
}

const PLANOGRAM_STATUS: Record<PlanogramDTO['status'], { label: string; cls: string }> = {
  DRAFT: { label: 'پیش‌نویس', cls: 'bg-muted text-muted-foreground border' },
  PUBLISHED: { label: 'منتشر شده', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  DONE: { label: 'چیده شد ✓', cls: 'bg-[#fdf3e0] text-[#8a6d1f] border border-[#e5d9b0]' },
}

function ProductCellAvatar({ p, className }: { p: ProductLite | undefined; className?: string }) {
  if (!p) return null
  if (p.image) {
    return <img src={p.image} alt={p.name} className={cn('object-cover', className)} loading="lazy" />
  }
  return (
    <div className={cn('flex items-center justify-center bg-accent text-olive font-black', className)}>
      {p.name.charAt(0)}
    </div>
  )
}

function statusColor(p?: ProductLite): { border: string; bg: string } {
  if (!p) return { border: 'var(--border)', bg: 'transparent' }
  const s = STOCK_STATUS[stockStatus(p.stock, p.minStock)]
  return { border: s.color, bg: s.bg }
}

// ================= Product picker popover =================

function ProductPicker({ onPick }: { onPick: (p: ProductLite) => void }) {
  const [q, setQ] = React.useState('')
  const [results, setResults] = React.useState<ProductLite[] | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      setLoading(true)
      api.get<{ products: ProductLite[] }>(`/api/products?${params.toString()}`)
        .then((d) => setResults(d.products.slice(0, 30)))
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی محصول..." className="h-9 pr-8 text-sm" autoFocus />
      </div>
      <ScrollArea className="h-56">
        <div className="space-y-1 pr-1">
          {loading && !results ? (
            <div className="space-y-1.5"><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /></div>
          ) : !results || results.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">محصولی پیدا نشد</p>
          ) : (
            results.map((p) => (
              <button
                key={p.id}
                type="button"
                className="w-full flex items-center gap-2 rounded-lg border bg-background hover:bg-accent/60 px-2 py-1.5 text-right transition-colors"
                onClick={() => onPick(p)}
              >
                <ProductCellAvatar p={p} className="size-8 rounded-md border shrink-0" />
                <span className="text-xs font-medium flex-1 line-clamp-1">{p.name}</span>
                <span className="text-[10px] tabular-nums shrink-0" style={{ color: STOCK_STATUS[stockStatus(p.stock, p.minStock)].color }}>
                  {toFaDigits(Math.round(p.stock))}
                </span>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// ================= Planogram grid cell =================

function CellBox({
  index, product, editable, onAssign, onClear, onQuickRequest,
}: {
  index: number
  product?: ProductLite
  editable: boolean
  onAssign?: (idx: number, p: ProductLite) => void
  onClear?: (idx: number) => void
  onQuickRequest?: (p: ProductLite) => void
}) {
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const c = statusColor(product)

  const cell = (
    <div
      className={cn(
        'relative aspect-[4/5] rounded-lg border-2 flex flex-col items-center justify-center gap-1 p-1 transition-all',
        !product && 'border-dashed border-muted-foreground/30 hover:border-olive/50',
        product && 'hover:shadow-md',
        editable && 'cursor-pointer',
      )}
      style={product ? { borderColor: c.border, background: c.bg } : undefined}
    >
      <span className="absolute top-0.5 right-1 text-[9px] text-muted-foreground tabular-nums">{toFaDigits(index + 1)}</span>
      {product ? (
        <>
          <ProductCellAvatar p={product} className="w-3/4 h-1/2 rounded-md border" />
          <span className="text-[9px] font-bold leading-tight line-clamp-2 text-center">{product.name}</span>
          <span className="text-[8px] tabular-nums text-muted-foreground">{toFaDigits(Math.round(product.stock))} {product.unit}</span>
        </>
      ) : (
        editable && <Plus className="size-4 text-muted-foreground/50" />
      )}
    </div>
  )

  if (!editable && product && onQuickRequest) {
    return (
      <button
        type="button"
        className="text-right focus:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded-lg"
        onClick={() => onQuickRequest(product)}
        title="درخواست از انبار"
      >
        {cell}
      </button>
    )
  }

  if (!editable) return cell

  return (
    <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
      <PopoverTrigger asChild>{cell}</PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="center">
        {product ? (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <ProductCellAvatar p={product} className="size-10 rounded-lg border" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold line-clamp-1">{product.name}</div>
                <StockBadge stock={product.stock} minStock={product.minStock} unit={product.unit} />
              </div>
            </div>
            <Separator />
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" className="h-9 flex-1" onClick={() => setPickerOpen(false)}>
                <RefreshCw className="size-3.5" /> تغییر
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 flex-1 text-destructive hover:text-destructive"
                onClick={() => { onClear?.(index); setPickerOpen(false) }}
              >
                <Eraser className="size-3.5" /> خالی کردن
              </Button>
            </div>
            <Separator />
            <p className="text-[10px] text-muted-foreground text-center">برای تغییر، محصول دیگری از فهرست پایین انتخاب کنید</p>
          </div>
        ) : null}
        <div className={cn(product && 'mt-2')}>
          <ProductPicker onPick={(p) => { onAssign?.(index, p); setPickerOpen(false) }} />
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ================= Designer (manager) =================

function PlanogramDesigner({ planogramId, onBack }: { planogramId: string; onBack: () => void }) {
  const { toast } = useToast()
  const [detail, setDetail] = React.useState<PlanogramDetail | null>(null)
  const [cells, setCells] = React.useState<(string | null)[]>([])
  const [products, setProducts] = React.useState<ProductLite[]>([])
  const [saving, setSaving] = React.useState(false)
  const [publishOpen, setPublishOpen] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)

  React.useEffect(() => {
    api.get<PlanogramDetail>(`/api/planograms/${planogramId}`)
      .then((d) => {
        setDetail(d)
        setCells(d.planogram.cells)
        setProducts(d.products)
      })
      .catch((e) => toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' }))
  }, [planogramId, toast])

  const byId = React.useMemo(() => {
    const m: Record<string, ProductLite> = {}
    for (const p of products) m[p.id] = p
    return m
  }, [products])

  function assign(idx: number, p: ProductLite) {
    setCells((c) => {
      const next = [...c]
      next[idx] = p.id
      return next
    })
    setProducts((ps) => (ps.some((x) => x.id === p.id) ? ps : [...ps, p]))
    setDirty(true)
  }

  function clearCell(idx: number) {
    setCells((c) => {
      const next = [...c]
      next[idx] = null
      return next
    })
    setDirty(true)
  }

  async function saveCells() {
    if (!detail) return
    setSaving(true)
    try {
      await api.patch(`/api/planograms/${detail.planogram.id}`, { cells })
      setDirty(false)
      toast({ title: 'پلانوگرام ذخیره شد ✓' })
    } catch (e) {
      toast({ title: 'خطا در ذخیره', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  if (!detail) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-6 gap-2">{Array.from({ length: 24 }).map((_, i) => <Skeleton key={i} className="aspect-[4/5]" />)}</div>
      </div>
    )
  }

  const pl = detail.planogram

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-11 w-11" onClick={onBack} aria-label="بازگشت">
            <ArrowRight className="size-5" />
          </Button>
          <div>
            <h3 className="font-extrabold flex items-center gap-2">
              <Grid3X3 className="size-4 text-olive" /> {pl.name}
              <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-bold', PLANOGRAM_STATUS[pl.status].cls)}>
                {PLANOGRAM_STATUS[pl.status].label}
              </span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {toFaDigits(pl.rows)} قفسه × {toFaDigits(pl.cols)} محل — رنگ خانه‌ها وضعیت موجودی کالا را نشان می‌دهد
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="h-11" onClick={saveCells} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            ذخیره {dirty && <span className="size-1.5 rounded-full bg-gold mr-1" aria-hidden />}
          </Button>
          <Button className="h-11" onClick={() => setPublishOpen(true)}>
            <Send className="size-4" /> انتشار برای چیدمان‌دار
          </Button>
        </div>
      </div>

      <GlowCard className="p-3 sm:p-4 overflow-x-auto">
        <div
          className="grid gap-1.5 sm:gap-2"
          style={{ gridTemplateColumns: `repeat(${pl.cols}, minmax(52px, 1fr))`, minWidth: pl.cols * 60 }}
          role="grid"
          aria-label={`پلانوگرام ${pl.name}`}
        >
          {Array.from({ length: pl.rows * pl.cols }).map((_, i) => (
            <div key={i} role="gridcell">
              <CellBox index={i} product={cells[i] ? byId[cells[i]!] : undefined} editable onAssign={assign} onClear={clearCell} />
            </div>
          ))}
        </div>
      </GlowCard>

      <PublishDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        planogram={pl}
        hasCells={cells.some(Boolean)}
        onPublished={onBack}
      />
    </div>
  )
}

// ================= Publish dialog =================

function PublishDialog({
  open, onClose, planogram, hasCells, onPublished,
}: {
  open: boolean
  onClose: () => void
  planogram: PlanogramDTO
  hasCells: boolean
  onPublished: () => void
}) {
  const { toast } = useToast()
  const [staff, setStaff] = React.useState<StaffMember[] | null>(null)
  const [assignedTo, setAssignedTo] = React.useState(planogram.assignedTo || '')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open && !staff) {
      api.get<StaffMember[]>('/api/auth/staff')
        .then((list) => setStaff(list.filter((s) => s.roles.includes('MERCHANDISER') && s.id !== undefined)))
        .catch(() => setStaff([]))
    }
  }, [open, staff])

  React.useEffect(() => {
    if (open) setAssignedTo(planogram.assignedTo || '')
  }, [open, planogram])

  async function publish() {
    if (!assignedTo) {
      toast({ title: 'چیدمان‌دار را انتخاب کنید', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await api.patch(`/api/planograms/${planogram.id}`, { publish: true, assignedTo })
      toast({ title: 'پلانوگرام منتشر شد ✓', description: 'چیدمان‌دار منتخب آن را می‌بیند' })
      onPublished()
      onClose()
    } catch (e) {
      toast({ title: 'خطا در انتشار', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>انتشار پلانوگرام</DialogTitle>
          <DialogDescription>
            {hasCells ? 'پلانوگرام برای چیدمان‌دار منتخب ارسال می‌شود.' : 'توجه: هنوز هیچ کالایی در پلانوگرام قرار نداده‌اید.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>چیدمان‌دار مسئول</Label>
          <Select value={assignedTo || undefined} onValueChange={setAssignedTo}>
            <SelectTrigger className="h-11"><SelectValue placeholder="انتخاب چیدمان‌دار" /></SelectTrigger>
            <SelectContent>
              {(staff || []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ background: s.color }} />
                    {s.name} <span className="text-xs text-muted-foreground">({ROLES[s.primaryRole]?.name || s.primaryRole})</span>
                  </span>
                </SelectItem>
              ))}
              {staff && staff.length === 0 && <div className="px-3 py-4 text-xs text-muted-foreground text-center">چیدمان‌داری یافت نشد</div>}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={onClose} disabled={saving}>انصراف</Button>
          <Button className="h-11 min-w-28" onClick={publish} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} انتشار
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ================= Quick warehouse request =================

function QuickWarehouseDialog({
  product, planogramName, onClose,
}: {
  product: ProductLite | null
  planogramName: string
  onClose: () => void
}) {
  const { toast } = useToast()
  const [qty, setQty] = React.useState('10')
  const [saving, setSaving] = React.useState(false)

  async function submit() {
    if (!product) return
    const q = parseFloat(qty)
    if (!q || q <= 0) {
      toast({ title: 'تعداد را وارد کنید', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await api.post('/api/warehouse-requests', { productId: product.id, quantity: q })
      toast({ title: 'درخواست از انبار ثبت شد ✓', description: `${product.name} — ${toFaDigits(Math.round(q))} ${product.unit}` })
      onClose()
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!product} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Warehouse className="size-5 text-olive" /> درخواست از انبار</DialogTitle>
          <DialogDescription>
            {product ? `${product.name} — پلانوگرام «${planogramName}»` : ''}
          </DialogDescription>
        </DialogHeader>
        {product && (
          <div className="flex items-center gap-3">
            <ProductCellAvatar p={product} className="size-14 rounded-lg border" />
            <StockBadge stock={product.stock} minStock={product.minStock} unit={product.unit} />
          </div>
        )}
        <div className="space-y-1.5">
          <Label>تعداد درخواستی</Label>
          <div className="flex items-center gap-2" dir="ltr">
            <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setQty(String(Math.max(0, (parseFloat(qty) || 0) - 1)))} aria-label="کاهش">−</Button>
            <Input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ''))} className="h-11 text-center tabular-nums" inputMode="numeric" />
            <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setQty(String((parseFloat(qty) || 0) + 1))} aria-label="افزایش">+</Button>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={onClose} disabled={saving}>انصراف</Button>
          <Button className="h-11 min-w-28" onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Warehouse className="size-4" />} ثبت درخواست
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ================= Merchandiser view =================

function MerchandiserPlanograms({ user }: { user: ClientUser }) {
  const { toast } = useToast()
  const [planograms, setPlanograms] = React.useState<PlanogramDTO[] | null>(null)
  const [viewId, setViewId] = React.useState<string | null>(null)
  const [detail, setDetail] = React.useState<PlanogramDetail | null>(null)
  const [requestProduct, setRequestProduct] = React.useState<ProductLite | null>(null)
  const [markingDone, setMarkingDone] = React.useState(false)

  const load = React.useCallback(() => {
    api.get<{ planograms: PlanogramDTO[] }>('/api/planograms')
      .then((d) => setPlanograms(d.planograms))
      .catch(() => setPlanograms([]))
  }, [])

  React.useEffect(load, [load])

  React.useEffect(() => {
    if (!viewId) { setDetail(null); return }
    api.get<PlanogramDetail>(`/api/planograms/${viewId}`)
      .then(setDetail)
      .catch((e) => toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' }))
  }, [viewId, toast])

  async function markDone() {
    if (!viewId) return
    setMarkingDone(true)
    try {
      await api.patch(`/api/planograms/${viewId}`, { status: 'DONE' })
      toast({ title: 'آفرین! چیدمان ثبت شد ✓', description: '+۶ امتیاز به کارنامه شما اضافه شد' })
      setViewId(null)
      load()
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setMarkingDone(false)
    }
  }

  const byId = React.useMemo(() => {
    const m: Record<string, ProductLite> = {}
    for (const p of detail?.products || []) m[p.id] = p
    return m
  }, [detail])

  if (viewId && detail) {
    const pl = detail.planogram
    const inCells = Array.from(new Set(pl.cells.filter(Boolean) as string[]))
      .map((id) => byId[id]).filter(Boolean) as ProductLite[]
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => setViewId(null)} aria-label="بازگشت">
              <ArrowRight className="size-5" />
            </Button>
            <div>
              <h3 className="font-extrabold">{pl.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                روی هر کالا بزنید تا از انبار درخواست ثبت کنید
              </p>
            </div>
          </div>
          {pl.status === 'PUBLISHED' && (
            <Button className="h-11" onClick={markDone} disabled={markingDone}>
              {markingDone ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              چیدم و تمام شد ✓ (+۶ امتیاز)
            </Button>
          )}
        </div>

        <GlowCard className="p-3 sm:p-4 overflow-x-auto">
          <div className="grid gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${pl.cols}, minmax(52px, 1fr))`, minWidth: pl.cols * 60 }}>
            {Array.from({ length: pl.rows * pl.cols }).map((_, i) => (
              <div key={i}>
                <CellBox
                  index={i}
                  product={pl.cells[i] ? byId[pl.cells[i]!] : undefined}
                  editable={false}
                  onQuickRequest={(p) => setRequestProduct(p)}
                />
              </div>
            ))}
          </div>
        </GlowCard>

        {inCells.length > 0 && (
          <div className="rounded-xl border p-3 space-y-2">
            <h4 className="font-bold text-sm flex items-center gap-1.5"><Package className="size-4 text-olive" /> درخواست سریع از انبار</h4>
            <div className="flex flex-wrap gap-2">
              {inCells.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setRequestProduct(p)}
                  className="flex items-center gap-1.5 rounded-full border bg-background hover:bg-accent px-3 py-1.5 text-xs font-bold transition-colors"
                >
                  <Warehouse className="size-3.5 text-olive" />
                  <span className="line-clamp-1 max-w-40">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <QuickWarehouseDialog product={requestProduct} planogramName={pl.name} onClose={() => setRequestProduct(null)} />
      </div>
    )
  }

  if (viewId && !detail) {
    return <div className="space-y-3"><Skeleton className="h-12 w-full" /><Skeleton className="h-64 w-full rounded-xl" /></div>
  }

  return (
    <div className="space-y-3">
      {!planograms ? (
        Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
      ) : planograms.length === 0 ? (
        <EmptyState
          icon={<Grid3X3 className="size-7 text-olive" />}
          title="هنوز پلانوگرامی برای شما منتشر نشده"
          description="وقتی مدیر پلانوگرامی را به شما اختصاص دهد، اینجا می‌بینید."
        />
      ) : (
        planograms.map((pl) => (
          <GlowCard key={pl.id} interactive className="p-4 cursor-pointer"
            onClick={() => setViewId(pl.id)}
            role="button" tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && setViewId(pl.id)}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-extrabold flex items-center gap-2">
                  <Grid3X3 className="size-4 text-olive" /> {pl.name}
                  <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-bold', PLANOGRAM_STATUS[pl.status].cls)}>
                    {PLANOGRAM_STATUS[pl.status].label}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {toFaDigits(pl.rows)}×{toFaDigits(pl.cols)} — {formatJalali(pl.updatedAt)}
                </p>
              </div>
              {pl.status === 'PUBLISHED' && (
                <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50">در انتظار چیدمان</Badge>
              )}
            </div>
          </GlowCard>
        ))
      )}
    </div>
  )
}

// ================= Manager list =================

function ManagerPlanograms({ user }: { user: ClientUser }) {
  const { toast } = useToast()
  const [planograms, setPlanograms] = React.useState<PlanogramDTO[] | null>(null)
  const [designId, setDesignId] = React.useState<string | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)

  const load = React.useCallback(() => {
    api.get<{ planograms: PlanogramDTO[] }>('/api/planograms')
      .then((d) => setPlanograms(d.planograms))
      .catch(() => setPlanograms([]))
  }, [])

  React.useEffect(load, [load])

  async function remove(id: string, name: string) {
    if (!confirm(`پلانوگرام «${name}» حذف شود؟`)) return
    try {
      await api.delete(`/api/planograms/${id}`)
      toast({ title: 'پلانوگرام حذف شد' })
      load()
    } catch (e) {
      toast({ title: 'خطا در حذف', description: (e as Error).message, variant: 'destructive' })
    }
  }

  if (designId) return <PlanogramDesigner planogramId={designId} onBack={() => { setDesignId(null); load() }} />

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button className="h-11" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> پلانوگرام جدید
        </Button>
      </div>

      {!planograms ? (
        Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
      ) : planograms.length === 0 ? (
        <EmptyState
          icon={<Grid3X3 className="size-7 text-olive" />}
          title="هنوز پلانوگرامی ساخته نشده"
          description="با «پلانوگرام جدید» نقشه چیدمان قفسه‌ها را طراحی کنید."
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {planograms.map((pl) => (
            <GlowCard key={pl.id} interactive className="p-4">
              <div className="flex items-start justify-between gap-2">
                <button className="text-right flex-1" onClick={() => setDesignId(pl.id)}>
                  <div className="font-extrabold flex items-center gap-2">
                    <Grid3X3 className="size-4 text-olive" /> {pl.name}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {toFaDigits(pl.rows)}×{toFaDigits(pl.cols)} — {formatJalali(pl.updatedAt)}
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-bold', PLANOGRAM_STATUS[pl.status].cls)}>
                      {PLANOGRAM_STATUS[pl.status].label}
                    </span>
                    {pl.assignedUser ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="size-2 rounded-full" style={{ background: pl.assignedUser.color }} />
                        {pl.assignedUser.name}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">بدون مسئول</span>
                    )}
                  </div>
                </button>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <Button size="sm" variant="secondary" className="h-9" onClick={() => setDesignId(pl.id)}>
                    <Pencil className="size-3.5" /> طراحی
                  </Button>
                  <Button size="sm" variant="ghost" className="h-9 text-destructive hover:text-destructive" onClick={() => remove(pl.id, pl.name)}>
                    <Trash2 className="size-3.5" /> حذف
                  </Button>
                </div>
              </div>
            </GlowCard>
          ))}
        </div>
      )}

      <CreatePlanogramDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => { setCreateOpen(false); setDesignId(id) }}
      />
    </div>
  )
}

function CreatePlanogramDialog({
  open, onClose, onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { toast } = useToast()
  const [name, setName] = React.useState('')
  const [rows, setRows] = React.useState('4')
  const [cols, setCols] = React.useState('6')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) { setName(''); setRows('4'); setCols('6') }
  }, [open])

  async function create() {
    if (!name.trim()) {
      toast({ title: 'نام پلانوگرام را وارد کنید', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await api.post<{ id: string }>('/api/planograms', {
        name: name.trim(),
        rows: parseInt(rows, 10),
        cols: parseInt(cols, 10),
      })
      toast({ title: 'پلانوگرام ساخته شد ✓', description: 'حالا کالاها را در قفسه‌ها بچینید' })
      onCreated(res.id)
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const rowOpts = Array.from({ length: 7 }, (_, i) => i + 2) // 2..8
  const colOpts = Array.from({ length: 10 }, (_, i) => i + 3) // 3..12

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>پلانوگرام جدید</DialogTitle>
          <DialogDescription>ابعاد قفسه‌ها را مشخص کنید</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>نام پلانوگرام *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً قفسه لبنیات ۱" className="h-11" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>تعداد قفسه (ردیف)</Label>
              <Select value={rows} onValueChange={setRows}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>{rowOpts.map((n) => <SelectItem key={n} value={String(n)}>{toFaDigits(n)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>تعداد محل در هر قفسه</Label>
              <Select value={cols} onValueChange={setCols}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>{colOpts.map((n) => <SelectItem key={n} value={String(n)}>{toFaDigits(n)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={onClose} disabled={saving}>انصراف</Button>
          <Button className="h-11 min-w-28" onClick={create} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} ساخت
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ================= Main section =================

export function PlanogramSection({ user }: { user: ClientUser }) {
  const isManager = canUser(user.roles, PERMISSIONS.MANAGE_PLANOGRAM)
  const isMerchandiser = user.roles.includes('MERCHANDISER')

  return (
    <div>
      <SectionHeader
        title="چیدمان قفسه‌ها"
        subtitle={isManager ? 'طراحی پلانوگرام و انتشار برای چیدمان‌دارها' : 'پلانوگرام‌های منتشرشده برای شما'}
      />
      {isManager ? (
        <Tabs defaultValue="manage">
          <TabsList className="mb-4 h-11">
            <TabsTrigger value="manage" className="px-4">مدیریت پلانوگرام‌ها</TabsTrigger>
            {isMerchandiser && <TabsTrigger value="mine" className="px-4">پلانوگرام‌های من</TabsTrigger>}
          </TabsList>
          <TabsContent value="manage"><ManagerPlanograms user={user} /></TabsContent>
          {isMerchandiser && <TabsContent value="mine"><MerchandiserPlanograms user={user} /></TabsContent>}
        </Tabs>
      ) : (
        <MerchandiserPlanograms user={user} />
      )}
    </div>
  )
}
