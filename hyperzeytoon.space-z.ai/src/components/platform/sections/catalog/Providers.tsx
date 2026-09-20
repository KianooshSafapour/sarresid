'use client'

import * as React from 'react'
import { api, downloadBlob } from '@/lib/api'
import { useApp } from '@/store/app'
import { SectionHeader, EmptyState, LoadingBlock, StockIndicator, StatusBadge, OrnateDivider } from '@/components/platform/ui/shared'
import { money, toFaDigits, formatJalaliFull } from '@/lib/jalali'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToastAction } from '@/components/ui/toast'
import { useToast } from '@/hooks/use-toast'
import { Handshake, Plus, Loader2, Minus, ShoppingCart, Phone, Building2, ChevronDown, FileText, Printer, Download, Landmark, ReceiptText, TrendingUp, BookText, MapPin, Pencil, X } from 'lucide-react'

interface CompanyProduct {
  id: string
  name: string
  brand: string | null
  sellPrice: number
  stock: number
  minStock: number
  image: string | null
  unit: string
}
interface ProviderCompanyDTO {
  id: string
  name: string
  kind: string
  note: string | null
  isDirect: boolean
  productCount: number
  products: CompanyProduct[]
}
interface ProviderDTO {
  id: string
  name: string
  phone: string | null
  kind: string
  color: string
  notes: string | null
  paymentTermsDays: number | null
  city: string | null
  province: string | null
  companies: ProviderCompanyDTO[]
}
interface CompanyDTO {
  id: string
  name: string
  kind: string
  providerCount: number
}

interface StatementRow {
  id: string
  type: 'ORDER' | 'PAYMENT' | 'CHEQUE'
  date: string
  label: string
  ref: string
  debit: number
  credit: number
  balance: number
}
interface StatementDTO {
  provider: { id: string; name: string; phone: string | null; kind: string; color: string; companies: string[] }
  rows: StatementRow[]
  summary: {
    purchases: number
    paidOther: number
    settledCheques: number
    balance: number
    ordersCount: number
    cancelledCount: number
    openChequeCount: number
    openChequeAmount: number
    lastActivityAt: string | null
  }
  generatedAt: string
  generatedByName: string
}

const KIND_LABELS: Record<string, string> = {
  DIRECT: 'مستقیم از تولیدکننده',
  DISTRIBUTOR: 'مرکز توزیع',
}
const COMPANY_KINDS: Record<string, string> = {
  MANUFACTURER: 'تولیدکننده',
  DISTRIBUTION_CENTER: 'مرکز توزیع',
  BOTH: 'تولید و توزیع',
}
// استان‌های ایران (۳۱ استان) — فهرست محلی برای انتخاب استان تأمین‌کننده
const IRAN_PROVINCES = [
  'آذربایجان شرقی', 'آذربایجان غربی', 'اردبیل', 'اصفهان', 'البرز', 'ایلام', 'بوشهر', 'تهران',
  'چهارمحال و بختیاری', 'خراسان جنوبی', 'خراسان رضوی', 'خراسان شمالی', 'خوزستان', 'زنجان', 'سمنان',
  'سیستان و بلوچستان', 'فارس', 'قزوین', 'قم', 'کردستان', 'کرمان', 'کرمانشاه', 'کهگیلویه و بویراحمد',
  'گلستان', 'گیلان', 'لرستان', 'مازندران', 'مرکزی', 'هرمزگان', 'همدان', 'یزد',
]
const CARD_COLORS = ['#3E7C59', '#C9A227', '#B07D2B', '#B33A3A', '#8A6F3C', '#7D5BA6']
function colorOf(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return CARD_COLORS[h % CARD_COLORS.length]
}

