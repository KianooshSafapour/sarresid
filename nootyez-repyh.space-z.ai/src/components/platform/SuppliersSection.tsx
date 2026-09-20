'use client'
import * as React from 'react'
import { toast } from 'sonner'
import { Truck, Pencil, Plus, ChevronLeft, Phone, Package, Boxes, Building2, ArrowRight, Search, History, FileSpreadsheet, AlertTriangle, BellRing, CheckCircle2, X } from 'lucide-react'
import { api, downloadFile } from '@/lib/api'
import { isoToJalali, toFaDigits } from '@/lib/jalali'
import { hasRole, type PUser, type SupplierT, type PriceImportInfo } from '@/lib/types'
import {
  Card, SectionHeader, Badge, StockBadge, stockDot, Field, inputCls, PrimaryButton, GoldButton,
  GhostButton, EmptyState, Loading, Modal, Money, ProductImage, Spinner, TimeAgo,
} from './kit'

/* ---------- local types ---------- */
type CompanyMini = { id: number; name: string }
type CompanyProduct = { id: number; name: string; stock: number; minStock: number; sellPrice: number; imageUrl: string | null; active: boolean }
type CompanyRow = {
  id: number
  name: string
  note?: string | null
  products: CompanyProduct[]
  suppliers?: { supplier: { id: number; name: string } }[]
}
type SupplierRow = SupplierT & {
  companies?: { company: CompanyMini }[]
  _count?: { products: number }
}

const KIND_META: Record<string, { label: string; cls: string }> = {
  MANUFACTURER: { label: 'تولیدکننده', cls: 'border-[#C8D8C0] bg-[#F3F7EF] text-[#3E6B4A]' },
  DISTRIBUTOR: { label: 'پخش', cls: 'border-[#EAD9A8] bg-[#FBF3DC] text-[#8A6508]' },
  BOTH: { label: 'هردو', cls: 'border-[#D9C9A8] bg-[#F5EFE0] text-[#6B5B2A]' },
}
const PAY_LABEL: Record<string, string> = { CASH: 'نقدی', CHEQUE: 'چک', MIXED: 'مختلط' }
const PAY_CLS: Record<string, string> = {
  CASH: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  CHEQUE: 'border-amber-200 bg-amber-50 text-amber-700',
  MIXED: 'border-stone-200 bg-stone-100 text-stone-600',
}

function KindBadge({ kind }: { kind: string }) {
  const m = KIND_META[kind] ?? { label: kind, cls: 'border-stone-200 bg-stone-100 text-stone-600' }
  return <Badge className={m.cls}>{m.label}</Badge>
}

function PayChip({ terms, chequeDays }: { terms: string; chequeDays: number }) {
  return (
    <Badge className={PAY_CLS[terms] ?? PAY_CLS.MIXED}>
      {PAY_LABEL[terms] ?? terms}
      {terms !== 'CASH' && chequeDays > 0 ? ` · ${toFaDigits(chequeDays)} روزه` : ''}
    </Badge>
  )
}

function CompanyChip({ name }: { name: string }) {
  return (
    <span className="inline-flex max-w-36 items-center gap-1.5 rounded-full border border-[#E4DCC8] bg-white py-0.5 pl-2.5 pr-0.5 text-xs font-medium text-[#4A5A44]">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3E6B4A] to-[#5F8F55] text-[10px] font-bold text-white" title={name}>
        {name.trim().charAt(0).toUpperCase()}
      </span>
      <span className="truncate">{name}</span>
    </span>
  )
}

function Crumb({ label, onClick, active }: { label: string; onClick?: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={active}
      className={`rounded-lg px-2 py-1 text-sm font-semibold transition ${active ? 'cursor-default text-[#253A2A]' : 'text-[#5F8F55] hover:bg-[#F3F7EF]'}`}
    >
      {label}
    </button>
  )
}

