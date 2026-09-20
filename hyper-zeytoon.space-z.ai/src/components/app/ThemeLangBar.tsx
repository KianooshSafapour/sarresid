'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { LANGS, useLang, type Lang } from '@/lib/i18n'
import { faNum } from '@/lib/jalali'
import {
  useUiPrefs,
  CAL_FONT_LABELS,
  clampFontScale,
  FONT_SCALE_MIN,
  FONT_SCALE_MAX,
  FONT_SCALE_STEP,
  type CalFont,
  type Density,
} from '@/components/app/jalali-widgets'
import { cn } from '@/lib/utils'

/**
 * چارچوب پاپ‌اور سراسری (پورتال به <body>)
 * چرا پورتال؟ نوار بالای اپ «sticky z-20» است و سایدبار «fixed z-30» — پاپ‌اورِ داخل هدر
 * هرگز بالای سایدبار/کشو نمی‌آید و روکشِ کلیک‌خارج زیر آن‌ها گیر می‌کرد (شکایت مالک:
 * «پنجرهٔ شخصی‌سازی با کلیک بیرون بسته نمی‌شود»).
 *  - روکش z-[56] بالای همه‌محتوای ناوبری (هدر ۲۰ / سایدبار ۳۰ / کشو ۵۰) و زیر تور، اسکنر و فرمان‌یاب
 *  - بسته‌شدن: کلیک بیرون ✓ کلید Escape ✓
 *  - جای‌گذاری هوشمند: لبهٔ درگاه + دوباره‌چینی روی scroll/resize؛ هرگز از صفحه بیرون نمی‌زند
 */
export function PopoverScaffold({
  open,
  onClose,
  anchorRef,
  width,
  panelClassName,
  maxHeightVh = 78,
  children,
}: {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  /** عرض پنل به px — برای بستن داخل درگاه */
  width: number
  /** کلاس‌های تکمیلی پنل (مثل p-1.5 یا p-3) */
  panelClassName?: string
  maxHeightVh?: number
  children: ReactNode
}) {
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const place = () => {
      const el = anchorRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const left = Math.min(Math.max(8, r.left), Math.max(8, vw - width - 8))
      const estH = Math.round((vh * maxHeightVh) / 100)
      const below = r.bottom + 8
      const top = below + estH > vh - 8 ? Math.max(8, r.top - estH - 8) : below
      setPos({ top, left, maxH: Math.max(160, Math.min(estH, vh - top - 8)) })
    }
    // rAF: جای‌گذاری اولیه بعد از paint — setState همگام در اثر نیست
    const raf = requestAnimationFrame(place)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, anchorRef, width, maxHeightVh])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !pos) return null
  return createPortal(
    <>
      {/* روکش کلیک‌خارج — تمام‌صفحه، بالای ناوبری */}
      <div className="fixed inset-0 z-[56]" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="false"
        className={cn('scroll-gold fixed z-[57] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl', panelClassName)}
        style={{ top: pos.top, left: pos.left, width, maxHeight: pos.maxH }}
      >
        {children}
      </div>
    </>,
    document.body
  )
}

/**
 * میزبان شخصی‌سازی: زبان (۴ زبانه) + تم روشن/شب + پنل «شخصی‌سازی» (⚙️)
 *  - اندازهٔ قلم سامانه (root font-size ۸۵٪ تا ۱۳۰٪)
 *  - قلم تقویم (کوچک/معمولی/بزرگ/خیلی بزرگ → CSS var --cal-font روی همهٔ تقویم‌ها)
 *  - تراکم نمایش (data-density → جمع‌وجور واقعی روی کل اپ)
 *  - نمایش تقویم‌ها (عدد قمری / عدد میلادی در خانه‌های تقویم)
 * موضوع شب «شب زیتون»: سبز عمیق + طلایی — هویت برند حفظ می‌شود.
 * همگام‌سازی جهت: <html dir/lang> و جهت Toaster (sonner) با زبان فعال قفل می‌شوند.
 */
