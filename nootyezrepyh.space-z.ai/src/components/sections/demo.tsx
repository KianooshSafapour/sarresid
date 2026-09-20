'use client'

import * as React from 'react'
import { api, ClientUser } from '@/lib/api-client'
import { toFaDigits, formatJalali } from '@/lib/jalali'
import { GlowCard, SectionHeader, OrnamentDivider, PatternBackground, EmptyState } from '@/components/zeytoon-ui'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  FlaskConical, Users, ShoppingCart, Boxes, Store, Wallet, Sparkles, Loader2,
  LayoutDashboard, ClipboardList, Trophy, Trash2, ArrowLeft, CheckCircle2, ShieldCheck, Package,
} from 'lucide-react'

/* ==================== تایپ‌ها ==================== */

interface DemoPersona {
  id: 'gourmet' | 'neighborhood' | 'chain'
  name: string
  tagline: string
  branches: string[]
  staffCount: string
  monthlyOrders: string
  desc: string
}

interface DemoStatus {
  active: boolean
  personaId?: string
  at?: string
  counts?: Record<string, number>
}

interface DemoGetResponse extends DemoStatus {
  personas: DemoPersona[]
}

/* ==================== بخش دمو ==================== */

export function DemoSection({ user, onNavigate }: { user: ClientUser; onNavigate?: (key: string) => void }) {
  const { toast } = useToast()
  const [loading, setLoading] = React.useState(true)
  const [status, setStatus] = React.useState<DemoStatus | null>(null)
  const [personas, setPersonas] = React.useState<DemoPersona[]>([])
  const [building, setBuilding] = React.useState<string | null>(null)
  const [clearing, setClearing] = React.useState(false)

  const loadStatus = React.useCallback(async () => {
    try {
      const res = await api.get<DemoGetResponse>('/api/demo')
      setStatus(res)
      setPersonas(res.personas || [])
    } catch {
      setStatus({ active: false })
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadStatus()
  }, [loadStatus])

  /** پیمایش به بخش دیگر — از طریق onNavigate یا رویداد سراسری (برای هماهنگ‌کننده: page.tsx می‌تواند رویه را بدهد) */
  const navigateTo = React.useCallback(
    (key: string) => {
      if (onNavigate) onNavigate(key)
      else window.dispatchEvent(new CustomEvent('zeytoon:navigate', { detail: key }))
    },
    [onNavigate]
  )

  async function buildCompany(personaId: DemoPersona['id']) {
    setBuilding(personaId)
    try {
      const res = await api.post<{ ok: boolean; counts: Record<string, number>; persona: { id: string; name: string } }>('/api/demo', {
        personaId,
        replace: status?.active || false,
      })
      toast({
        title: `🎉 شرکت «${res.persona.name}» ساخته شد!`,
        description: 'همه‌چیز آماده است — یک گوشه‌ی واقعی از فروشگاه را ببینید.',
      })
      await loadStatus()
    } catch (e) {
      toast({ title: 'ساخت دمو ناموفق بود', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setBuilding(null)
    }
  }

  async function clearDemoData() {
    setClearing(true)
    try {
      await api.delete<{ ok: boolean; counts: Record<string, number> }>('/api/demo')
      toast({ title: 'پاک‌سازی انجام شد 🧹', description: 'فقط داده‌های دمو پاک شدند؛ داده‌های واقعی شما سالم‌اند.' })
      await loadStatus()
    } catch (e) {
      toast({ title: 'پاک‌سازی ناموفق بود', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setClearing(false)
    }
  }

  const activePersona = personas.find((p) => p.id === status?.personaId)
  const canManage = user.roles.includes('IT_ADMIN') || user.roles.includes('OPERATION_MANAGER')

  return (
    <div className="space-y-6">
      {/* ============ قهرمان بخش ============ */}
      <GlowCard className="relative overflow-hidden p-6 md:p-8">
        <PatternBackground pattern="paisley" className="opacity-60" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="size-12 rounded-2xl bg-olive/15 text-olive flex items-center justify-center shrink-0">
              <FlaskConical className="size-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black gold-shimmer">آزمایشگاه دمو</h1>
              <p className="text-xs text-muted-foreground mt-0.5">فقط مدیر سامانه شرکت می‌سازد و پاک می‌کند — بقیه فقط تماشا می‌کنند 🙂</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-7 max-w-2xl mt-3">
            یک شرکت واقعی را بسازید و ببینید زیتون چطور کارِ روزمره‌اش را متحول می‌کند — با داده‌های واقع‌گرایانه ایرانی، نه اعداد الکی.
          </p>
          <OrnamentDivider className="my-4" />
        </div>
      </GlowCard>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72 rounded-3xl" />
          ))}
        </div>
      ) : (
        <>
          {/* ============ بنر دموی فعال ============ */}
          {status?.active && (
            <GlowCard className="relative overflow-hidden p-5 md:p-6 border-2 border-gold/60">
              <PatternBackground pattern="stars" className="opacity-40" />
              <div className="relative">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="size-11 rounded-2xl bg-gold/15 text-gold flex items-center justify-center shrink-0 animate-pulse-gold">
                      <Sparkles className="size-5" />
                    </div>
                    <div>
                      <div className="font-black text-gold">دموی فعال: {activePersona?.name || toFaDigits(status.personaId || '')}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        ساخته‌شده در {status.at ? formatJalali(status.at) : '—'} — همه بخش‌ها الان داده دارند؛ یک گوشه بگردید.
                      </div>
                    </div>
                  </div>
                  {canManage && (
                    <ClearDemoButton clearing={clearing} onConfirm={clearDemoData} compact />
                  )}
                </div>

                {/* خلاصه شمارش‌ها */}
                {status.counts && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    <CountChip icon={<Boxes className="size-3.5" />} label="محصولات" value={status.counts.products} />
                    <CountChip icon={<Store className="size-3.5" />} label="تأمین‌کنندگان" value={status.counts.suppliers} />
                    <CountChip icon={<ClipboardList className="size-3.5" />} label="سفارش‌ها" value={status.counts.orders} />
                    <CountChip icon={<Wallet className="size-3.5" />} label="چک‌ها" value={status.counts.cheques} />
                    <CountChip icon={<ShoppingCart className="size-3.5" />} label="فروش" value={status.counts.saleOrders} />
                    <CountChip icon={<Users className="size-3.5" />} label="مشتریان" value={status.counts.customers} />
                  </div>
                )}

                {/* تور دمو */}
                <div className="mt-5">
                  <div className="text-xs font-bold text-muted-foreground mb-2">تور دمو — از این‌جا شروع کنید:</div>
                  <div className="flex flex-wrap gap-2">
                    <TourButton label="داشبورد را ببین" onClick={() => navigateTo('dashboard')} />
                    <TourButton label="سفارش‌ها" onClick={() => navigateTo('orders')} />
                    <TourButton label="چک‌ها" onClick={() => navigateTo('cheques')} />
                    <TourButton label="فروش" onClick={() => navigateTo('sales')} />
                    <TourButton label="تابلوی شایستگی" onClick={() => navigateTo('rewards')} />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    اگر دکمه‌ها منتقل‌تان نکرد، بخش‌ها را از منوی کنار (یا «بیشتر» در موبایل) باز کنید.
                  </p>
                </div>
              </div>
            </GlowCard>
          )}

          {/* ============ کارت‌های پرسونا ============ */}
          <div>
            <SectionHeader
              title="یک شرکت انتخاب کنید"
              subtitle="هر پرسونا، یک دنیای متفاوت است — از سوپرمارکت صمیمی محله تا زنجیره استانی پرحجم."
            />
            <div className="grid gap-4 md:grid-cols-3">
              {personas.map((p) => (
                <PersonaCard
                  key={p.id}
                  persona={p}
                  isActive={!!(status?.active && status.personaId === p.id)}
                  isBuilding={building === p.id}
                  isBusy={!!building}
                  hasActiveDemo={!!status?.active}
                  onBuild={() => buildCompany(p.id)}
                />
              ))}
            </div>
          </div>

          {/* ============ منطقه خطر ============ */}
          {status?.active && canManage && (
            <GlowCard className="p-5 md:p-6 border-2 border-red-500/40">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="size-11 rounded-2xl bg-red-500/10 text-red-600 flex items-center justify-center shrink-0">
                    <ShieldCheck className="size-5" />
                  </div>
                  <div>
                    <div className="font-extrabold text-red-600">پاک‌سازی داده‌های دمو</div>
                    <p className="text-xs text-muted-foreground mt-1 leading-6 max-w-xl">
                      داده‌های واقعی شما دست‌نخورده می‌مانند؛ فقط داده‌های دمو پاک می‌شوند — کالاها، سفارش‌ها، چک‌ها، فروش‌ها، مشتریان و فضای تیمیِ ساخته‌شده در آزمایشگاه.
                    </p>
                  </div>
                </div>
                <ClearDemoButton clearing={clearing} onConfirm={clearDemoData} />
              </div>
            </GlowCard>
          )}

          {/* ============ جدول قبل و بعد ============ */}
          <GlowCard className="p-5 md:p-6">
            <SectionHeader
              title="قبل و بعد — سیستم دستی در برابر زیتون"
              subtitle="همان کارهای روزمره، با همان تیم؛ فقط سریع‌تر، دقیق‌تر و بی‌دردسر."
            />
            <div className="space-y-3">
              {COMPARISONS.map((row, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 md:gap-4 rounded-2xl border border-gold/15 bg-card/60 p-3 md:px-5"
                >
                  <div className="text-xs md:text-sm text-muted-foreground font-medium leading-6 text-center md:text-right">
                    {row.old}
                  </div>
                  <ArrowLeft className="size-4 text-gold shrink-0 rotate-[-90deg] md:rotate-0" aria-hidden />
                  <div className="flex justify-start">
                    <span className="inline-flex items-center gap-1.5 rounded-xl bg-gold/15 border border-gold/30 px-3 py-1.5 text-xs md:text-sm font-black text-gold tabular-nums">
                      {row.new}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-4 text-[11px] text-muted-foreground">
              <Package className="size-3.5" />
              همه اعداد بالا از رفتار واقعی فروشگاه‌های مشابه برداشت شده — دمو را بسازید و خودتان بسنجید.
            </div>
          </GlowCard>

          {!status?.active && !canManage && (
            <EmptyState
              icon="🧪"
              title="هنوز دمویی ساخته نشده"
              description="مدیر سامانه از همین‌جا یک شرکت مجازی می‌سازد تا بدون ریسک، همه بخش‌های زیتون را با داده واقع‌گرایانه ببینید."
            />
          )}
        </>
      )}
    </div>
  )
}

/* ==================== زیراجزا ==================== */

function CountChip({ icon, label, value }: { icon: React.ReactNode; label: string; value?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-gold/10 px-3 py-1 text-xs font-bold">
      <span className="text-gold">{icon}</span>
      {label}: <span className="tabular-nums text-gold">{toFaDigits(value ?? 0)}</span>
    </span>
  )
}

function TourButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} className="h-9 rounded-xl border-gold/30 hover:bg-gold/10 hover:text-gold gap-1.5">
      {label}
      <ArrowLeft className="size-3.5" />
    </Button>
  )
}