/** product mini-card — same look as ProductsSection (stock number at the bottom, colored) */
function ProductMiniCard({ p }: { p: CompanyProduct }) {
  return (
    <Card className={`flex flex-col gap-2 p-3 ${p.active ? '' : 'opacity-60'}`}>
      <div className="flex items-start justify-between gap-2">
        <ProductImage src={p.imageUrl} name={p.name} size={44} />
        <StockBadge stock={p.stock} minStock={p.minStock} />
      </div>
      <div className="truncate text-xs font-bold text-[#253A2A]" title={p.name}>{p.name}</div>
      <Money value={p.sellPrice} className="text-xs font-bold text-[#8A6508]" />
      <div className="mt-auto flex items-end justify-between border-t border-[#EFEAD8] pt-1.5">
        <span className={`text-2xl font-black leading-none tabular-nums ${stockDot(p.stock, p.minStock)}`}>
          {toFaDigits(Math.floor(p.stock))}
        </span>
        <span className="text-[10px] font-medium text-[#8A9884]">موجودی</span>
      </div>
    </Card>
  )
}

export default function SuppliersSection({ user }: { user: PUser }) {
  const manage =
    hasRole(user, 'GENERAL_MANAGER') || hasRole(user, 'PRODUCT_MANAGER') ||
    hasRole(user, 'OPERATION_MANAGER') || hasRole(user, 'IT_ADMIN')
  // price-list XLS export — same gate as the API (plus PRODUCT_MANAGER)
  const canExportPrices =
    hasRole(user, 'ACCOUNTANT') || hasRole(user, 'GENERAL_MANAGER') ||
    hasRole(user, 'OWNER') || hasRole(user, 'IT_ADMIN') || hasRole(user, 'PRODUCT_MANAGER')

  const [suppliers, setSuppliers] = React.useState<SupplierRow[]>([])
  const [companies, setCompanies] = React.useState<CompanyRow[]>([])
  const [priceImport, setPriceImport] = React.useState<PriceImportInfo | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')

  /* drill-down: list → supplier → company */
  const [openSupplier, setOpenSupplier] = React.useState<SupplierRow | null>(null)
  const [openCompany, setOpenCompany] = React.useState<CompanyRow | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [s, c] = await Promise.all([
        api.get<{ suppliers: SupplierRow[]; priceImport?: PriceImportInfo | null }>('/api/suppliers'),
        api.get<{ companies: CompanyRow[] }>('/api/companies'),
      ])
      setSuppliers(s.suppliers ?? [])
      setPriceImport(s.priceImport ?? null)
      setCompanies(c.companies ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در دریافت تامین‌کنندگان')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void load() }, [load])

  /* ---------- supplier modal ---------- */
  const [supOpen, setSupOpen] = React.useState(false)
  const [editingSup, setEditingSup] = React.useState<SupplierRow | null>(null)
  const [supForm, setSupForm] = React.useState({
    name: '', kind: 'DISTRIBUTOR', phone: '',
    paymentTerms: 'CASH', chequeDays: '30', note: '', companyIds: [] as number[],
  })
  const [savingSup, setSavingSup] = React.useState(false)

  const openSupplierModal = (s: SupplierRow | null) => {
    setEditingSup(s)
    setSupForm({
      name: s?.name ?? '',
      kind: s?.kind ?? 'DISTRIBUTOR',
      phone: s?.phone ?? '',
      paymentTerms: s?.paymentTerms ?? 'CASH',
      chequeDays: String(s?.chequeDays ?? 30),
      note: s?.note ?? '',
      companyIds: (s?.companies ?? []).map((c) => c.company.id),
    })
    setSupOpen(true)
  }

  const toggleCompany = (id: number) =>
    setSupForm((f) => ({
      ...f,
      companyIds: f.companyIds.includes(id) ? f.companyIds.filter((x) => x !== id) : [...f.companyIds, id],
    }))

  const saveSupplier = async () => {
    if (!supForm.name.trim()) { toast.error('نام تامین‌کننده الزامی است'); return }
    setSavingSup(true)
    try {
      const payload = {
        name: supForm.name.trim(),
        kind: supForm.kind,
        phone: supForm.phone.trim() || null,
        note: supForm.note.trim() || null,
        paymentTerms: supForm.paymentTerms,
        chequeDays: Number(supForm.chequeDays) || 0,
        companyIds: supForm.companyIds,
        userId: user.id,
        userName: user.name,
      }
      if (editingSup?.id) {
        await api.patch('/api/suppliers', { id: editingSup.id, ...payload })
        toast.success('تامین‌کننده بروزرسانی شد')
      } else {
        await api.post('/api/suppliers', payload)
        toast.success('تامین‌کننده جدید ثبت شد')
      }
      setSupOpen(false)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در ذخیره تامین‌کننده')
    } finally {
      setSavingSup(false)
    }
  }

  /* ---------- company modal ---------- */
  const [comOpen, setComOpen] = React.useState(false)
  const [comName, setComName] = React.useState('')
  const [savingCom, setSavingCom] = React.useState(false)

  const saveCompany = async () => {
    if (!comName.trim()) { toast.error('نام شرکت الزامی است'); return }
    setSavingCom(true)
    try {
      await api.post('/api/companies', { name: comName.trim(), userId: user.id, userName: user.name })
      toast.success('شرکت جدید ثبت شد')
      setComOpen(false)
      setComName('')
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در ثبت شرکت')
    } finally {
      setSavingCom(false)
    }
  }

  /* ---------- derived ---------- */
  const PRICE_STALE_MS = 30 * 24 * 3600 * 1000
  const priceStale = !priceImport || (Date.now() - new Date(priceImport.at).getTime()) > PRICE_STALE_MS

  /* ---------- stale price-list nudge banner (manager-only) ----------
   * Same stale rule as the API: supplier has products AND last price import is
   * missing or >30d old. One click → WARNING notifications to the PRODUCT_MANAGER
   * role (7-day server-side idempotency). Dismissal lives for the session. */
  const canNudge =
    hasRole(user, 'GENERAL_MANAGER') || hasRole(user, 'OPERATION_MANAGER') ||
    hasRole(user, 'OWNER') || hasRole(user, 'PRODUCT_MANAGER')
  const [nudgeDismissed, setNudgeDismissed] = React.useState(false)
  const [nudgeSent, setNudgeSent] = React.useState(false)
  const [sendingNudge, setSendingNudge] = React.useState(false)

  React.useEffect(() => {
    try { if (sessionStorage.getItem('hz_nudge_banner_dismissed') === '1') setNudgeDismissed(true) } catch { /* private mode */ }
  }, [])

  const dismissNudgeBanner = React.useCallback(() => {
    setNudgeDismissed(true)
    setNudgeSent(false)
    try { sessionStorage.setItem('hz_nudge_banner_dismissed', '1') } catch { /* ignore */ }
  }, [])

  // "sent" state auto-dismisses after ~6s (persists for the session)
  React.useEffect(() => {
    if (!nudgeSent) return
    const t = setTimeout(dismissNudgeBanner, 6000)
    return () => clearTimeout(t)
  }, [nudgeSent, dismissNudgeBanner])

  const staleSuppliers = React.useMemo(() => {
    return suppliers
      .map((s) => {
        const li = s.lastPriceImport ?? null
        const ms = li ? Date.now() - new Date(li.at).getTime() : null
        return {
          id: s.id,
          name: s.name,
          days: ms !== null ? Math.floor(ms / 86400000) : null,
          stale: ms === null || ms > PRICE_STALE_MS,
          productCount: s.productsCount ?? s._count?.products ?? 0,
        }
      })
      .filter((x) => x.productCount > 0 && x.stale)
      .sort((a, b) => {
        if (a.days === null && b.days !== null) return -1 // never-imported first (most urgent)
        if (b.days === null && a.days !== null) return 1
        if (a.days !== null && b.days !== null && a.days !== b.days) return b.days - a.days
        return a.name.localeCompare(b.name)
      })
  }, [suppliers])

  const sendNudge = async () => {
    setSendingNudge(true)
    try {
      const j = await api.post<{ created: number; suppliers: { id: number; name: string; skipped?: boolean }[]; recipients: number }>(
        '/api/suppliers/nudges',
        { userId: user.id },
      )
      const nudgedCount = (j.suppliers ?? []).filter((s) => !s.skipped).length
      if (j.created > 0 && nudgedCount > 0) {
        toast.success(`یادآوری برای ${toFaDigits(nudgedCount)} تأمین‌کننده ارسال شد ✓`)
      } else {
        toast.info('یادآوری این تأمین‌کننده‌ها اخیراً ارسال شده — تا ۷ روز دوباره ارسال نمی‌شود')
      }
      setNudgeSent(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در ارسال یادآوری')
    } finally {
      setSendingNudge(false)
    }
  }

  /* ---------- per-supplier price-list export (gold, round-trips with the import) ---------- */
  const [exportingId, setExportingId] = React.useState<number | null>(null)
  const exportPriceList = React.useCallback(async (s: SupplierRow) => {
    setExportingId(s.id)
    try {
      const j = isoToJalali(new Date())
      const slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '') || `supplier-${s.id}`
      await downloadFile(`/api/export/price-list?supplierId=${s.id}&userId=${user.id}`, `price-list-${slug}-${j.jy}-${j.jm}.xls`)
      toast.success(`فهرست قیمت ${s.name} دانلود شد ✓`)
    } catch (e) {
      toast.error(e instanceof Error && e.message !== 'Download failed' ? e.message : 'خطا در دریافت فهرست قیمت')
    } finally {
      setExportingId(null)
    }
  }, [user.id])

  /* ---------- bulk workbook: one sheet per supplier (accountant month-end pack) ---------- */
  const [exportingAll, setExportingAll] = React.useState(false)
  const exportAllPriceLists = React.useCallback(async () => {
    setExportingAll(true)
    try {
      const j = isoToJalali(new Date())
      await downloadFile(`/api/export/price-list?all=1&userId=${user.id}`, `price-lists-all-${j.jy}-${j.jm}.xls`)
      toast.success('همه فهرست‌ها دانلود شد ✓')
    } catch (e) {
      toast.error(e instanceof Error && e.message !== 'Download failed' ? e.message : 'خطا در دریافت فهرست‌های قیمت')
    } finally {
      setExportingAll(false)
    }
  }, [user.id])

  const q = search.trim().toLowerCase()
  const filteredSuppliers = q
    ? suppliers.filter((s) => s.name.toLowerCase().includes(q) || (s.companies ?? []).some((c) => c.company.name.toLowerCase().includes(q)))
    : suppliers

  const supplierCompanies = openSupplier
    ? (openSupplier.companies ?? []).map((c) => companies.find((x) => x.id === c.company.id)).filter((x): x is CompanyRow => !!x)
    : []

  /* ---------- render: company products ---------- */
  if (openSupplier && openCompany) {
    const lowCount = openCompany.products.filter((p) => p.stock <= p.minStock).length
    return (
      <div>
        <SectionHeader
          title={openCompany.name}
          subtitle={`محصولات شرکت ${openCompany.name} — ${toFaDigits(openCompany.products.length)} کالا${lowCount ? ` · ${toFaDigits(lowCount)} کمبود` : ''}`}
          icon={<Boxes className="h-5 w-5" />}
          actions={
            <GhostButton onClick={() => setOpenCompany(null)} className="min-h-[44px]">
              <ArrowRight className="h-4 w-4" /> بازگشت به {openSupplier.name}
            </GhostButton>
          }
        />
        <div className="mb-4 flex flex-wrap items-center gap-1 rounded-xl border border-[#E4DCC8] bg-white/80 px-2 py-1.5">
          <Crumb label="همه تامین‌کنندگان" onClick={() => { setOpenSupplier(null); setOpenCompany(null) }} />
          <ChevronLeft className="h-4 w-4 text-[#B8B29A]" />
          <Crumb label={openSupplier.name} onClick={() => setOpenCompany(null)} />
          <ChevronLeft className="h-4 w-4 text-[#B8B29A]" />
          <Crumb label={openCompany.name} active />
        </div>
        {openCompany.products.length === 0 ? (
          <EmptyState icon={<Boxes className="h-10 w-10" />} title="این شرکت هنوز کالایی ندارد" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {openCompany.products.map((p) => <ProductMiniCard key={p.id} p={p} />)}
          </div>
        )}
      </div>
    )
  }

  /* ---------- render: supplier companies ---------- */
  if (openSupplier) {
    return (
      <div>
        <SectionHeader
          title={openSupplier.name}
          subtitle="برای دیدن محصولات، شرکت را انتخاب کنید"
          icon={<Truck className="h-5 w-5" />}
          actions={
            <div className="flex gap-2">
              {manage && (
                <GhostButton onClick={() => openSupplierModal(openSupplier)} className="min-h-[44px]">
                  <Pencil className="h-4 w-4" /> ویرایش تامین‌کننده
                </GhostButton>
              )}
              <GhostButton onClick={() => setOpenSupplier(null)} className="min-h-[44px]">
                <ArrowRight className="h-4 w-4" /> همه تامین‌کنندگان
              </GhostButton>
            </div>
          }
        />
        <div className="mb-4 flex flex-wrap items-center gap-1 rounded-xl border border-[#E4DCC8] bg-white/80 px-2 py-1.5">
          <Crumb label="همه تامین‌کنندگان" onClick={() => setOpenSupplier(null)} />
          <ChevronLeft className="h-4 w-4 text-[#B8B29A]" />
          <Crumb label={openSupplier.name} active />
        </div>
        {supplierCompanies.length === 0 ? (
          <EmptyState icon={<Building2 className="h-10 w-10" />} title="شرکتی به این تامین‌کننده متصل نیست" hint="از دکمه ویرایش تامین‌کننده می‌توانید شرکت‌ها را متصل کنید." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {supplierCompanies.map((c) => {
              const low = c.products.filter((p) => p.stock <= p.minStock).length
              return (
                <Card
                  key={c.id}
                  onClick={() => setOpenCompany(c)}
                  className="flex cursor-pointer items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:border-[#5F8F55] hover:shadow-lg"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#3E6B4A] to-[#5F8F55] text-lg font-bold text-white" title={c.name}>
                    {c.name.trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-[#253A2A]">{c.name}</div>
                    <div className="mt-0.5 flex flex-wrap gap-1.5 text-[11px]">
                      <Badge className="border-[#E4DCC8] bg-white text-[#4A5A44]">{toFaDigits(c.products.length)} محصول</Badge>
                      {low > 0 && <Badge className="border-amber-200 bg-amber-50 text-amber-700">{toFaDigits(low)} کمبود</Badge>}
                    </div>
                  </div>
                  <ChevronLeft className="h-5 w-5 shrink-0 text-[#B8B29A]" />
                </Card>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  /* ---------- render: list ---------- */
  return (
    <div>
      <SectionHeader
        title="تامین‌کنندگان | Suppliers"
        subtitle="تولیدی‌ها و پخش‌ها، شرکت‌ها و محصولات هرکدام"
        icon={<Truck className="h-5 w-5" />}
        actions={
          manage ? (
            <>
              <GhostButton onClick={() => setComOpen(true)} className="min-h-[44px]">
                <Plus className="h-4 w-4" /> شرکت جدید
              </GhostButton>
              <PrimaryButton onClick={() => openSupplierModal(null)} className="min-h-[44px]">
                <Plus className="h-4 w-4" /> تامین‌کننده جدید
              </PrimaryButton>
            </>
          ) : undefined
        }
      />

      {/* price-list recency chip — amber when the last price import is older than 30 days (or never) +
          bulk workbook export (one sheet per supplier) beside it; flex-wrap keeps 390px free of h-scroll */}
      {!loading && (
        <div className="mb-4 flex flex-wrap items-center gap-2" data-price-recency data-price-stale={priceStale ? '1' : '0'}>
          <Badge
            className={priceStale
              ? 'border-amber-300 bg-amber-50 px-3 py-1.5 text-amber-800'
              : 'border-[#C8D8C0] bg-[#F3F7EF] px-3 py-1.5 text-[#3E6B4A]'}
          >
            <History className="h-3.5 w-3.5 shrink-0" />
            <span className="font-semibold">
              فهرست قیمت‌ها: {priceImport ? (
                <>آخرین ورود <TimeAgo iso={priceImport.at} /> — {priceImport.by}</>
              ) : (
                'تاکنون وارد نشده'
              )}
            </span>
            {priceStale && (
              <span className="font-bold">— ورود فهرست قیمت | Import price list</span>
            )}
          </Badge>
          {canExportPrices && (
            <button
              type="button"
              onClick={() => void exportAllPriceLists()}
              disabled={exportingAll}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[#EAD9A8] bg-[#FBF6E8] px-3.5 py-2 text-xs font-bold text-[#8A6508] transition hover:bg-[#F5EDD3] disabled:cursor-not-allowed disabled:opacity-50"
              title="دانلود فهرست قیمت همه تأمین‌کنندگان در یک فایل اکسل — هر تأمین‌کننده یک برگه"
              aria-label="دانلود همه فهرست‌های قیمت"
              data-price-list-export-all
            >
              {exportingAll ? <Spinner className="h-4 w-4" /> : <FileSpreadsheet className="h-4 w-4" />}
              همه فهرست‌های قیمت (اکسل)
            </button>
          )}
        </div>
      )}

      <div className="relative mb-4">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A8A28C]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="جستجوی تامین‌کننده یا شرکت…"
          className={`${inputCls} min-h-[44px] pr-9`}
          aria-label="جستجوی تامین‌کننده"
        />
      </div>

      {/* stale price-list nudge banner — manager-only, dismissible for the session;
          gold send → WARNING notifications to the PRODUCT_MANAGER role (7-day guard) */}
      {!loading && canNudge && !nudgeDismissed && staleSuppliers.length > 0 && (
        nudgeSent ? (
          <div
            className="pz-banner-in mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#C8D8C0] bg-gradient-to-l from-[#F3F7EF] to-[#EAF2E4] p-4 shadow-sm"
            data-nudge-banner
            data-state="sent"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3E6B4A] to-[#5F8F55] text-white" aria-hidden>
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <div className="text-sm font-bold text-[#2F4A36]">یادآوری ارسال شد — تا ۷ روز تکرار نمی‌شود</div>
            </div>
            <button
              type="button"
              onClick={dismissNudgeBanner}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#8A9884] transition hover:bg-[#EAF2E4] hover:text-[#2F4A36]"
              title="بستن"
              aria-label="بستن بنر یادآوری"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div
            className="pz-banner-in mb-4 rounded-2xl border border-[#EAD9A8] bg-gradient-to-l from-[#FFFDF5] via-[#FBF3DC] to-[#F7EDD3] p-4 shadow-[0_6px_24px_-12px_rgba(184,134,11,0.45)]"
            data-nudge-banner
            data-state="stale"
            data-stale-count={staleSuppliers.length}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#EAD9A8] bg-[#FBF6E8] text-[#B8860B]" aria-hidden>
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[#6B4E08]">فهرست قیمت قدیمی | Stale price lists</div>
                  <div className="mt-0.5 text-xs font-medium text-[#8A6508]">
                    {toFaDigits(staleSuppliers.length)} تأمین‌کننده بیش از {toFaDigits(30)} روز فهرست قیمت جدید وارد نکرده‌اند
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => void sendNudge()}
                  disabled={sendingNudge}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-[#DAA520] to-[#B8860B] px-4 py-2 text-xs font-bold text-[#3A2E05] shadow-md transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  title="ارسال یادآوری به مدیر محصول برای به‌روزرسانی فهرست قیمت‌ها"
                  aria-label="ارسال یادآوری فهرست قیمت"
                  data-nudge-send
                >
                  {sendingNudge ? <Spinner className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}
                  ارسال یادآوری
                </button>
                <button
                  type="button"
                  onClick={dismissNudgeBanner}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#A8968C] transition hover:bg-[#F5EDD3] hover:text-[#6B4E08]"
                  title="بستن (تا پایان این جلسه نشان داده نمی‌شود)"
                  aria-label="بستن بنر یادآوری"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {staleSuppliers.slice(0, 6).map((s) => (
                <span
                  key={s.id}
                  className="inline-flex max-w-[210px] items-center gap-1.5 rounded-full border border-[#EAD9A8] bg-white/90 py-1 pl-1.5 pr-2.5 text-[11px] font-semibold text-[#6B4E08]"
                  title={s.days === null ? `${s.name} — هنوز فهرست قیمت وارد نشده` : `${s.name} — ${s.days} روز از آخرین فهرست قیمت`}
                >
                  <span className="truncate">{s.name}</span>
                  <span className="shrink-0 rounded-full bg-[#F7EDD3] px-1.5 py-0.5 text-[10px] font-bold text-[#8A6508]">
                    {s.days === null ? 'هرگز' : `${toFaDigits(s.days)} روز`}
                  </span>
                </span>
              ))}
              {staleSuppliers.length > 6 && (
                <span className="inline-flex items-center rounded-full border border-[#EAD9A8] bg-white/70 px-2.5 py-1 text-[11px] font-bold text-[#8A6508]">
                  +{toFaDigits(staleSuppliers.length - 6)} بیشتر
                </span>
              )}
            </div>
          </div>
        )
      )}

      {loading ? (
        <Loading label="در حال دریافت تامین‌کنندگان…" />
      ) : filteredSuppliers.length === 0 ? (
        <EmptyState icon={<Truck className="h-10 w-10" />} title="تامین‌کننده‌ای پیدا نشد" />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredSuppliers.map((s) => {
            const lastImport = s.lastPriceImport ?? null
            const importStale = !lastImport || (Date.now() - new Date(lastImport.at).getTime()) > PRICE_STALE_MS
            return (
            <Card key={s.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <button type="button" onClick={() => setOpenSupplier(s)} className="min-w-0 flex-1 text-right">
                  <div className="truncate text-base font-bold text-[#253A2A]" title={s.name}>{s.name}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <KindBadge kind={s.kind} />
                    <PayChip terms={s.paymentTerms} chequeDays={s.chequeDays} />
                  </div>
                </button>
                {manage && (
                  <button
                    type="button"
                    onClick={() => openSupplierModal(s)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#E4DCC8] bg-white text-[#4A5A44] transition hover:border-[#5F8F55] hover:text-[#3E6B4A]"
                    title="ویرایش"
                    aria-label={`ویرایش ${s.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </div>

              {s.phone && (
                <div className="mt-3 flex items-center gap-2 text-xs text-[#4A5A44]" dir="ltr">
                  <Phone className="h-3.5 w-3.5 text-[#8A9884]" /> <span className="tabular-nums">{s.phone}</span>
                </div>
              )}
              {s.note && <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[#6B7A66]">{s.note}</p>}

              {(s.companies ?? []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(s.companies ?? []).map((c) => <CompanyChip key={c.company.id} name={c.company.name} />)}
                </div>
              )}

              {/* actions row: companies drill-down + per-supplier price-list XLS export (round-trips with the import) */}
              <div className="mt-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpenSupplier(s)}
                  className="flex min-h-[44px] min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border border-[#E4DCC8] bg-[#FBF9F3] px-3.5 py-2 text-xs font-semibold text-[#4A5A44] transition hover:border-[#5F8F55] hover:bg-[#F3F7EF]"
                >
                  <span className="flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5" /> {toFaDigits(s._count?.products ?? 0)} محصول
                  </span>
                  <span className="flex items-center text-[#5F8F55]">مشاهده شرکت‌ها <ChevronLeft className="h-4 w-4" /></span>
                </button>
                {canExportPrices && (
                  <button
                    type="button"
                    onClick={() => void exportPriceList(s)}
                    disabled={exportingId === s.id}
                    className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[#EAD9A8] bg-[#FBF6E8] px-3 py-2 text-xs font-bold text-[#8A6508] transition hover:bg-[#F5EDD3] disabled:cursor-not-allowed disabled:opacity-50"
                    title={`خروجی اکسل فهرست قیمت ${s.name}`}
                    aria-label={`خروجی اکسل فهرست قیمت ${s.name}`}
                    data-price-list-export={s.id}
                  >
                    {exportingId === s.id ? <Spinner className="h-4 w-4" /> : <FileSpreadsheet className="h-4 w-4" />}
                    <span className="hidden sm:inline">فهرست قیمت (اکسل)</span>
                    <span className="sm:hidden">اکسل</span>
                  </button>
                )}
              </div>

              {/* per-supplier stock footer: N items · M low-stock (rose dot when low) + price-import recency */}
              <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-[#8A9884]" data-supplier-stock-footer>
                {(s.lowCount ?? 0) > 0 && (
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                )}
                <span>
                  {toFaDigits(s.productsCount ?? s._count?.products ?? 0)} قلم
                  {' · '}
                  <span className={(s.lowCount ?? 0) > 0 ? 'font-bold text-rose-600' : ''}>
                    {toFaDigits(s.lowCount ?? 0)} کم‌موجود
                  </span>
                </span>
                <span aria-hidden>·</span>
                <span
                  className={importStale ? 'font-semibold text-amber-700' : 'font-semibold text-[#3E6B4A]'}
                  data-supplier-price-recency={s.id}
                  data-stale={importStale ? '1' : '0'}
                  title={lastImport ? `آخرین ورود فهرست قیمت توسط ${lastImport.by}` : 'هنوز فهرست قیمتی برای این تأمین‌کننده وارد نشده'}
                >
                  آخرین فهرست: {lastImport ? <TimeAgo iso={lastImport.at} /> : 'ثبت نشده'}
                </span>
              </div>
            </Card>
            )
          })}
        </div>
      )}

      {/* ---------- supplier modal ---------- */}
      <Modal open={supOpen} onClose={() => setSupOpen(false)} wide title={editingSup ? `ویرایش: ${editingSup.name}` : 'تامین‌کننده جدید'}>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="نام" required>
              <input value={supForm.name} onChange={(e) => setSupForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="پخش زیتون کرمان" />
            </Field>
            <Field label="نوع">
              <select value={supForm.kind} onChange={(e) => setSupForm((f) => ({ ...f, kind: e.target.value }))} className={inputCls}>
                <option value="MANUFACTURER">تولیدکننده</option>
                <option value="DISTRIBUTOR">پخش</option>
                <option value="BOTH">هردو</option>
              </select>
            </Field>
            <Field label="تلفن">
              <input value={supForm.phone} onChange={(e) => setSupForm((f) => ({ ...f, phone: e.target.value }))} className={inputCls} dir="ltr" placeholder="034-…" />
            </Field>
            <Field label="شرایط پرداخت">
              <select value={supForm.paymentTerms} onChange={(e) => setSupForm((f) => ({ ...f, paymentTerms: e.target.value }))} className={inputCls}>
                <option value="CASH">نقدی</option>
                <option value="CHEQUE">چک</option>
                <option value="MIXED">مختلط</option>
              </select>
            </Field>
            <Field label="روزهای چک">
              <input type="number" min={0} value={supForm.chequeDays} onChange={(e) => setSupForm((f) => ({ ...f, chequeDays: e.target.value }))} className={inputCls} dir="ltr" />
            </Field>
            <Field label="یادداشت">
              <input value={supForm.note} onChange={(e) => setSupForm((f) => ({ ...f, note: e.target.value }))} className={inputCls} />
            </Field>
          </div>
          <Field label="شرکت‌های این تامین‌کننده">
            <div className="max-h-40 overflow-y-auto pz-scroll rounded-xl border border-[#E4DCC8] bg-white p-2">
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {companies.map((c) => (
                  <label key={c.id} className="flex min-h-[36px] cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-[#33402F] hover:bg-[#F3F7EF]">
                    <input
                      type="checkbox"
                      checked={supForm.companyIds.includes(c.id)}
                      onChange={() => toggleCompany(c.id)}
                      className="h-4 w-4 accent-[#3E6B4A]"
                    />
                    {c.name}
                  </label>
                ))}
                {companies.length === 0 && <span className="p-2 text-xs text-[#8A9884]">شرکتی ثبت نشده است.</span>}
              </div>
            </div>
          </Field>
          <div className="flex justify-end gap-2 border-t border-[#EFEAD8] pt-3">
            <GhostButton onClick={() => setSupOpen(false)} className="min-h-[44px]">انصراف</GhostButton>
            <PrimaryButton onClick={() => void saveSupplier()} disabled={savingSup} className="min-h-[44px]">
              {savingSup ? <Spinner /> : <Plus className="h-4 w-4" />} ذخیره
            </PrimaryButton>
          </div>
        </div>
      </Modal>

      {/* ---------- company modal ---------- */}
      <Modal open={comOpen} onClose={() => setComOpen(false)} title="شرکت / برند جدید">
        <div className="space-y-3">
          <Field label="نام شرکت" required>
            <input value={comName} onChange={(e) => setComName(e.target.value)} className={inputCls} placeholder="Kalleh" />
          </Field>
          <div className="flex justify-end gap-2 border-t border-[#EFEAD8] pt-3">
            <GhostButton onClick={() => setComOpen(false)} className="min-h-[44px]">انصراف</GhostButton>
            <GoldButton onClick={() => void saveCompany()} disabled={savingCom} className="min-h-[44px]">
              {savingCom ? <Spinner /> : <Plus className="h-4 w-4" />} ثبت شرکت
            </GoldButton>
          </div>
        </div>
      </Modal>
    </div>
  )
}
