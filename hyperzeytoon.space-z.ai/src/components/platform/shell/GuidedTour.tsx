'use client'

/**
 * GuidedTour — تور راهنمای تعاملی پلتفرم (بدون وابستگی خارجی).
 *
 * Spotlight overlay that walks the user through the platform chrome and
 * role-specific sections. If a step's selector is missing/hidden (e.g. mobile
 * vs desktop), the step gracefully falls back to a centered modal card.
 * Finished tours are flagged per-user in localStorage (`hz_tour_done_<uid>`).
 */

import * as React from 'react'
import type { SessionUser } from '@/lib/types'
import { useToast } from '@/hooks/use-toast'
import { toFaDigits } from '@/lib/jalali'
import { Button } from '@/components/ui/button'
import { Compass, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react'

export const TOUR_EVENT = 'hz:start-tour'

interface TourStep {
  title: string
  body: string
  selector?: string | string[]
}

// ---------- role-aware step scripts (۶ تا ۹ گام) ----------

const CHROME_SIDEBAR: TourStep = {
  title: 'فهرست اصلی',
  body: 'تمام بخش‌های پلتفرم از همین فهرست در دسترس شماست؛ هر بخش برای نقش شما مرتب و آمادهٔ کار است.',
  selector: ['nav[aria-label="فهرست اصلی"]', 'nav[aria-label="نوار ناوبری موبایل"]'],
}
const CHROME_SEARCH: TourStep = {
  title: 'جستجوی سراسری',
  body: 'با کلید میان‌بر Ctrl+K یا همین دکمه، هر کالا، همکار یا سفارش را در چند ثانیه پیدا کنید.',
  selector: ['button[aria-label="جستجوی سراسری"]', 'button[aria-label="جستجو"]'],
}
const CHROME_BELL: TourStep = {
  title: 'اعلان‌ها',
  body: 'اخبار مهم، سبد آمادهٔ صندوق و پیگیری‌های تیم از همین زنگ اعلان به شما می‌رسد.',
  selector: 'button[aria-label="اعلان‌ها"]',
}
const CHROME_ACCOUNT: TourStep = {
  title: 'حساب کاربری و امتیازها',
  body: 'امتیازهای تشویقی شما (⭐) و منوی حساب کاربری از همین‌جا در دسترس است؛ امتیاز یعنی تشکر تیم از کار خوب.',
  selector: ['header span[style*="c9a227"]', 'button[aria-label="منوی کاربر"]'],
}
const CLOSE_STEP: TourStep = {
  title: 'آمادهٔ شروع هستید 🌿',
  body: 'هر بخش راهنمای اختصاصی دارد و بخش «راهنمای پلتفرم» همیشه در فهرست، همراه شماست. اگر جایی سؤالی داشتید، همان‌جا پاسخ پیدا می‌کنید. به پلتفرم هایپر زیتون خوش آمدید!',
}
const WELCOME_STEP: TourStep = {
  title: 'به تور راهنمای هایپر زیتون خوش آمدید',
  body: 'در چند گام کوتاه با صفحه‌های اصلی پلتفرم آشنا می‌شوید. این تور برای آسان‌تر کردن کار شماست و هر لحظه می‌توانید آن را رد کنید یا بعداً دوباره از بخش «راهنمای پلتفرم» ببینید.',
}

const TOURS: Record<string, TourStep[]> = {
  owner: [
    WELCOME_STEP,
    CHROME_SIDEBAR,
    CHROME_SEARCH,
    CHROME_BELL,
    CHROME_ACCOUNT,
    {
      title: 'داشبورد — تصویر امروز فروشگاه',
      body: 'نمودارهای روند فروش و شاخص‌های کلیدی در بخش «داشبورد» جمع شده‌اند تا یک نگاه، وضعیت امروز را ببینید.',
    },
    {
      title: 'چک‌ها و پرداخت‌ها',
      body: 'تقویم چک‌های پیش‌رو و وضعیت پرداخت‌ها در بخش «چک‌ها و پرداخت‌ها» است؛ موعدهای جمعه و تعطیل خودکار جابه‌جا می‌شوند.',
    },
    {
      title: 'تیم و گزارش‌ها',
      body: 'از «کاربران و نقش‌ها» دسترسی‌ها را می‌چینید و از «گزارش‌ها و تحلیل» گزارش کامل فروش و انبار را می‌گیرید.',
    },
    CLOSE_STEP,
  ],
  gm: [
    WELCOME_STEP,
    CHROME_SIDEBAR,
    CHROME_SEARCH,
    CHROME_BELL,
    {
      title: 'داشبورد — نمای کلان',
      body: 'شاخص‌های فروش، تحویل‌ها و کارهای در جریان در «داشبورد» یک‌جا دیده می‌شوند.',
    },
    {
      title: 'تیم و عملکرد',
      body: 'امتیازهای همکاران، پاداش‌ها و عملکرد تیم را در بخش «تیم و عملکرد» دنبال کنید.',
    },
    {
      title: 'گزارش‌ها و تحلیل',
      body: 'گزارش‌های فروش، حاشیهٔ سود و کمبود موجودی — همراه خروجی اکسل — در «گزارش‌ها و تحلیل» آماده است.',
    },
    CLOSE_STEP,
  ],
  om: [
    WELCOME_STEP,
    CHROME_SIDEBAR,
    CHROME_SEARCH,
    CHROME_BELL,
    {
      title: 'سفارش‌ها',
      body: 'چرخهٔ سفارش از تأیید تا ثبت در حسابداری، مرحله‌به‌مرحله در بخش «سفارش‌ها» کنترل می‌شود.',
    },
    {
      title: 'تحویل‌ها',
      body: 'روز تحویل، شمارش اقلام و تأیید انبار در بخش «تحویل‌ها» ثبت می‌شود تا هیچ مغایرتی جا نماند.',
    },
    {
      title: 'داشبورد — پایش روزانه',
      body: 'نمودارهای فروش و وضعیت سفارش‌ها را هر صبح از «داشبورد» مرور کنید.',
    },
    CLOSE_STEP,
  ],
  pm: [
    WELCOME_STEP,
    CHROME_SIDEBAR,
    CHROME_SEARCH,
    CHROME_BELL,
    {
      title: 'محصولات',
      body: 'فهرست کالاها، بارکدها، قیمت‌ها و موجودی هر کالا در بخش «محصولات» نگه‌داری می‌شود.',
    },
    {
      title: 'تأمین‌کنندگان',
      body: 'شرکت‌ها و تأمین‌کنندگان، شرایط پرداخت و سوابق آن‌ها در بخش «تأمین‌کنندگان» است.',
    },
    {
      title: 'سفارش‌ها',
      body: 'ثبت سفارش جدید با انتخاب تأمین‌کننده و اقلام از بخش «سفارش‌ها» انجام می‌شود.',
    },
    CLOSE_STEP,
  ],
  accountant: [
    WELCOME_STEP,
    CHROME_SIDEBAR,
    CHROME_SEARCH,
    CHROME_BELL,
    {
      title: 'حسابداری و هولو',
      body: 'ثبت نهایی سفارش‌ها در هولو و رسیدن صورتحساب‌ها از بخش «حسابداری و هولو» پیگیری می‌شود.',
    },
    {
      title: 'چک‌ها و پرداخت‌ها',
      body: 'چک‌های در جریان، موعدها و وضعیت وصول از بخش «چک‌ها و پرداخت‌ها» قابل ردیابی است.',
    },
    {
      title: 'گزارش‌ها و تحلیل',
      body: 'خلاصهٔ مالی و روند فروش برای گزارش ماهانه در «گزارش‌ها و تحلیل» آماده است.',
    },
    CLOSE_STEP,
  ],
  inventory: [
    WELCOME_STEP,
    CHROME_SIDEBAR,
    CHROME_SEARCH,
    CHROME_BELL,
    {
      title: 'انبار و موجودی',
      body: 'موجودی کالاها، حد هشدار و کمبودها را در بخش «انبار و موجودی» ببینید و به‌روز نگه دارید.',
    },
    {
      title: 'تحویل‌ها',
      body: 'اقلام رسیده را می‌شمارید و ثبت می‌کنید؛ تأیید شما پایانی‌بخش چرخهٔ تحویل است (+۲ امتیاز).',
    },
    {
      title: 'جرد انبار',
      body: 'جرد دوره‌ای با شمارش کالا به کالا در بخش «جرد انبار» انجام می‌شود و مغایرت‌ها خودکار محاسبه می‌گردد.',
    },
    CLOSE_STEP,
  ],
  cashier: [
    WELCOME_STEP,
    CHROME_SIDEBAR,
    CHROME_SEARCH,
    CHROME_BELL,
    {
      title: 'سبدهای آمادهٔ صندوق',
      body: 'سبدهایی که فروشندگان آماده کرده‌اند در بخش «مشتریان و فروش» صف می‌شوند؛ فقط جمع می‌زنید و پرداخت را می‌گیرید.',
    },
    {
      title: 'پس از پرداخت',
      body: 'روی سبد «تکمیل شد» بزنید تا همکار و مشتری بی‌درنگ باخبر شوند — دیگر فراموشی نداریم.',
    },
    {
      title: 'کارهای من',
      body: 'چک‌لیست روزانه و کارهای محول‌شده در بخش «کارهای من» است؛ هر کار کامل‌شده امتیاز دارد.',
    },
    CLOSE_STEP,
  ],
  sales: [
    WELCOME_STEP,
    CHROME_SIDEBAR,
    CHROME_SEARCH,
    CHROME_BELL,
    {
      title: 'عملیات فروشگاه',
      body: 'ثبت سبد مشتری و ارسال یک‌لمسی به صندوق از بخش «عملیات فروشگاه» انجام می‌شود؛ مشتری فقط پرداخت می‌کند.',
    },
    {
      title: 'مشتریان و فروش',
      body: 'دفتر مشتریان با سلیقه‌ها و سوابق بازدید در بخش «مشتریان و فروش» است؛ مشتری‌شناسی یعنی فروش بهتر.',
    },
    {
      title: 'کالاهای درخواستی',
      body: 'هر کالایی که مشتری خواست و نبود را در «عملیات فروشگاه» ثبت کنید؛ درخواست‌ها به مدیریت می‌رسد و امتیاز می‌گیرید.',
    },
    CLOSE_STEP,
  ],
  merchandiser: [
    WELCOME_STEP,
    CHROME_SIDEBAR,
    CHROME_SEARCH,
    CHROME_BELL,
    {
      title: 'چیدمان قفسه (پلانوگرام)',
      body: 'نقشهٔ قفسه‌ها با رنگ وضعیت پُری در بخش «چیدمان قفسه» است؛ با یک لمس «درخواست پر کردن» ثبت می‌شود.',
    },
    {
      title: 'جرد انبار',
      body: 'شمارش دقیق کالاها در بخش «جرد انبار» انجام می‌شود؛ هر ثبت دقیق، خرید هوشمندتر را ممکن می‌کند.',
    },
    {
      title: 'درخواست از انبار',
      body: 'کمبود قفسه را از بخش «عملیات فروشگاه» به انبار اعلام کنید؛ تأیید تحویل برای دو طرف امتیاز دارد.',
    },
    CLOSE_STEP,
  ],
  it_admin: [
    WELCOME_STEP,
    CHROME_SIDEBAR,
    CHROME_SEARCH,
    CHROME_BELL,
    {
      title: 'کاربران و نقش‌ها',
      body: 'حساب‌ها، رمزها، نقش‌ها و روزهای تعطیل از بخش «کاربران و نقش‌ها» مدیریت می‌شود.',
    },
    {
      title: 'گزارش فعالیت',
      body: 'ردپای فعالیت‌های سامانه برای عیب‌یابی در بخش «گزارش فعالیت» دیده می‌شود — این بخش ویژهٔ مدیر سامانه است.',
    },
    {
      title: 'تنظیمات',
      body: 'شخصی‌سازی پلتفرم و پارامترهای فروشگاه از بخش «تنظیمات» انجام می‌شود.',
    },
    CLOSE_STEP,
  ],
  default: [
    WELCOME_STEP,
    CHROME_SIDEBAR,
    CHROME_SEARCH,
    CHROME_BELL,
    {
      title: 'کارهای من',
      body: 'کارهای محول‌شده و چک‌لیست روزانه در بخش «کارهای من» است؛ شروع، پیگیری و «انجام شد» با جشن ⭐.',
    },
    CLOSE_STEP,
  ],
}

const ROLE_PRIORITY = ['owner', 'gm', 'om', 'pm', 'accountant', 'inventory', 'cashier', 'sales', 'merchandiser', 'it_admin']

function pickTour(user: Pick<SessionUser, 'roleKeys' | 'isManager'>): TourStep[] {
  const keys = user?.roleKeys ?? []
  const hit = ROLE_PRIORITY.find((k) => keys.includes(k))
  return TOURS[hit ?? 'default'] ?? TOURS.default
}

// ---------- component ----------

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

export function GuidedTour({
  open,
  user,
  onClose,
}: {
  open: boolean
  user: Pick<SessionUser, 'id' | 'roleKeys' | 'isManager'> | null
  onClose: () => void
}) {
  const { toast } = useToast()
  const steps = React.useMemo(() => (user ? pickTour(user) : TOURS.default), [user])
  const [stepIndex, setStepIndex] = React.useState(0)
  const [rect, setRect] = React.useState<Rect | null>(null)
  const [modal, setModal] = React.useState(true)
  const [isMobile, setIsMobile] = React.useState(false)

  // reset when (re)opened
  React.useEffect(() => {
    if (open) setStepIndex(0)
  }, [open])

  // mobile detection
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const measure = React.useCallback(() => {
    const step = steps[stepIndex]
    const sels = step?.selector ? (Array.isArray(step.selector) ? step.selector : [step.selector]) : []
    let found: Rect | null = null
    for (const sel of sels) {
      try {
        const el = document.querySelector(sel)
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (r.width > 2 && r.height > 2) {
          found = { top: r.top, left: r.left, width: r.width, height: r.height }
          break
        }
      } catch {
        /* invalid selector — try next */
      }
    }
    setRect(found)
    setModal(!found)
  }, [steps, stepIndex])

  // measure on step change (after scroll-into-view) + keep in sync with layout
  React.useEffect(() => {
    if (!open) return
    const step = steps[stepIndex]
    if (step?.selector) {
      const sels = Array.isArray(step.selector) ? step.selector : [step.selector]
      for (const sel of sels) {
        try {
          const el = document.querySelector(sel)
          if (!el) continue
          const r = el.getBoundingClientRect()
          if (r.width > 2 && r.height > 2) {
            if (r.top < 72 || r.bottom > window.innerHeight - 8) el.scrollIntoView({ block: 'center' })
            break
          }
        } catch {
          /* noop */
        }
      }
    }
    measure()
    const t1 = setTimeout(measure, 150)
    const t2 = setTimeout(measure, 450)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, stepIndex, steps, measure])

  const finish = React.useCallback(() => {
    try {
      if (user?.id) localStorage.setItem(`hz_tour_done_${user.id}`, '1')
    } catch {
      /* storage unavailable */
    }
    toast({
      title: 'به پلتفرم هایپر زیتون خوش آمدید 🎉',
      description: 'تور راهنما پایان یافت؛ هر بخش راهنمای اختصاصی دارد و «راهنمای پلتفرم» همیشه همراه شماست.',
    })
    onClose()
  }, [user, toast, onClose])

  // ESC dismisses
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, finish])

  if (!open) return null

  const step = steps[stepIndex] ?? WELCOME_STEP
  const last = stepIndex === steps.length - 1
  const pad = 10

  const ringStyle: React.CSSProperties = rect
    ? {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
        boxShadow: '0 0 0 9999px rgba(0,0,0,.55)',
      }
    : {}

  // tooltip positioning (desktop): below or above the target, clamped to viewport
  const TT_W = Math.min(340, window.innerWidth - 24)
  let tipStyle: React.CSSProperties
  if (isMobile) {
    tipStyle = { position: 'fixed', right: 8, left: 8, bottom: 'max(1rem, env(safe-area-inset-bottom))' }
  } else if (modal || !rect) {
    tipStyle = { position: 'fixed', width: TT_W, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  } else {
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - TT_W / 2), window.innerWidth - TT_W - 12)
    const placeAbove = rect.top > window.innerHeight / 2
    tipStyle = placeAbove
      ? { position: 'fixed', width: TT_W, left, bottom: window.innerHeight - rect.top + pad + 6 }
      : { position: 'fixed', width: TT_W, left, top: rect.top + rect.height + pad + 6 }
  }

  return (
    <div className="fixed inset-0 z-[75]" dir="rtl" role="dialog" aria-modal="false" aria-label="تور راهنمای پلتفرم">
      {/* spotlight / dim overlay — pointer-events none so the app stays reachable */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        {rect ? (
          <div
            className="absolute rounded-2xl ring-2 ring-[#c9a227] transition-all duration-300"
            style={ringStyle}
          />
        ) : (
          <div className="absolute inset-0 bg-black/55 transition-opacity duration-300" />
        )}
      </div>

      {/* tooltip card */}
      <div
        className="pointer-events-auto rounded-2xl border border-[#c9a227]/60 bg-card p-4 shadow-2xl shadow-black/30 animate-in fade-in slide-in-from-bottom-2 duration-300"
        style={tipStyle}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="h-8 w-8 rounded-lg bg-[#c9a227]/15 text-[#8a6d13] dark:text-[#e0bc4a] flex items-center justify-center shrink-0">
            {last ? <Sparkles className="h-4 w-4" /> : <Compass className="h-4 w-4" />}
          </span>
          <p className="font-bold text-sm leading-6 flex-1">{step.title}</p>
          <span className="text-[10px] font-bold text-muted-foreground num shrink-0">
            گام {toFaDigits(stepIndex + 1)} از {toFaDigits(steps.length)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-6 min-h-12">{step.body}</p>

        {/* progress dots */}
        <div className="flex items-center justify-center gap-1.5 py-2" aria-hidden>
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === stepIndex ? 'w-4 bg-[#c9a227]' : i < stepIndex ? 'w-1.5 bg-[#c9a227]/60' : 'w-1.5 bg-border'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            size="sm"
            className="h-9 gap-1 bg-gradient-to-l from-[#c9a227] to-[#b07d2b] text-white hover:from-[#b8941f] hover:to-[#9a6b21]"
            onClick={() => (last ? finish() : setStepIndex((i) => i + 1))}
          >
            {last ? 'تمام شد 🎉' : 'بعدی'} {!last && <ChevronLeft className="h-4 w-4" />}
          </Button>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-9" disabled={stepIndex === 0} onClick={() => setStepIndex((i) => i - 1)}>
              <ChevronRight className="h-4 w-4" /> قبلی
            </Button>
            <Button size="sm" variant="ghost" className="h-9 text-muted-foreground" onClick={finish}>
              رد کردن
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
