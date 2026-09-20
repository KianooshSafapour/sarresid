'use client'

import * as React from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/store/app'
import { useToast } from '@/hooks/use-toast'
import { SectionHeader, EmptyState, LoadingBlock, ConfirmButton, UserAvatar } from '@/components/platform/ui/shared'
import { toFaDigits } from '@/lib/jalali'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LayoutGrid, Plus, Loader2, Pencil, PackageOpen, Square, Trash2, ClipboardList } from 'lucide-react'

interface ShelfProduct {
  id: string
  name: string
  image?: string | null
  unit: string
  stock: number
  capacity: number
}

interface ShelfDTO {
  id: string
  name: string
  section: string
  row: number
  col: number
  capacity: number
  note?: string | null
  product: ShelfProduct | null
  fill: number
}

interface ProductLite {
  id: string
  name: string
  stock: number
}

function fillColor(fill: number, empty: boolean) {
  if (empty) return { bg: '#e8e6e0', text: '#8A8F98', label: 'خالی' }
  if (fill >= 60) return { bg: '#3E7C59', text: '#ffffff', label: 'پُر' }
  if (fill >= 30) return { bg: '#C9A227', text: '#ffffff', label: 'نیمه‌پُر' }
  return { bg: '#B33A3A', text: '#ffffff', label: 'کمبود' }
}

function ShelfCellFooter({
  shelf, onEdit, onRemove,
}: {
  shelf: ShelfDTO
  onEdit?: () => void
  onRemove?: () => void
}) {
  return (
    <div className="flex items-center gap-1">
      <Badge variant="outline" className="text-[8px] h-4 px-1 rounded num shrink-0">
        {shelf.name}
      </Badge>
      <span className="flex-1" />
      {onEdit && (
        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={onEdit}>
          <Pencil className="h-3 w-3" />
        </Button>
      )}
      {onRemove && (
        <ConfirmButton onConfirm={onRemove} confirmText="حذف؟" variant="ghost" className="h-6 w-6 px-0 text-pomegranate shrink-0">
          <Trash2 className="h-3 w-3" />
        </ConfirmButton>
      )}
    </div>
  )
}

