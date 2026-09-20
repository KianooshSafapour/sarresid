'use client'

// ============================================================================
// Appearance Studio «شخصی‌سازی محیط کار» — deep look-and-feel personalization.
// Every change is LIVE (applied to <html> instantly via store.updatePrefs),
// persisted to localStorage + the user's profile (debounced PATCH).
// ============================================================================

import * as React from 'react'
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useApp, NAV_GROUPS } from '@/store/app'
import { ACCENTS, THEMES, PATTERNS, FONT_SCALE_MIN, FONT_SCALE_MAX, type AccentChoice, type ThemeChoice, type PatternChoice } from '@/lib/prefs'
import { toFaDigits } from '@/lib/jalali'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { OrnateDivider } from '@/components/platform/ui/shared'
import { OrnateAvatar } from '@/components/platform/ui/OrnateAvatar'
import { AVATAR_PATTERNS, AVATAR_PALETTES, isValidPattern, isValidPalette } from '@/lib/avatar'
import {
  Sun, Moon, MonitorSmartphone, Eye, EyeOff, GripVertical, RotateCcw, Check,
  Rows3, Palette, LayoutPanelLeft, Type, Sparkles, UserRound, Wand2,
} from 'lucide-react'

/* ---------- tiny building blocks ------------------------------------------ */

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <span className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">{icon}</span>
      <h3 className="text-sm font-bold">{title}</h3>
    </div>
  )
}

/** Mini live-preview card for the three theme choices. */
function ThemePreview({ kind, active, onClick }: { kind: ThemeChoice; active: boolean; onClick: () => void }) {
  const meta = THEMES.find((t) => t.key === kind)!
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'relative flex-1 min-h-11 rounded-xl border p-2 text-right transition-all touch-target',
        active ? 'ring-2 ring-ring border-transparent' : 'border-border hover:border-ring/60'
      )}
      title={meta.hint}
    >
      {/* mini window mock */}
      <div className="h-14 rounded-lg overflow-hidden border border-black/10 relative mb-1.5" aria-hidden>
        {kind === 'light' && (
          <div className="absolute inset-0 bg-[#faf7f0]">
            <div className="absolute top-1.5 right-1.5 left-6 h-1.5 rounded bg-[#3e7c59]/70" />
            <div className="absolute top-4 right-1.5 w-8 h-6 rounded bg-[#fffdf8] border border-[#e4dcc9]" />
            <div className="absolute bottom-0 right-0 left-0 h-4 bg-[#232d26]" />
            <div className="absolute top-1.5 left-1.5 h-1.5 w-3 rounded-full bg-[#c9a227]" />
          </div>
        )}
        {kind === 'dark' && (
          <div className="absolute inset-0 bg-[#16130f]">
            <div className="absolute top-1.5 right-1.5 left-6 h-1.5 rounded bg-[#7fb894]/80" />
            <div className="absolute top-4 right-1.5 w-8 h-6 rounded bg-[#1e1a14] border border-[#33291c]" />
            <div className="absolute bottom-0 right-0 left-0 h-4 bg-[#120f0b]" />
            <div className="absolute top-1.5 left-1.5 h-1.5 w-3 rounded-full bg-[#e0bc4a]" />
          </div>
        )}
        {kind === 'system' && (
          <div className="absolute inset-0">
            <div className="absolute inset-y-0 right-0 w-1/2 bg-[#faf7f0]">
              <div className="absolute top-1.5 right-1 left-1 h-1.5 rounded bg-[#3e7c59]/70" />
            </div>
            <div className="absolute inset-y-0 left-0 w-1/2 bg-[#16130f]">
              <div className="absolute top-1.5 left-1 right-1 h-1.5 rounded bg-[#7fb894]/80" />
            </div>
          </div>
        )}
      </div>
      <span className="flex items-center gap-1.5 text-xs font-semibold">
        {kind === 'light' && <Sun className="h-3.5 w-3.5 text-gold" />}
        {kind === 'dark' && <Moon className="h-3.5 w-3.5 text-gold" />}
        {kind === 'system' && <MonitorSmartphone className="h-3.5 w-3.5 text-muted-foreground" />}
        {meta.label}
      </span>
      {active && (
        <span className="absolute top-1.5 left-1.5 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
          <Check className="h-3 w-3" />
        </span>
      )}
    </button>
  )
}