export function Providers() {
  const { toast } = useToast()
  const user = useApp((s) => s.user)
  const setSection = useApp((s) => s.setSection)
  const setQuickAction = useApp((s) => s.setQuickAction)
  const isManager = !!user?.isManager

  const [providers, setProviders] = React.useState<ProviderDTO[]>([])
  const [loading, setLoading] = React.useState(true)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [activeCompany, setActiveCompany] = React.useState<Record<string, string>>({})

  // create dialog
  const [createOpen, setCreateOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [form, setForm] = React.useState({ name: '', phone: '', kind: 'DISTRIBUTOR', paymentTermsDays: '', city: '', province: '' })
  const [companies, setCompanies] = React.useState<CompanyDTO[]>([])
  const [picked, setPicked] = React.useState<string[]>([])
  const [newCompanyOpen, setNewCompanyOpen] = React.useState(false)
  const [newCompany, setNewCompany] = React.useState({ name: '', kind: 'MANUFACTURER' })
  const [creatingCompany, setCreatingCompany] = React.useState(false)

  // edit dialog (task 9-a) — payment terms / city / province
  const [editOpen, setEditOpen] = React.useState(false)
  const [editSaving, setEditSaving] = React.useState(false)
  const [editForm, setEditForm] = React.useState({ name: '', phone: '', kind: 'DISTRIBUTOR', paymentTermsDays: '', city: '', province: '' })

  // statement dialog
  const [statement, setStatement] = React.useState<StatementDTO | null>(null)
  const [statementOpen, setStatementOpen] = React.useState(false)
  const [statementLoading, setStatementLoading] = React.useState(false)
  const [exportingStatement, setExportingStatement] = React.useState(false)
  const [exportingAll, setExportingAll] = React.useState(false)
  const canSeeStatement = isManager || !!user?.roleKeys.includes('accountant')

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<{ providers: ProviderDTO[] }>('/api/providers')
      setProviders(data.providers)
      setSelectedId((cur) => cur ?? data.providers[0]?.id ?? null)
    } catch (e) {
      toast({ title: 'خطا در دریافت تأمین‌کنندگان', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  React.useEffect(() => {
    load()
  }, [load])

  const loadCompanies = React.useCallback(async () => {
    try {
      const data = await api<{ companies: CompanyDTO[] }>('/api/companies')
      setCompanies(data.companies)
    } catch (e) {
      toast({ title: 'خطا در دریافت شرکت‌ها', description: (e as Error).message, variant: 'destructive' })
    }
  }, [toast])

  const openCreate = async () => {
    setForm({ name: '', phone: '', kind: 'DISTRIBUTOR', paymentTermsDays: '', city: '', province: '' })
    setPicked([])
    setNewCompanyOpen(false)
    setCreateOpen(true)
    await loadCompanies()
  }

  const openEdit = async () => {
    if (!selected) return
    setEditForm({
      name: selected.name,
      phone: selected.phone ?? '',
      kind: selected.kind,
      paymentTermsDays: selected.paymentTermsDays != null ? String(selected.paymentTermsDays) : '',
      city: selected.city ?? '',
      province: selected.province ?? '',
    })
    setEditOpen(true)
    await loadCompanies()
  }

  const submitEdit = async () => {
    if (!selected) return
    if (!editForm.name.trim()) {
      toast({ title: 'نام تأمین‌کننده الزامی است', variant: 'destructive' })
      return
    }
    setEditSaving(true)
    try {
      await api(`/api/providers/${selected.id}`, {
        method: 'PATCH',
        body: {
          name: editForm.name.trim(),
          phone: editForm.phone.trim() || null,
          kind: editForm.kind,
          paymentTermsDays: editForm.paymentTermsDays === '' ? null : Number(editForm.paymentTermsDays),
          city: editForm.city.trim() || null,
          province: editForm.province || null,
        },
      })
      toast({ title: 'تأمین‌کننده ویرایش شد ✅', description: editForm.name })
      setEditOpen(false)
      load()
    } catch (e) {
      toast({ title: 'ویرایش ناموفق', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setEditSaving(false)
    }
  }

  const submitCreate = async () => {
    if (!form.name.trim()) {
      toast({ title: 'نام تأمین‌کننده الزامی است', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await api('/api/providers', {
        body: {
          ...form,
          paymentTermsDays: form.paymentTermsDays === '' ? undefined : Number(form.paymentTermsDays),
          city: form.city.trim() || undefined,
          province: form.province || undefined,
          companyIds: picked,
        },
      })
      toast({ title: 'تأمین‌کننده ثبت شد', description: form.name })
      setCreateOpen(false)
      load()
    } catch (e) {
      toast({ title: 'ثبت ناموفق', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const submitCompany = async () => {
    if (!newCompany.name.trim()) {
      toast({ title: 'نام شرکت الزامی است', variant: 'destructive' })
      return
    }
    setCreatingCompany(true)
    try {
      const res = await api<{ id: string }>('/api/companies', { body: newCompany })
      toast({ title: 'شرکت ثبت شد', description: newCompany.name })
      setPicked((p) => (res.id ? [...p, res.id] : p))
      setNewCompany({ name: '', kind: 'MANUFACTURER' })
      setNewCompanyOpen(false)
      await loadCompanies()
    } catch (e) {
      toast({ title: 'ثبت شرکت ناموفق', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setCreatingCompany(false)
    }
  }

  const openStatement = async (providerId: string) => {
    setStatementOpen(true)
    setStatementLoading(true)
    try {
      const data = await api<StatementDTO>(`/api/providers/${providerId}/statement`)
      setStatement(data)
    } catch (e) {
      toast({ title: 'خطا در دریافت صورت‌حساب', description: (e as Error).message, variant: 'destructive' })
      setStatementOpen(false)
    } finally {
      setStatementLoading(false)
    }
  }

  const exportStatementXlsx = async () => {
    if (!statement) return
    setExportingStatement(true)
    try {
      await downloadBlob(
        `/api/providers/${statement.provider.id}/statement?format=xlsx`,
        `statement-${statement.provider.name.replace(/\s+/g, '-')}.xlsx`
      )
      toast({ title: 'صورت‌حساب اکسل دانلود شد', description: 'قابل بایگانی در پرونده تأمین‌کننده' })
    } catch (e) {
      toast({ title: 'خروجی اکسل ناموفق', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setExportingStatement(false)
    }
  }

  const exportAllStatements = async () => {
    setExportingAll(true)
    try {
      await downloadBlob('/api/providers/statements-bulk', 'statements-all-providers.xlsx')
      toast({ title: 'کتاب صورت‌حساب جمعی دانلود شد', description: 'یک برگ خلاصه + یک برگ برای هر تأمین‌کننده فعال' })
    } catch (e) {
      toast({ title: 'خروجی جمعی ناموفق', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setExportingAll(false)
    }
  }

  // ---------- quick order contract ----------
  // localStorage keys consumed by the Orders section (task 2-a / orders team):
  //   hz_prefill_provider  = providerId string
  //   hz_prefill_items     = JSON [{productId, qty}]
  const quickOrder = (providerId: string, productId: string, qty: number) => {
    try {
      window.localStorage.setItem('hz_prefill_provider', providerId)
      window.localStorage.setItem('hz_prefill_items', JSON.stringify([{ productId, qty: Math.max(1, qty) }]))
    } catch {
      /* storage unavailable — ignore */
    }
    setQuickAction('new-order')
    toast({
      title: 'به سفارش‌ساز منتقل شوید',
      description: 'کالا و تعداد آماده شد؛ سفارش جدید را تکمیل کنید.',
      action: (
        <ToastAction altText="رفتن به سفارش‌ها" onClick={() => setSection('orders')}>
          رفتن به سفارش‌ها
        </ToastAction>
      ),
      duration: 8000,
    })
  }

  const selected = providers.find((p) => p.id === selectedId) ?? null

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={<Handshake className="h-6 w-6" />}
        title="تأمین‌کنندگان"
        subtitle={`${toFaDigits(providers.length)} تأمین‌کننده در شبکه تأمین`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canSeeStatement && (
              <Button
                variant="outline"
                onClick={exportAllStatements}
                disabled={exportingAll}
                className="min-h-11 gap-1.5 border-[#C9A227]/40 text-[#8A6F3C] hover:bg-[#C9A227]/10"
              >
                {exportingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookText className="h-4 w-4" />}
                صورت‌حساب همه (اکسل)
              </Button>
            )}
            {isManager ? (
              <Button onClick={openCreate} className="min-h-11">
                <Plus className="h-4 w-4" /> تأمین‌کننده جدید
              </Button>
            ) : null}
          </div>
        }
      />

      {loading ? (
        <LoadingBlock rows={4} />
      ) : providers.length === 0 ? (
        <EmptyState
          icon={<Handshake />}
          title="تأمین‌کننده‌ای ثبت نشده است"
          description="اولین تأمین‌کننده شبکه تأمین را اضافه کنید."
          action={
            isManager ? (
              <Button onClick={openCreate} className="min-h-11">
                <Plus className="h-4 w-4" /> تأمین‌کننده جدید
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* ---------- provider cards ---------- */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                aria-pressed={selectedId === p.id}
                className={`glow-border-static rounded-2xl border bg-card p-4 text-right transition-all focus-visible:ring-2 focus-visible:ring-ring ${
                  selectedId === p.id ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:-translate-y-0.5'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground mt-1 num" dir="ltr">
                      {p.phone ? toFaDigits(p.phone) : '—'}
                    </p>
                  </div>
                  <StatusBadge
                    label={KIND_LABELS[p.kind] ?? p.kind}
                    color={p.kind === 'DIRECT' ? '#3E7C59' : '#B07D2B'}
                  />
                </div>
                <div className="flex flex-wrap gap-1 mt-3">
                  {(p.city || p.province) && (
                    <Badge variant="outline" className="text-[10px] bg-accent" title={p.province ? `استان ${p.province}` : undefined}>
                      <MapPin className="h-3 w-3 me-1" />
                      {p.city ?? p.province}
                    </Badge>
                  )}
                  {p.paymentTermsDays != null && p.paymentTermsDays > 0 && (
                    <Badge variant="outline" className="text-[10px] bg-[#3E7C59]/10 text-[#3E7C59] border-[#3E7C59]/30" title="شرایط پرداخت: چک N روزه">
                      <Landmark className="h-3 w-3 me-1" />
                      چک {toFaDigits(p.paymentTermsDays)} روزه
                    </Badge>
                  )}
                  {p.companies.length === 0 && !p.city && !p.province && (
                    <span className="text-xs text-muted-foreground">بدون شرکت</span>
                  )}
                  {p.companies.map((c) => (
                    <Badge key={c.id} variant="outline" className="text-[10px] bg-accent">
                      <Building2 className="h-3 w-3 me-1" />
                      {c.name}
                    </Badge>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="num">{toFaDigits(p.companies.length)} شرکت</span>
                  <span className="inline-flex items-center gap-1">
                    {selectedId === p.id ? 'بستن جزئیات' : 'مشاهده محصولات'}
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${selectedId === p.id ? 'rotate-180' : ''}`} />
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* ---------- expanded panel ---------- */}
          {selected && (
            <section className="rounded-2xl border border-border bg-card p-4 space-y-4" aria-label={`محصولات ${selected.name}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-bold flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-primary" />
                  محصولات {selected.name}
                </h2>
                <div className="flex items-center gap-2">
                  {selected.phone && (
                    <a
                      href={`tel:${selected.phone}`}
                      className="text-xs text-primary inline-flex items-center gap-1.5 min-h-11 md:min-h-0"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      <span className="num" dir="ltr">{toFaDigits(selected.phone)}</span>
                    </a>
                  )}
                  {isManager && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11 md:min-h-9 gap-1.5"
                      onClick={openEdit}
                    >
                      <Pencil className="h-3.5 w-3.5" /> ویرایش
                    </Button>
                  )}
                  {(isManager || user?.roleKeys.includes('accountant')) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11 md:min-h-9 gap-1.5 border-[#C9A227]/40 text-[#8A6F3C] hover:bg-[#C9A227]/10"
                      onClick={() => openStatement(selected.id)}
                    >
                      <FileText className="h-3.5 w-3.5" /> صورت‌حساب
                    </Button>
                  )}
                </div>
              </div>

              {selected.companies.length === 0 ? (
                <EmptyState icon={<Building2 />} title="شرکتی به این تأمین‌کننده متصل نیست" description="از مدیریت، شرکت‌ها را به این تأمین‌کننده اضافه کنید." />
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.companies.map((c, i) => {
                      const cur = activeCompany[selected.id] ?? selected.companies[0].id
                      const active = cur === c.id
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setActiveCompany((m) => ({ ...m, [selected.id]: c.id }))}
                          className={`rounded-full px-3 py-2 text-xs font-medium border transition-colors min-h-11 md:min-h-0 ${
                            active ? 'text-white border-transparent' : 'bg-card text-foreground/80 hover:bg-accent'
                          }`}
                          style={active ? { backgroundColor: CARD_COLORS[i % CARD_COLORS.length] } : { borderColor: `${CARD_COLORS[i % CARD_COLORS.length]}55` }}
                        >
                          {c.name}
                          <span className="num opacity-70"> ({toFaDigits(c.productCount)})</span>
                        </button>
                      )
                    })}
                  </div>

                  {(() => {
                    const cur = activeCompany[selected.id] ?? selected.companies[0].id
                    const company = selected.companies.find((c) => c.id === cur)
                    if (!company) return null
                    if (company.products.length === 0) {
                      return (
                        <EmptyState
                          icon={<ShoppingCart />}
                          title="محصولی برای این شرکت پیدا نشد"
                          description="بر اساس برند کالاها تطبیق انجام شد؛ موردی یافت نشد."
                        />
                      )
                    }
                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {company.products.map((prod) => (
                          <ProviderProductCard
                            key={prod.id}
                            product={prod}
                            companyName={company.name}
                            onQuickOrder={(qty) => quickOrder(selected.id, prod.id, qty)}
                          />
                        ))}
                      </div>
                    )
                  })()}
                </>
              )}
            </section>
          )}
        </>
      )}

      {/* ---------- account statement dialog ---------- */}
      <StatementDialog
        open={statementOpen}
        onOpenChange={setStatementOpen}
        data={statement}
        loading={statementLoading}
        onExport={exportStatementXlsx}
        exporting={exportingStatement}
      />

      {/* ---------- create provider dialog ---------- */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle>تأمین‌کننده جدید</DialogTitle>
            <DialogDescription>اطلاعات تأمین‌کننده و شرکت‌های مرتبط را ثبت کنید.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="pr-name">نام تأمین‌کننده *</Label>
              <Input id="pr-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="pr-phone">تلفن</Label>
                <Input id="pr-phone" className="num" inputMode="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>نوع</Label>
                <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v }))}>
                  <SelectTrigger aria-label="نوع تأمین‌کننده"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DIRECT">مستقیم از تولیدکننده</SelectItem>
                    <SelectItem value="DISTRIBUTOR">مرکز توزیع</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <ProviderGeoTermsFields
              terms={form.paymentTermsDays}
              city={form.city}
              province={form.province}
              onTerms={(v) => setForm((f) => ({ ...f, paymentTermsDays: v }))}
              onCity={(v) => setForm((f) => ({ ...f, city: v }))}
              onProvince={(v) => setForm((f) => ({ ...f, province: v }))}
            />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>شرکت‌ها</Label>
                <Button variant="ghost" size="sm" className="min-h-9" onClick={() => setNewCompanyOpen((v) => !v)}>
                  <Plus className="h-3.5 w-3.5" /> شرکت جدید
                </Button>
              </div>
              {newCompanyOpen && (
                <div className="rounded-xl border border-dashed border-border p-3 space-y-2 bg-accent/30">
                  <Input
                    placeholder="نام شرکت…"
                    value={newCompany.name}
                    onChange={(e) => setNewCompany((c) => ({ ...c, name: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <Select value={newCompany.kind} onValueChange={(v) => setNewCompany((c) => ({ ...c, kind: v }))}>
                      <SelectTrigger className="flex-1" aria-label="نوع شرکت"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MANUFACTURER">تولیدکننده</SelectItem>
                        <SelectItem value="DISTRIBUTION_CENTER">مرکز توزیع</SelectItem>
                        <SelectItem value="BOTH">تولید و توزیع</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="secondary" onClick={submitCompany} disabled={creatingCompany} className="min-h-11">
                      {creatingCompany ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      ثبت شرکت
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto rounded-xl border border-border p-2">
                {companies.length === 0 && <span className="text-xs text-muted-foreground p-1">شرکتی ثبت نشده است</span>}
                {companies.map((c) => {
                  const active = picked.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setPicked((p) => (active ? p.filter((x) => x !== c.id) : [...p, c.id]))}
                      className={`rounded-full px-3 py-1.5 text-xs border transition-colors min-h-9 ${
                        active ? 'text-white border-transparent bg-primary' : 'bg-card hover:bg-accent'
                      }`}
                    >
                      {c.name}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="min-h-11">انصراف</Button>
            <Button onClick={submitCreate} disabled={saving} className="min-h-11">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              ثبت تأمین‌کننده
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- edit provider dialog (task 9-a) ---------- */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle>ویرایش تأمین‌کننده</DialogTitle>
            <DialogDescription>اطلاعات تأمین‌کننده و شرایط پرداخت را به‌روزرسانی کنید.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="pe-name">نام تأمین‌کننده *</Label>
              <Input id="pe-name" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="pe-phone">تلفن</Label>
                <Input id="pe-phone" className="num" inputMode="tel" value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>نوع</Label>
                <Select value={editForm.kind} onValueChange={(v) => setEditForm((f) => ({ ...f, kind: v }))}>
                  <SelectTrigger aria-label="نوع تأمین‌کننده"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DIRECT">مستقیم از تولیدکننده</SelectItem>
                    <SelectItem value="DISTRIBUTOR">مرکز توزیع</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <ProviderGeoTermsFields
              terms={editForm.paymentTermsDays}
              city={editForm.city}
              province={editForm.province}
              onTerms={(v) => setEditForm((f) => ({ ...f, paymentTermsDays: v }))}
              onCity={(v) => setEditForm((f) => ({ ...f, city: v }))}
              onProvince={(v) => setEditForm((f) => ({ ...f, province: v }))}
            />
            <p className="text-[11px] text-muted-foreground leading-5">
              شرایط پرداخت در سفارش‌ساز به‌صورت نشان «چک N روزه» نمایش داده می‌شود و سررسید پیشنهادی چک (تاریخ دریافت + N روز) را می‌سازد.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)} className="min-h-11">انصراف</Button>
            <Button onClick={submitEdit} disabled={editSaving} className="min-h-11">
              {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
              ذخیره تغییرات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------- shared geo/terms fields for create + edit dialogs (task 9-a) ----------
function ProviderGeoTermsFields({
  terms, city, province, onTerms, onCity, onProvince,
}: {
  terms: string
  city: string
  province: string
  onTerms: (v: string) => void
  onCity: (v: string) => void
  onProvince: (v: string) => void
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <div className="space-y-1">
        <Label>شرایط پرداخت (روز چک)</Label>
        <Input
          className="num"
          inputMode="numeric"
          value={terms}
          onChange={(e) => onTerms(e.target.value.replace(/[^\d]/g, ''))}
          placeholder="۴۵"
          aria-label="شرایط پرداخت به روز"
        />
      </div>
      <div className="space-y-1">
        <Label>شهر</Label>
        <Input value={city} onChange={(e) => onCity(e.target.value)} placeholder="کرمان" aria-label="شهر" />
      </div>
      <div className="space-y-1 col-span-2 sm:col-span-1">
        <Label>استان</Label>
        <div className="flex items-center gap-1">
          <Select value={province || undefined} onValueChange={onProvince}>
            <SelectTrigger aria-label="استان" className="flex-1">
              <SelectValue placeholder="انتخاب استان" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {IRAN_PROVINCES.map((pr) => (
                <SelectItem key={pr} value={pr}>{pr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {province && (
            <Button variant="ghost" size="sm" className="h-9 w-9 p-0 shrink-0" aria-label="پاک کردن استان" onClick={() => onProvince('')}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------- product card with quick-order popover ----------
function ProviderProductCard({
  product,
  companyName,
  onQuickOrder,
}: {
  product: CompanyProduct
  companyName: string
  onQuickOrder: (qty: number) => void
}) {
  const [qty, setQty] = React.useState(1)
  const [open, setOpen] = React.useState(false)

  return (
    <div className="rounded-2xl border border-border bg-card p-3 flex flex-col">
      {product.image ? (
        <img src={product.image} alt={product.name} className="h-24 w-full rounded-xl object-cover border border-border bg-muted" loading="lazy" />
      ) : (
        <div
          className="h-24 w-full rounded-xl flex items-center justify-center text-3xl font-black text-white/90"
          style={{ background: `linear-gradient(135deg, ${colorOf(product.name)}, ${colorOf(product.name)}c0)` }}
          aria-hidden
        >
          {product.name.trim()[0] ?? '؟'}
        </div>
      )}
      <p className="text-sm font-bold mt-2 line-clamp-2 leading-5 min-h-10">{product.name}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{companyName}</p>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-xs num">{money(product.sellPrice)} <span className="text-muted-foreground">تومان</span></span>
        <StockIndicator stock={product.stock} minStock={product.minStock} showLabel={false} />
      </div>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setQty(1) }}>
        <PopoverTrigger asChild>
          <Button variant="secondary" size="sm" className="mt-2 min-h-9 w-full">
            <ShoppingCart className="h-3.5 w-3.5" /> سفارش
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-60 p-3" align="center">
          <p className="text-xs font-bold mb-2 line-clamp-1">{product.name}</p>
          <div className="flex items-center justify-center gap-2 mb-3">
            <Button variant="outline" size="icon" className="h-9 w-9" aria-label="کاهش تعداد" onClick={() => setQty((q) => Math.max(1, q - 1))}>
              <Minus className="h-4 w-4" />
            </Button>
            <Input
              className="num h-9 w-16 text-center"
              inputMode="numeric"
              value={toFaDigits(qty)}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/[^\d]/g, ''))
                setQty(Number.isFinite(n) && n > 0 ? Math.min(9999, n) : 1)
              }}
              aria-label="تعداد"
            />
            <Button variant="outline" size="icon" className="h-9 w-9" aria-label="افزایش تعداد" onClick={() => setQty((q) => Math.min(9999, q + 1))}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <Button
            className="w-full min-h-11"
            onClick={() => {
              onQuickOrder(qty)
              setOpen(false)
            }}
          >
            <ShoppingCart className="h-4 w-4" /> افزودن به سفارش
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  )
}

// ------------------------------------------------------------------
// Account statement dialog — accounting-grade ledger with print sheet
// ------------------------------------------------------------------

const ROW_TYPE_STYLE: Record<StatementRow['type'], { label: string; color: string }> = {
  ORDER: { label: 'خرید', color: '#B33A3A' },
  PAYMENT: { label: 'پرداخت', color: '#3E7C59' },
  CHEQUE: { label: 'چک', color: '#8A6F3C' },
}

function printStatementSheet(data: StatementDTO) {
  const s = data.summary
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const rowsHtml = data.rows
    .map(
      (r) => `<tr>
        <td class="num">${toFaDigits(formatJalaliFull(new Date(r.date)))}</td>
        <td>${esc(r.label)}</td>
        <td class="num">${esc(r.ref)}</td>
        <td class="num debit">${r.debit ? toFaDigits(money(r.debit)) : '—'}</td>
        <td class="num credit">${r.credit ? toFaDigits(money(r.credit)) : '—'}</td>
        <td class="num balance">${toFaDigits(money(r.balance))}</td>
      </tr>`
    )
    .join('')
  const html = `<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8">
  <title>صورت‌حساب ${esc(data.provider.name)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Tahoma, 'Iranian Sans', sans-serif; padding: 32px 40px; color: #1c241f; }
    .brand { text-align: center; border-bottom: 3px double #C9A227; padding-bottom: 14px; margin-bottom: 6px; }
    .brand h1 { font-size: 22px; margin: 0 0 4px; }
    .brand .sub { color: #8A6F3C; font-size: 12px; letter-spacing: 2px; }
    h2 { text-align: center; font-size: 16px; margin: 18px 0 4px; }
    .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 18px; font-size: 12px; margin: 14px 0; }
    .meta b { color: #8A6F3C; }
    table { width: 100%; border-collapse: collapse; font-size: 11.5px; margin-top: 10px; }
    th { background: #3E7C59; color: #fff; padding: 7px 6px; font-size: 11px; }
    td { border: 1px solid #d8ded9; padding: 6px; text-align: center; }
    tr:nth-child(even) td { background: #f6f8f6; }
    .debit { color: #B33A3A; } .credit { color: #3E7C59; } .balance { font-weight: bold; color: #8A6F3C; }
    .summary { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 18px; font-size: 12.5px; }
    .sumbox { border: 1px solid #C9A22766; border-radius: 10px; padding: 10px 14px; display: flex; justify-content: space-between; }
    .sumbox.total { background: #3E7C5912; border-color: #3E7C59; font-weight: bold; }
    .sigs { display: flex; justify-content: space-between; margin-top: 52px; font-size: 12px; }
    .sigs span { border-top: 1px solid #999; padding-top: 6px; width: 26%; text-align: center; }
    .foot { text-align: center; color: #999; font-size: 10px; margin-top: 26px; border-top: 1px dashed #C9A22788; padding-top: 8px; }
  </style></head><body>
    <div class="brand"><h1>هایپر زیتون ✦</h1><div class="sub">HYPER ZEYTOON — KERMAN</div></div>
    <h2>صورت‌حساب تأمین‌کننده — ${esc(data.provider.name)}</h2>
    <div class="meta">
      <div><b>تلفن:</b> ${toFaDigits(data.provider.phone ?? '—')}</div>
      <div><b>تاریخ تهیه:</b> ${toFaDigits(formatJalaliFull(new Date(data.generatedAt)))}</div>
      <div><b>تهیه‌کننده:</b> ${esc(data.generatedByName)}</div>
    </div>
    <table>
      <thead><tr><th>تاریخ</th><th>شرح</th><th>سند</th><th>بدهکار (خرید)</th><th>بستانکار (پرداخت)</th><th>مانده</th></tr></thead>
      <tbody>${rowsHtml || '<tr><td colspan="6">گردشی ثبت نشده است</td></tr>'}</tbody>
    </table>
    <div class="summary">
      <div class="sumbox"><span>جمع خریدها</span><b class="num">${toFaDigits(money(s.purchases))} تومان</b></div>
      <div class="sumbox"><span>پرداخت‌های نقدی/کارت‌به‌کارت</span><b class="num">${toFaDigits(money(s.paidOther))} تومان</b></div>
      <div class="sumbox"><span>چک‌های تحویل‌شده</span><b class="num">${toFaDigits(money(s.settledCheques))} تومان</b></div>
      <div class="sumbox total"><span>مانده بدهی ما به تأمین‌کننده</span><b class="num">${toFaDigits(money(s.balance))} تومان</b></div>
      <div class="sumbox"><span>چک‌های در جریان</span><b class="num">${toFaDigits(s.openChequeCount)} فقره — ${toFaDigits(money(s.openChequeAmount))} تومان</b></div>
      <div class="sumbox"><span>تعداد سفارش‌های تسویه‌شده</span><b class="num">${toFaDigits(s.ordersCount)}</b></div>
    </div>
    <div class="sigs"><span>حسابدار</span><span>خزانه‌دار</span><span>مدیریت</span></div>
    <div class="foot">این صورت‌حساب توسط پلتفرم داخلی هایپر زیتون تولید شده است — ✦</div>
    <script>window.onload = function () { window.print() }</script>
  </body></html>`
  const w = window.open('', '_blank', 'width=900,height=1000')
  if (!w) return false
  w.document.write(html)
  w.document.close()
  return true
}

function StatementDialog({
  open,
  onOpenChange,
  data,
  loading,
  onExport,
  exporting,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  data: StatementDTO | null
  loading: boolean
  onExport: () => void
  exporting: boolean
}) {
  const { toast } = useToast()

  const doPrint = () => {
    if (!data) return
    const okWin = printStatementSheet(data)
    if (!okWin) toast({ title: 'اجازه باز شدن پنجره چاپ داده نشد', description: 'مسدودکننده پاپ‌آپ را خاموش کنید', variant: 'destructive' })
  }

  const s = data?.summary
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-3xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader className="text-center items-center">
          <DialogTitle className="flex items-center justify-center gap-2">
            <Landmark className="h-5 w-5 text-[#C9A227]" />
            صورت‌حساب {data?.provider.name ?? 'تأمین‌کننده'}
          </DialogTitle>
          <DialogDescription>
            گردش خریدها، پرداخت‌ها و چک‌ها با مانده لحظه‌ای — معیار رسمی تسویه با تأمین‌کننده
          </DialogDescription>
          <OrnateDivider />
        </DialogHeader>

        {loading ? (
          <div className="py-14 flex justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
        ) : data && s ? (
          <div className="space-y-4">
            {/* summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <SumCard icon={<ReceiptText className="h-4 w-4" />} label="جمع خریدها" value={`${toFaDigits(money(s.purchases))}`} unit="تومان" color="#B33A3A" />
              <SumCard icon={<ShoppingCart className="h-4 w-4" />} label="پرداخت نقدی/کارت" value={`${toFaDigits(money(s.paidOther))}`} unit="تومان" color="#3E7C59" />
              <SumCard icon={<Landmark className="h-4 w-4" />} label="چک‌های تحویل‌شده" value={`${toFaDigits(money(s.settledCheques))}`} unit="تومان" color="#8A6F3C" />
              <SumCard
                icon={<TrendingUp className="h-4 w-4" />}
                label="مانده بدهی"
                value={`${toFaDigits(money(s.balance))}`}
                unit="تومان"
                color={s.balance > 0 ? '#B33A3A' : '#3E7C59'}
                highlight
              />
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="rounded-full bg-accent px-2.5 py-1">سفارش‌های تسویه‌شده: <b className="num">{toFaDigits(s.ordersCount)}</b></span>
              <span className="rounded-full bg-accent px-2.5 py-1">چک‌های در جریان: <b className="num">{toFaDigits(s.openChequeCount)}</b> فقره — <b className="num">{toFaDigits(money(s.openChequeAmount))}</b> تومان</span>
              {s.lastActivityAt && <span className="rounded-full bg-accent px-2.5 py-1">آخرین گردش: <b className="num">{toFaDigits(formatJalaliFull(new Date(s.lastActivityAt)))}</b></span>}
            </div>

            {/* ledger table */}
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="max-h-[42vh] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-primary text-primary-foreground z-10">
                    <tr>
                      <th className="py-2 px-2 font-medium">تاریخ</th>
                      <th className="py-2 px-2 font-medium text-right">شرح</th>
                      <th className="py-2 px-2 font-medium">سند</th>
                      <th className="py-2 px-2 font-medium">بدهکار</th>
                      <th className="py-2 px-2 font-medium">بستانکار</th>
                      <th className="py-2 px-2 font-medium">مانده</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">گردشی برای این تأمین‌کننده ثبت نشده است</td></tr>
                    )}
                    {data.rows.map((r, i) => {
                      const st = ROW_TYPE_STYLE[r.type]
                      return (
                        <tr key={r.id} className={`border-b border-border/60 ${i % 2 ? 'bg-accent/20' : ''} hover:bg-accent/40 transition-colors`}>
                          <td className="py-2 px-2 text-center num whitespace-nowrap">{toFaDigits(formatJalaliFull(new Date(r.date)))}</td>
                          <td className="py-2 px-2">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: st.color }} />
                              {r.label}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-center num" dir="ltr">{r.ref}</td>
                          <td className="py-2 px-2 text-center num text-[#B33A3A]">{r.debit ? toFaDigits(money(r.debit)) : '—'}</td>
                          <td className="py-2 px-2 text-center num text-[#3E7C59]">{r.credit ? toFaDigits(money(r.credit)) : '—'}</td>
                          <td className="py-2 px-2 text-center num font-bold text-[#8A6F3C]">{toFaDigits(money(r.balance))}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="min-h-11">بستن</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onExport} disabled={!data || exporting} className="min-h-11 gap-1.5">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} اکسل
            </Button>
            <Button onClick={doPrint} disabled={!data} className="min-h-11 gap-1.5">
              <Printer className="h-4 w-4" /> چاپ صورت‌حساب
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SumCard({
  icon,
  label,
  value,
  unit,
  color,
  highlight = false,
}: {
  icon: React.ReactNode
  label: string
  value: string
  unit: string
  color: string
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${highlight ? 'shadow-[0_0_0_1px_rgba(201,162,39,0.35)]' : ''}`}
      style={{ borderColor: `${color}44`, backgroundColor: `${color}0d` }}
    >
      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5" style={{ color }}>
        {icon} {label}
      </p>
      <p className="num font-extrabold text-sm mt-1 leading-none" style={{ color }}>
        {value} <span className="text-[10px] font-normal text-muted-foreground">{unit}</span>
      </p>
    </div>
  )
}