export function Planogram() {
  const { user, setSection } = useApp()
  const { toast } = useToast()
  const isManager = !!user?.isManager
  const isMerchandiser = user?.roleKeys.includes('merchandiser') ?? false
  const canCount = isManager || (user?.roleKeys.includes('inventory') ?? false)
  const [shelves, setShelves] = React.useState<ShelfDTO[] | null>(null)
  const [sections, setSections] = React.useState<string[]>([])
  const [activeSection, setActiveSection] = React.useState<string | null>(null)
  const [editMode, setEditMode] = React.useState(false)
  const [addOpen, setAddOpen] = React.useState(false)
  const [editShelf, setEditShelf] = React.useState<ShelfDTO | null>(null)

  const load = React.useCallback(async () => {
    try {
      const d = await api<{ shelves: ShelfDTO[] }>('/api/planogram')
      setShelves(d.shelves)
      const secs = Array.from(new Set(d.shelves.map((s) => s.section)))
      setSections(secs)
      setActiveSection((prev) => prev ?? secs[0] ?? null)
    } catch {
      setShelves([])
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  // fill-health per section — % of shelves at ≥60% fill drives the tab dot color
  const sectionHealth = React.useMemo(() => {
    const map = new Map<string, { total: number; ok: number }>()
    for (const s of shelves ?? []) {
      const rec = map.get(s.section) ?? { total: 0, ok: 0 }
      rec.total++
      if (s.fill >= 60) rec.ok++
      map.set(s.section, rec)
    }
    return map
  }, [shelves])
  const healthColor = (sec: string) => {
    const h = sectionHealth.get(sec)
    if (!h || h.total === 0) return '#e8e6e0'
    const ratio = h.ok / h.total
    return ratio >= 0.8 ? '#3E7C59' : ratio >= 0.5 ? '#C9A227' : '#B33A3A'
  }

  // one-click jump: open the stock-count start dialog pre-scoped to this section
  const startSectionCount = () => {
    if (!activeSection) return
    try {
      window.localStorage.setItem(
        'hz_prefill_count',
        JSON.stringify({ scope: 'SECTION', category: activeSection })
      )
    } catch {
      /* storage unavailable */
    }
    setSection('stock-count')
  }

  const sectionShelves = (shelves ?? []).filter((s) => s.section === activeSection)
  const maxRow = Math.max(1, ...sectionShelves.map((s) => s.row))
  const maxCol = Math.max(1, ...sectionShelves.map((s) => s.col))
  const grid: Record<number, Record<number, ShelfDTO>> = {}
  for (const s of sectionShelves) {
    grid[s.row] = grid[s.row] ?? {}
    grid[s.row][s.col] = s
  }

  const requestFill = async (shelf: ShelfDTO) => {
    const qty = Math.max(1, (shelf.capacity || shelf.product?.capacity || 0) - (shelf.product?.stock ?? 0))
    if (!shelf.product || qty <= 0) {
      toast({ title: 'این قفسه نیاز به پر کردن ندارد 🌿' })
      return
    }
    try {
      await api('/api/warehouse-requests', { body: { productId: shelf.product.id, qty, note: `پر کردن ${shelf.name} (${shelf.section})` } })
      toast({ title: 'انباردار مطلع شد 📦', description: `درخواست ${qty} ${shelf.product.unit} برای «${shelf.product.name}» ثبت شد` })
    } catch (e) {
      toast({ title: 'ثبت نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }

  const removeShelf = async (shelf: ShelfDTO) => {
    try {
      await api(`/api/planogram/${shelf.id}`, { method: 'DELETE' })
      toast({ title: 'قفسه حذف شد' })
      load()
    } catch (e) {
      toast({ title: 'حذف نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="چیدمان قفسه"
        subtitle="نقشه فروشگاه در یک نگاه — پُر نگه‌داشتن قفسه‌ها کارِ همه ماست"
        icon={<LayoutGrid className="h-5 w-5" />}
        actions={
          <>
            {canCount && activeSection && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-[#C9A227]/50 text-[#8A6F3C] hover:bg-[#C9A227]/10 hover:border-[#C9A227]/70 dark:text-[#e3c765]"
                onClick={startSectionCount}
              >
                <ClipboardList className="h-4 w-4" />
                جرد بخش «{activeSection}»
              </Button>
            )}
            {isManager && (
              <>
                <Button size="sm" variant={editMode ? 'default' : 'outline'} className="gap-1.5" onClick={() => setEditMode(!editMode)}>
                  <Pencil className="h-4 w-4" /> {editMode ? 'پایان ویرایش' : 'حالت ویرایش'}
                </Button>
                <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
                  <Plus className="h-4 w-4" /> قفسه جدید
                </Button>
              </>
            )}
          </>
        }
      />

      {/* section tabs */}
      {!shelves ? <LoadingBlock rows={3} /> : sections.length === 0 ? (
        <EmptyState icon={<LayoutGrid />} title="هنوز قفسه‌ای تعریف نشده" description="مدیران می‌توانند نقشه فروشگاه را با «قفسه جدید» بسازند." />
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1 nice-scroll">
            {sections.map((sec) => {
              const h = sectionHealth.get(sec)
              return (
                <button
                  key={sec}
                  onClick={() => setActiveSection(sec)}
                  title={h && h.total > 0 ? `${toFaDigits(h.ok)} از ${toFaDigits(h.total)} قفسه پُر (۶۰٪+)` : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold whitespace-nowrap border transition-colors min-h-11 ${
                    activeSection === sec ? 'bg-primary text-primary-foreground border-transparent' : 'bg-card hover:bg-accent'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${h && h.ok / h.total < 0.5 ? 'animate-pulse' : ''}`}
                    style={{ backgroundColor: healthColor(sec) }}
                    aria-hidden
                  />
                  {sec}
                  {h && <span className={`num text-[10px] ${activeSection === sec ? 'opacity-80' : 'text-muted-foreground'}`}>{toFaDigits(h.total)} قفسه</span>}
                </button>
              )
            })}
          </div>

          {/* legend */}
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span className="font-bold">راهنما:</span>
            {[
              { c: '#3E7C59', t: 'پُر (۶۰٪+)' },
              { c: '#C9A227', t: 'نیمه‌پُر (۳۰–۵۹٪)' },
              { c: '#B33A3A', t: 'کمبود (<۳۰٪)' },
              { c: '#e8e6e0', t: 'خالی' },
            ].map((l) => (
              <span key={l.t} className="flex items-center gap-1.5">
                <span className="h-3.5 w-3.5 rounded-md border" style={{ backgroundColor: l.c }} /> {l.t}
              </span>
            ))}
          </div>

          {/* grid */}
          <Card>
            <CardContent className="p-4 space-y-2 overflow-x-auto">
              {Array.from({ length: maxRow }).map((_, r) => (
                <div key={r} className="flex gap-2 min-w-max">
                  {Array.from({ length: maxCol }).map((__, c) => {
                    const shelf = grid[r + 1]?.[c + 1]
                    if (!shelf) {
                      return (
                        <div
                          key={c}
                          className="h-28 w-36 md:w-44 rounded-xl border border-dashed border-border/70 flex items-center justify-center text-[10px] text-muted-foreground/60"
                        >
                          <Square className="h-3 w-3" />
                        </div>
                      )
                    }
                    const prod = shelf.product
                    if (!prod) {
                      // gray slot: no product assigned
                      return (
                        <div
                          key={c}
                          className="h-28 w-36 md:w-44 rounded-xl p-2.5 flex flex-col justify-between shrink-0 border shadow-sm"
                          style={{ backgroundColor: '#e8e6e0' }}
                        >
                          <div className="flex-1 flex flex-col items-center justify-center gap-1 text-center text-[#8A8F98]">
                            <PackageOpen className="h-5 w-5" />
                            <p className="text-[10px] font-bold">{shelf.name}</p>
                            <p className="text-[9px] opacity-70">بدون کالا</p>
                          </div>
                          <ShelfCellFooter shelf={shelf} onEdit={isManager ? () => setEditShelf(shelf) : undefined} onRemove={isManager ? () => removeShelf(shelf) : undefined} />
                        </div>
                      )
                    }
                    const color = fillColor(shelf.fill, false)
                    return (
                      <div
                        key={c}
                        className="h-28 w-36 md:w-44 rounded-xl p-2.5 flex flex-col justify-between shrink-0 border shadow-sm transition-transform hover:scale-[1.02]"
                        style={{ backgroundColor: shelf.fill >= 60 ? color.bg : `${color.bg}26` }}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-[11px] font-bold leading-4 line-clamp-2" style={{ color: shelf.fill >= 30 ? color.text : undefined }}>
                            {prod.name}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <div className="h-1.5 rounded-full bg-black/10 overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(4, shelf.fill)}%`, backgroundColor: color.bg }} />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] num opacity-80" style={{ color: shelf.fill >= 30 ? color.text : undefined }}>
                              {toFaDigits(prod.stock)}/{toFaDigits(shelf.capacity)} · {color.label}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-[8px] h-4 px-1 rounded num shrink-0">
                            {shelf.name}
                          </Badge>
                          <span className="flex-1" />
                          {isMerchandiser && shelf.fill < 60 && (
                            <Button size="sm" variant="secondary" className="h-6 px-2 text-[9px]" onClick={() => requestFill(shelf)}>
                              درخواست پر کردن
                            </Button>
                          )}
                          {isManager && (
                            <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => setEditShelf(shelf)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )}
                          {isManager && (
                            <ConfirmButton onConfirm={() => removeShelf(shelf)} confirmText="حذف؟" variant="ghost" className="h-6 w-6 px-0 text-pomegranate shrink-0">
                              <Trash2 className="h-3 w-3" />
                            </ConfirmButton>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
              {editMode && isManager && (
                <p className="text-[11px] text-copper flex items-center gap-1.5 pt-2">
                  <UserAvatar name="نکته" color="#8A6F3C" size={16} />
                  برای جابه‌جایی یا تغییر کالا، روی قفسه دکمه ویرایش را بزن.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <ShelfEditor
        open={addOpen || !!editShelf}
        shelf={editShelf}
        onClose={() => { setAddOpen(false); setEditShelf(null) }}
        onSaved={() => { setAddOpen(false); setEditShelf(null); load() }}
      />
    </div>
  )
}

function ShelfEditor({ open, shelf, onClose, onSaved }: { open: boolean; shelf: ShelfDTO | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [name, setName] = React.useState('')
  const [section, setSection] = React.useState('عمومی')
  const [row, setRow] = React.useState(1)
  const [col, setCol] = React.useState(1)
  const [capacity, setCapacity] = React.useState(30)
  const [productId, setProductId] = React.useState('')
  const [products, setProducts] = React.useState<ProductLite[] | null>(null)
  const [pQuery, setPQuery] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setName(shelf?.name ?? '')
      setSection(shelf?.section ?? 'عمومی')
      setRow(shelf?.row ?? 1)
      setCol(shelf?.col ?? 1)
      setCapacity(shelf?.capacity ?? 30)
      setProductId(shelf?.product?.id ?? '')
      setPQuery('')
    }
  }, [open, shelf])

  React.useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      api<{ products: ProductLite[] }>(`/api/products?q=${encodeURIComponent(pQuery)}&limit=10`)
        .then((d) => setProducts(d.products))
        .catch(() => setProducts([]))
    }, 300)
    return () => clearTimeout(t)
  }, [open, pQuery])

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      if (shelf) {
        await api(`/api/planogram/${shelf.id}`, {
          method: 'PATCH',
          body: { name, section, row, col, capacity, productId: productId || null },
        })
      } else {
        await api('/api/planogram', { body: { name, section, row, col, capacity, productId: productId || null } })
      }
      toast({ title: shelf ? 'قفسه بروز شد 🌿' : 'قفسه اضافه شد 🌿' })
      onSaved()
    } catch (e) {
      toast({ title: 'ذخیره نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{shelf ? 'ویرایش قفسه' : 'قفسه جدید'}</DialogTitle>
          <DialogDescription>موقعیت، ظرفیت و کالای قفسه را مشخص کن.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>نام قفسه</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: F-3" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>سکشن</Label>
              <Input value={section} onChange={(e) => setSection(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>ظرفیت</Label>
              <Input value={capacity} onChange={(e) => setCapacity(Math.max(0, Number(e.target.value) || 0))} inputMode="numeric" className="num" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>ردیف</Label>
              <Select value={String(row)} onValueChange={(v) => setRow(Number(v))}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }).map((_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)} className="num">ردیف {toFaDigits(i + 1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>ستون</Label>
              <Select value={String(col)} onValueChange={(v) => setCol(Number(v))}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }).map((_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)} className="num">ستون {toFaDigits(i + 1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>کالا (جستجو کن)</Label>
            <Input value={pQuery} onChange={(e) => setPQuery(e.target.value)} placeholder="نام کالا…" className="h-10" />
            {products && products.length > 0 && (
              <div className="max-h-36 overflow-y-auto nice-scroll space-y-1 rounded-xl border p-1">
                {products.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setProductId(p.id); setPQuery(p.name) }}
                    className={`w-full text-right rounded-lg px-3 py-2 text-xs transition-colors min-h-10 ${
                      productId === p.id ? 'bg-accent font-bold' : 'hover:bg-accent/60'
                    }`}
                  >
                    {p.name} <span className="text-muted-foreground num">({toFaDigits(p.stock)})</span>
                  </button>
                ))}
              </div>
            )}
            {productId && (
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setProductId(''); setPQuery('') }}>
                برداشتن کالا از قفسه
              </Button>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>انصراف</Button>
            <Button onClick={save} disabled={saving || !name.trim()} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} ذخیره
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