function ChoiceChip({
  active, onClick, children, title,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        'min-h-11 min-w-11 px-4 rounded-xl text-sm font-medium border transition-all touch-target',
        active
          ? 'bg-primary text-primary-foreground border-transparent shadow-sm'
          : 'bg-card text-foreground/85 hover:bg-accent border-border'
      )}
    >
      {children}
    </button>
  )
}

/* ---------- sortable sidebar group row ------------------------------------ */

function SortableGroupRow({
  id, title, visible, onToggle, disabled,
}: {
  id: string
  title: string
  visible: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-dragging={isDragging}
      className={cn(
        'studio-sortable flex items-center gap-2 rounded-xl border bg-card px-2 py-1.5',
        isDragging ? 'border-ring/60 shadow-lg' : 'border-border',
        !visible && 'opacity-55'
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={disabled}
        aria-label={`جابه‌جایی «${title}»`}
        className="h-11 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/60 cursor-grab active:cursor-grabbing touch-target"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1 text-sm font-semibold truncate">{title}</span>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={visible}
        aria-label={visible ? `پنهان کردن «${title}»` : `نمایش «${title}»`}
        title={visible ? 'پنهان کردن از نوار کناری' : 'نمایش در نوار کناری'}
        className="h-11 w-11 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors touch-target"
      >
        {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-destructive" />}
      </button>
    </div>
  )
}

/* ---------- the studio ----------------------------------------------------- */

export function AppearanceStudio({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const prefs = useApp((s) => s.prefs)
  const updatePrefs = useApp((s) => s.updatePrefs)
  const resetPrefs = useApp((s) => s.resetPrefs)
  const user = useApp((s) => s.user)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Full display order: groups ordered by prefs.sidebarOrder, unknowns appended.
  const groupTitles = React.useMemo(() => {
    const order = prefs.sidebarOrder ?? {}
    const known = NAV_GROUPS.map((g) => g.title)
    const ordered = [...known].sort((a, b) => {
      const oa = order[a]
      const ob = order[b]
      if (oa != null && ob != null) return oa - ob
      if (oa != null) return -1
      if (ob != null) return 1
      return known.indexOf(a) - known.indexOf(b)
    })
    return ordered
  }, [prefs.sidebarOrder])

  const hiddenSet = React.useMemo(() => new Set(prefs.sidebarHidden ?? []), [prefs.sidebarHidden])

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = groupTitles.indexOf(String(active.id))
    const newIndex = groupTitles.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(groupTitles, oldIndex, newIndex)
    const order: Record<string, number> = {}
    next.forEach((t, i) => (order[t] = i))
    updatePrefs({ sidebarOrder: order })
  }

  const toggleGroup = (title: string) => {
    const hidden = new Set(hiddenSet)
    if (hidden.has(title)) hidden.delete(title)
    else hidden.add(title)
    updatePrefs({ sidebarHidden: [...hidden] })
  }

  const scaleLabel = toFaDigits(prefs.fontScale.toFixed(2)).replace('.', '٫')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto nice-scroll" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-gold" />
            شخصی‌سازی محیط کار
          </DialogTitle>
          <DialogDescription>
            ظاهر پلتفرم را به سلیقه خودتان تنظیم کنید — همه تغییرات فوری اعمال و برای ورودهای بعدی ذخیره می‌شوند.
          </DialogDescription>
        </DialogHeader>

        <OrnateDivider />

        {/* ---------------- تم ---------------- */}
        <section aria-label="تم نمایش">
          <SectionTitle icon={<Sun className="h-4 w-4" />} title="تم نمایش" />
          <div className="flex gap-2">
            <ThemePreview kind="light" active={prefs.theme === 'light'} onClick={() => updatePrefs({ theme: 'light' })} />
            <ThemePreview kind="dark" active={prefs.theme === 'dark'} onClick={() => updatePrefs({ theme: 'dark' })} />
            <ThemePreview kind="system" active={prefs.theme === 'system'} onClick={() => updatePrefs({ theme: 'system' })} />
          </div>
        </section>

        {/* ---------------- رنگ تأکیدی ---------------- */}
        <section aria-label="رنگ تأکیدی">
          <SectionTitle icon={<Palette className="h-4 w-4" />} title="رنگ تأکیدی" />
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((a) => {
              const active = prefs.accent === a.key
              return (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => updatePrefs({ accent: a.key as AccentChoice })}
                  aria-pressed={active}
                  title={a.hint}
                  className={cn(
                    'relative flex items-center gap-2 min-h-11 rounded-xl border px-3 pr-2.5 text-sm font-medium transition-all touch-target',
                    active ? 'ring-2 ring-ring border-transparent bg-accent' : 'border-border hover:border-ring/50 bg-card'
                  )}
                >
                  <span
                    className="h-6 w-6 rounded-full shadow-inner border border-black/10 flex items-center justify-center"
                    style={{ backgroundColor: a.swatch }}
                    aria-hidden
                  >
                    {active && <Check className="h-3.5 w-3.5 text-white drop-shadow" />}
                  </span>
                  {a.label}
                </button>
              )
            })}
          </div>
        </section>

        {/* ---------------- تراکم ---------------- */}
        <section aria-label="تراکم صفحه">
          <SectionTitle icon={<Rows3 className="h-4 w-4" />} title="تراکم صفحه" />
          <div className="flex gap-2">
            <ChoiceChip active={prefs.density === 'comfortable'} onClick={() => updatePrefs({ density: 'comfortable' })} title="فاصله‌ها استاندارد">
              راحت
            </ChoiceChip>
            <ChoiceChip active={prefs.density === 'compact'} onClick={() => updatePrefs({ density: 'compact' })} title="فاصله‌ها فشرده‌تر — داده بیشتر در یک نگاه">
              فشرده
            </ChoiceChip>
          </div>
        </section>

        {/* ---------------- الگوی پس‌زمینه ---------------- */}
        <section aria-label="الگوی پس‌زمینه">
          <SectionTitle icon={<LayoutPanelLeft className="h-4 w-4" />} title="الگوی پس‌زمینه" />
          <div className="flex flex-wrap gap-2">
            {PATTERNS.map((p) => (
              <ChoiceChip
                key={p.key}
                active={prefs.pattern === p.key}
                onClick={() => updatePrefs({ pattern: p.key as PatternChoice })}
                title={p.hint}
              >
                {p.label}
              </ChoiceChip>
            ))}
          </div>
        </section>

        {/* ---------------- آواتار من ---------------- */}
        <section aria-label="آواتار من">
          <SectionTitle icon={<UserRound className="h-4 w-4" />} title="آواتار من" />
          <p className="text-xs text-muted-foreground mb-2.5">
            نشان حرفه‌ای شما در سراسر سامانه — طرح و رنگ را به سلیقه خود انتخاب کنید. نشان اولیه نام به‌صورت خودکار و مطمئن ساخته می‌شود.
          </p>
          {user && (
            <div className="rounded-2xl border border-border bg-gradient-to-l from-accent/40 to-transparent p-3.5 mb-3 flex items-center gap-4">
              <div className="flex items-end gap-2" aria-hidden>
                <OrnateAvatar name={user.name} username={user.username} config={prefs.avatar ?? null} size={64} />
                <OrnateAvatar name={user.name} username={user.username} config={prefs.avatar ?? null} size={40} />
                <OrnateAvatar name={user.name} username={user.username} config={prefs.avatar ?? null} size={26} ring={false} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate">{user.name}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{user.title}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 gap-1.5 h-8 text-xs"
                  onClick={() => updatePrefs({ avatar: null })}
                  disabled={!prefs.avatar}
                  title="حذف انتخاب دستی و بازگشت به نشان خودکار"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  حالت خودکار
                </Button>
              </div>
            </div>
          )}

          {/* patterns */}
          <p className="text-xs font-semibold mb-1.5 text-foreground/80">طرح نگارگری</p>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 mb-3">
            {AVATAR_PATTERNS.map((pat) => {
              const paletteNow = prefs.avatar && isValidPalette(prefs.avatar.palette) ? prefs.avatar.palette : 'emerald'
              const active = prefs.avatar?.pattern === pat.key
              return (
                <button
                  key={pat.key}
                  type="button"
                  onClick={() => updatePrefs({ avatar: { pattern: pat.key, palette: paletteNow } })}
                  aria-pressed={active}
                  title={pat.hint}
                  className={cn(
                    'relative rounded-xl border p-1.5 flex items-center justify-center transition-all touch-target',
                    active ? 'ring-2 ring-ring border-transparent bg-accent' : 'border-border hover:border-ring/50 bg-card'
                  )}
                >
                  <OrnateAvatar
                    name={user?.name ?? 'ن'}
                    username={user?.username}
                    config={{ pattern: pat.key, palette: paletteNow }}
                    size={40}
                  />
                  {active && (
                    <span className="absolute -top-1 -left-1 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* palettes */}
          <p className="text-xs font-semibold mb-1.5 text-foreground/80">پالت رنگی</p>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            {AVATAR_PALETTES.map((pal) => {
              const patternNow = prefs.avatar && isValidPattern(prefs.avatar.pattern) ? prefs.avatar.pattern : 'boteh'
              const active = prefs.avatar?.palette === pal.key
              return (
                <button
                  key={pal.key}
                  type="button"
                  onClick={() => updatePrefs({ avatar: { pattern: patternNow, palette: pal.key } })}
                  aria-pressed={active}
                  title={pal.hint}
                  className={cn(
                    'relative rounded-xl border p-1.5 flex items-center justify-center transition-all touch-target',
                    active ? 'ring-2 ring-ring border-transparent bg-accent' : 'border-border hover:border-ring/50 bg-card'
                  )}
                >
                  <OrnateAvatar
                    name={user?.name ?? 'ن'}
                    username={user?.username}
                    config={{ pattern: patternNow, palette: pal.key }}
                    size={40}
                  />
                  {active && (
                    <span className="absolute -top-1 -left-1 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </section>

        {/* ---------------- اندازه فونت ---------------- */}
        <section aria-label="اندازه فون트">
          <SectionTitle icon={<Type className="h-4 w-4" />} title="اندازه فونت" />
          <div className="flex items-center gap-4 px-1">
            <span className="text-xs text-muted-foreground w-8 text-center num" title="کوچک‌ترین">۹۰٪</span>
            <Slider
              value={[prefs.fontScale]}
              min={FONT_SCALE_MIN}
              max={FONT_SCALE_MAX}
              step={0.01}
              onValueChange={(v) => updatePrefs({ fontScale: v[0] })}
              aria-label="اندازه فونت"
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground w-8 text-center num" title="بزرگ‌ترین">۱۱۵٪</span>
            <span className="min-w-14 text-center text-sm font-bold num bg-muted rounded-lg px-2 py-1.5" aria-live="polite">
              {scaleLabel}×
            </span>
          </div>
        </section>

        {/* ---------------- چیدمان نوار کناری ---------------- */}
        <section aria-label="چیدمان نوار کناری">
          <SectionTitle icon={<GripVertical className="h-4 w-4" />} title="چیدمان نوار کناری" />
          <p className="text-xs text-muted-foreground mb-2">
            با کشیدن دسته، ترتیب گروه‌ها را تغییر دهید و با آیکون چشم، گروه‌ها را پنهان یا نمایان کنید.
          </p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={groupTitles} strategy={verticalListSortingStrategy}>
              <div className="space-y-1.5">
                {groupTitles.map((title) => (
                  <SortableGroupRow
                    key={title}
                    id={title}
                    title={title}
                    visible={!hiddenSet.has(title)}
                    onToggle={() => toggleGroup(title)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </section>

        {/* ---------------- footer ---------------- */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <Button
            variant="outline"
            onClick={() => {
              resetPrefs()
            }}
            className="gap-2 min-h-11 touch-target"
            title="بازگرداندن همه تنظیمات ظاهری به حالت اولیه"
          >
            <RotateCcw className="h-4 w-4" />
            بازگشت به پیش‌فرض
          </Button>
          <p className="text-[11px] text-muted-foreground">
            تنظیمات روی حساب شما ذخیره می‌شود و با هر دستگاه همگام می‌ماند.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