function ClearDemoButton({ clearing, onConfirm, compact = false }: { clearing: boolean; onConfirm: () => void; compact?: boolean }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          className={cn('gap-2 border-red-400/50 text-red-600 hover:bg-red-500/10 hover:text-red-700', compact ? 'h-9' : 'h-11 min-w-44')}
          disabled={clearing}
        >
          {clearing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          {clearing ? 'در حال پاک‌سازی…' : 'پاک‌سازی داده‌های دمو'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-right">پاک‌سازی داده‌های دمو؟</AlertDialogTitle>
          <AlertDialogDescription className="text-right leading-7">
            همه کالاها، سفارش‌ها، چک‌ها، فروش‌ها، مشتریان و فضای تیمیِ ساخته‌شده در آزمایشگاه حذف می‌شوند.
            <br />
            <span className="font-bold text-foreground">داده‌های واقعی شما دست‌نخورده می‌مانند؛ فقط داده‌های دمو پاک می‌شوند.</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700 text-white h-11"
          >
            بله، پاک کن
          </AlertDialogAction>
          <AlertDialogCancel className="h-11">نه، بی‌خیال</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function PersonaCard({
  persona,
  isActive,
  isBuilding,
  isBusy,
  hasActiveDemo,
  onBuild,
}: {
  persona: DemoPersona
  isActive: boolean
  isBuilding: boolean
  isBusy: boolean
  hasActiveDemo: boolean
  onBuild: () => void
}) {
  return (
    <GlowCard
      interactive
      className={cn('relative overflow-hidden p-5 flex flex-col gap-3', isActive && 'border-2 border-gold/60')}
    >
      {isActive && (
        <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-gold/15 border border-gold/40 px-2.5 py-0.5 text-[10px] font-black text-gold">
          <Sparkles className="size-3" /> دموی فعال
        </span>
      )}
      <div>
        <div className="font-black text-[15px] leading-7">{persona.name}</div>
        <div className="text-xs text-muted-foreground mt-1 leading-6">{persona.tagline}</div>
      </div>

      {/* شعبه‌ها */}
      <div className="flex flex-wrap gap-1.5">
        {persona.branches.map((b) => (
          <Badge key={b} variant="outline" className="rounded-lg border-gold/20 bg-accent/50 text-[10px] font-semibold text-foreground/80">
            {b}
          </Badge>
        ))}
      </div>

      {/* آمار */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-gold/15 bg-accent/40 p-2.5">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-bold">
            <Users className="size-3.5 text-olive" /> پرسنل
          </div>
          <div className="text-sm font-black mt-1">{persona.staffCount}</div>
        </div>
        <div className="rounded-xl border border-gold/15 bg-accent/40 p-2.5">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-bold">
            <ShoppingCart className="size-3.5 text-olive" /> حجم کار
          </div>
          <div className="text-sm font-black mt-1 leading-5">{persona.monthlyOrders}</div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-6 flex-1">{persona.desc}</p>

      {isBuilding ? (
        <div className="h-11 rounded-xl bg-olive/10 border border-olive/30 text-olive text-xs font-bold flex items-center justify-center gap-2 px-3 text-center leading-5">
          <Loader2 className="size-4 animate-spin shrink-0" />
          در حال ساختن شرکت و داده‌ها… این ۱۰ تا ۲۰ ثانیه طول می‌کشد
        </div>
      ) : (
        <Button
          className="h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-black gap-2"
          disabled={isBusy}
          onClick={onBuild}
        >
          <Sparkles className="size-4" />
          {isActive ? 'از نو بساز' : hasActiveDemo ? 'جایگزین دموی فعلی' : 'این شرکت را بساز'}
        </Button>
      )}
    </GlowCard>
  )
}

/* ==================== داده ثابت مقایسه ==================== */

const COMPARISONS = [
  { old: 'ثبت سفارش با تلفن و برگه — ۲۵ دقیقه', new: 'ثبت در زیتون — ۳ دقیقه' },
  { old: 'دریافت مرسولات چشمی و شمارش دستی', new: 'اسکن بارکد و تطبیق خودکار' },
  { old: 'شیفت‌بندی کاغذی و تماس‌های مکرر', new: 'شیفت هوشمند با هشدار و درخواست جابه‌جایی' },
  { old: 'ثبت هلو با کپی دستی فاکتورها', new: 'یک کلیک — خروجی XLSX آماده هلو' },
] as { old: string; new: string }[]