export function ThemeLangBar({ compact = false }: { compact?: boolean }) {
  const { lang, setLang: changeLang, t, dir } = useLang()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const emptySubscribe = useCallback(() => () => {}, [])
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )
  const [langOpen, setLangOpen] = useState(false)
  const [prefOpen, setPrefOpen] = useState(false)
  const langBtnRef = useRef<HTMLButtonElement>(null)
  const prefBtnRef = useRef<HTMLButtonElement>(null)
  const { prefs, update } = useUiPrefs()

  /* جهت سند + جهت توست‌ها را با زبان فعال همگام نگه می‌داریم.
   * ThemeLangBar در همهٔ صفحاتِ واردشده سوار است؛ صفحهٔ ورود را اسکریپت themeInit پوشش می‌دهد. */
  useEffect(() => {
    document.documentElement.setAttribute('dir', dir)
    document.documentElement.setAttribute('lang', lang)
    const toaster = document.querySelector('[data-sonner-toaster]')
    if (toaster) toaster.setAttribute('dir', dir)
  }, [dir, lang])

  const isDark = mounted && resolvedTheme === 'dark'
  const scale = clampFontScale(prefs.fontScale)

  const closeAll = useCallback(() => {
    setLangOpen(false)
    setPrefOpen(false)
  }, [])

  /** فقط یک پاپ‌اور باز می‌ماند — بازکردن یکی، دیگری را می‌بندد */
  const toggleLang = () => {
    setPrefOpen(false)
    setLangOpen((v) => !v)
  }
  const togglePrefs = () => {
    setLangOpen(false)
    setPrefOpen((v) => !v)
  }

  const pick = (l: Lang) => {
    changeLang(l)
    closeAll()
    toast.success(l === 'fa' ? 'زبان: فارسی 🇮🇷' : l === 'en' ? 'Language: English 🌐' : l === 'ar' ? 'اللغة: العربية 🌍' : 'Dil: Türkçe 🌐')
  }

  const toggleTheme = () => {
    const next = isDark ? 'light' : 'dark'
    setTheme(next)
    update({ theme: next })
  }

  const bumpScale = (d: 1 | -1) => {
    const next = Math.round((scale + d * FONT_SCALE_STEP) * 100) / 100
    const clamped = Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, next))
    update({ fontScale: clamped })
  }

  return (
    <div className={cn('flex items-center gap-1.5', compact && 'gap-1')}>
      {/* تم */}
      <button
        onClick={toggleTheme}
        title={isDark ? 'تم روشن (کرم زیتونی)' : 'تم شب زیتون'}
        aria-label="تغییر تم"
        className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-card text-sm transition hover:border-[#c9a227]/60"
      >
        {mounted ? (isDark ? '🌞' : '🌙') : '🌗'}
      </button>

      {/* زبان */}
      <button
        ref={langBtnRef}
        onClick={toggleLang}
        title="زبان / Language / اللغة / Dil"
        aria-label="تغییر زبان"
        aria-expanded={langOpen}
        className="flex h-8 items-center gap-1 rounded-xl border border-border bg-card px-2 text-[11px] font-black transition hover:border-[#c9a227]/60"
      >
        🌐 <span className="uppercase">{lang}</span>
      </button>
      <PopoverScaffold open={langOpen} onClose={closeAll} anchorRef={langBtnRef} width={168} panelClassName="p-1.5">
        {LANGS.map((l) => (
          <button
            key={l.code}
            onClick={() => pick(l.code)}
            className={cn(
              'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition hover:bg-secondary',
              lang === l.code && 'bg-[#c9a227]/15 text-[#8a6d10]'
            )}
          >
            <span>{l.flag}</span>
            <span>{l.label}</span>
            {lang === l.code && <span className="ms-auto text-[#0e7a4a]">✓</span>}
          </button>
        ))}
        <p className="border-t border-dashed border-border px-3 pt-1.5 pb-0.5 text-[8.5px] leading-relaxed text-muted-foreground">
          پوسته کامل ترجمه شده؛ متن‌های تخصصی هر بخش به‌تدریج چندزبانه می‌شوند.
        </p>
      </PopoverScaffold>

      {/* شخصی‌سازی */}
      <button
        ref={prefBtnRef}
        onClick={togglePrefs}
        title="شخصی‌سازی — اندازهٔ قلم، تراکم و تقویم‌ها"
        aria-label="شخصی‌سازی"
        aria-expanded={prefOpen}
        className="flex h-8 items-center gap-1 rounded-xl border border-border bg-card px-2 text-[11px] font-black transition hover:border-[#c9a227]/60"
      >
        ⚙️ <span className="hidden sm:inline">شخصی‌سازی</span>
      </button>
      <PopoverScaffold open={prefOpen} onClose={closeAll} anchorRef={prefBtnRef} width={288} panelClassName="p-3" maxHeightVh={78}>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-black text-foreground">
          ⚙️ شخصی‌سازی سامانه
        </h3>

        {/* اندازهٔ قلم سامانه */}
        <div className="mb-2.5 rounded-xl border border-border/70 bg-muted/30 p-2.5">
          <p className="mb-1.5 text-[11px] font-extrabold">اندازهٔ قلم سامانه</p>
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => bumpScale(-1)}
              disabled={scale <= FONT_SCALE_MIN}
              title="کوچک‌تر"
              aria-label="کوچک‌تر کردن قلم"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-lg font-black transition hover:border-primary/60 disabled:opacity-30"
            >
              −
            </button>
            <div className="text-center">
              <span className="block text-base font-black text-[#0e7a4a]">{faNum(Math.round(scale * 100))}٪</span>
              <span className="block text-[8.5px] text-muted-foreground">محدوده: {faNum(85)}٪ تا {faNum(Math.round(FONT_SCALE_MAX * 100))}٪</span>
            </div>
            <button
              onClick={() => bumpScale(1)}
              disabled={scale >= FONT_SCALE_MAX}
              title="بزرگ‌تر"
              aria-label="بزرگ‌تر کردن قلم"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-lg font-black transition hover:border-primary/60 disabled:opacity-30"
            >
              +
            </button>
          </div>
          {scale >= FONT_SCALE_MAX - 0.001 && (
            <p className="mt-1 text-center text-[8.5px] font-bold text-[#8a6d10]">برای سلامت چیدمان، بیشینه ۱۳۰٪ است</p>
          )}
        </div>

        {/* قلم تقویم */}
        <div className="mb-2.5 rounded-xl border border-border/70 bg-muted/30 p-2.5">
          <p className="mb-1.5 text-[11px] font-extrabold">قلم تقویم</p>
          <div className="grid grid-cols-2 gap-1.5">
            {CAL_FONT_LABELS.map((c) => (
              <button
                key={c.key}
                onClick={() => update({ calFont: c.key as CalFont })}
                className={cn(
                  'rounded-xl px-2 py-2.5 text-[11px] font-bold transition',
                  (prefs.calFont || 'base') === c.key
                    ? 'bg-primary text-white shadow-sm'
                    : 'border border-border bg-card text-foreground/70 hover:border-primary/50'
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* تراکم نمایش */}
        <div className="mb-2.5 rounded-xl border border-border/70 bg-muted/30 p-2.5">
          <p className="mb-1.5 text-[11px] font-extrabold">تراکم نمایش</p>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              { key: 'cozy', label: 'دلنشین' },
              { key: 'compact', label: 'جمع‌وجور' },
            ] as { key: Density; label: string }[]).map((d) => (
              <button
                key={d.key}
                onClick={() => update({ density: d.key })}
                className={cn(
                  'rounded-xl px-2 py-2.5 text-[11px] font-bold transition',
                  (prefs.density || 'cozy') === d.key
                    ? 'bg-primary text-white shadow-sm'
                    : 'border border-border bg-card text-foreground/70 hover:border-primary/50'
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* نمایش تقویم‌ها */}
        <div className="mb-2 rounded-xl border border-border/70 bg-muted/30 p-2.5">
          <p className="mb-1.5 text-[11px] font-extrabold">نمایش تقویم‌ها</p>
          {([
            { key: 'showHijri' as const, label: 'عدد قمری 🌙', hint: 'عدد کوچک بالا-چپ هر روز' },
            { key: 'showGregorian' as const, label: 'عدد میلادی 📅', hint: 'عدد کوچک پایین-راست هر روز' },
          ]).map((c) => (
            <label key={c.key} className="flex min-h-[44px] cursor-pointer items-center justify-between gap-2 rounded-xl px-1 py-1.5 hover:bg-secondary/60">
              <span>
                <span className="block text-[11px] font-bold">{c.label}</span>
                <span className="block text-[8.5px] text-muted-foreground">{c.hint}</span>
              </span>
              <input
                type="checkbox"
                checked={prefs[c.key] !== false}
                onChange={(e) => update({ [c.key]: e.target.checked })}
                className="h-5 w-5 shrink-0 accent-[#0e7a4a]"
              />
            </label>
          ))}
          <p className="mt-1 text-[8.5px] leading-relaxed text-muted-foreground">
            برای معاملات بین‌المللی، تاریخ میلادی همیشه در راهنمای هر روز (کادر کوچک با نگه‌داشتن ماوس) دیده می‌شود.
          </p>
        </div>

        <p className="border-t border-dashed border-border pt-1.5 text-[8.5px] leading-relaxed text-muted-foreground">
          تنظیمات روی این دستگاه ذخیره و به حساب شما گره می‌خورد؛ همه‌جا یکسان دیده می‌شود.
        </p>
      </PopoverScaffold>
    </div>
  )
}
