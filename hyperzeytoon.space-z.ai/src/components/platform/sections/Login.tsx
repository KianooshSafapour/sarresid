'use client'

// Login — staff picker + PIN pad. Fully localized via lib/i18n:
// chrome strings come from the dict (fa source of truth), staff
// names/titles stay Persian (product data), the Jalali date stays
// Jalali for every locale (operational consistency), and the keypad
// numerals localize (Persian digits for fa/ar, Latin for en/tr).
// The container carries dir={dir} so en/tr flip the logical layout.

import * as React from 'react'
import { api } from '@/lib/api'
import { setSessionToken } from '@/lib/session'
import { useApp } from '@/store/app'
import type { SessionUser } from '@/lib/types'
import { toast } from '@/hooks/use-toast'
import { formatJalaliFull, toFaDigits } from '@/lib/jalali'
import { formalName } from '@/lib/persian-words'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import { LanguageMenu } from '@/components/platform/shell/LanguageMenu'
import { UserAvatar } from '@/components/platform/ui/shared'

interface StaffMember {
  id: string
  username: string
  name: string
  title: string
  gender: string
  color: string
}

const FEATURE_KEYS = [
  'login.feature.smartOrder',
  'login.feature.controlledDelivery',
  'login.feature.chequesHolidays',
  'login.feature.planogram',
  'login.feature.sopChecklist',
  'login.feature.pointsMotivation',
] as const

/** Map known Persian server error messages to localized strings. */
function localizeLoginError(msg: string, t: (k: string, f?: string) => string, isFa: boolean): string {
  if (msg.includes('نادرست')) return t('login.errorWrongPin')
  if (msg.includes('وارد شو')) return t('login.errorUnauthorized')
  return isFa ? msg : t('login.errorGeneric')
}

function PaisleyCorner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} fill="none" aria-hidden>
      <g stroke="url(#gz)" strokeWidth="1.4" opacity="0.75">
        <path d="M100 12c26 0 46 20 46 44 0 30-36 30-36 56 0 18 16 26 28 26 20 0 32-16 32-16" />
        <path d="M100 12C74 12 54 32 54 56c0 30 36 30 36 56 0 18-16 26-28 26-20 0-32-16-32-16" />
        <circle cx="100" cy="70" r="7" />
        <circle cx="100" cy="70" r="14" opacity="0.5" />
        <path d="M22 96c16-6 26 6 26 20s-14 24-26 20" />
        <path d="M178 96c-16-6-26 6-26 20s14 24 26 20" />
        <path d="M40 22c10-8 22-6 28 2" opacity="0.6" />
        <path d="M160 22c-10-8-22-6-28 2" opacity="0.6" />
      </g>
      <defs>
        <linearGradient id="gz" x1="0" y1="0" x2="200" y2="200">
          <stop stopColor="#c9a227" />
          <stop offset="0.5" stopColor="#e6c95c" />
          <stop offset="1" stopColor="#8a6f3c" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function Login() {
  const setUser = useApp((s) => s.setUser)
  const setBooted = useApp((s) => s.setBooted)
  const setDemoName = useApp((s) => s.setDemoName) // fixes latent ReferenceError: was called but never destructured (welcome toast silently died in catch)
  const { locale, dir, t } = useI18n()
  const isFa = locale === 'fa'
  const [staff, setStaff] = React.useState<StaffMember[]>([])
  const [selected, setSelected] = React.useState<StaffMember | null>(null)
  const [pin, setPin] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const today = React.useMemo(() => formatJalaliFull(new Date()), [])
  const isRtlNumeric = locale === 'fa' || locale === 'ar'
  const faNum = (s: string) => (isRtlNumeric ? toFaDigits(s) : s)

  React.useEffect(() => {
    api<{ users: StaffMember[] }>('/api/staff')
      .then((d) => setStaff(d.users))
      .catch(() => setStaff([]))
  }, [])

  const submitPin = async (finalPin: string) => {
    if (!selected) return
    setBusy(true)
    setError('')
    try {
      const res = await api<{ user: SessionUser; token?: string; demo?: { active: boolean; name: string | null } }>('/api/auth/login', {
        body: { username: selected.username, pin: finalPin },
      })
      if (res.token) setSessionToken(res.token)
      setUser(res.user)
      setDemoName(res.demo?.active ? res.demo.name : null)
      setBooted(true)
      const greet = isFa
        ? formalName(res.user.gender, res.user.name)
        : `${t(res.user.gender === 'FEMALE' ? 'honorific.female' : 'honorific.male')} ${res.user.name}`
      toast({ title: `${greet} ${t('login.welcomeToast')}` })
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('login.errorGeneric')
      setError(localizeLoginError(msg, t, isFa))
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  const pressDigit = (d: string) => {
    if (!selected || busy) return
    const next = (pin + d).slice(0, 4)
    setPin(next)
    if (next.length === 4) setTimeout(() => submitPin(next), 150)
  }

  return (
    <div dir={dir} className="relative min-h-screen paisley-bg flex flex-col lg:flex-row">
      {/* language switch — top corner, subtle over the brand hero */}
      <div className="absolute top-3 start-3 z-20 [&_button]:text-[#e9e4d5]/75 [&_button:hover]:bg-white/10 [&_button:hover]:text-[#e9e4d5]">
        <LanguageMenu />
      </div>

      {/* Brand hero */}
      <div className="relative lg:w-[46%] bg-[#232d26] text-[#e9e4d5] flex flex-col items-center justify-center overflow-hidden p-8">
        <PaisleyCorner className="absolute -top-10 -right-10 w-72 h-72 rotate-12" />
        <PaisleyCorner className="absolute -bottom-12 -left-12 w-80 h-80 -rotate-[130deg]" />
        <div className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: "url('/brand/pattern.png')", backgroundSize: 'cover' }} />
        <div className="relative z-10 flex flex-col items-center text-center gap-5">
          <div className="h-28 w-28 rounded-3xl overflow-hidden shadow-2xl ring-2 ring-[#c9a227]/60 soft-pulse">
            <img src="/brand/logo.png" alt={t('login.logoAlt')} className="h-full w-full object-cover" />
          </div>
          <div>
            <h1 className="text-4xl font-black text-gold-gradient">{t('app.name')}</h1>
            <p className="mt-2 text-[#cfc7ae] tracking-wide">{t('app.platform')}</p>
            <p className="text-sm text-[#9aa595] mt-1">{t('app.city')} — {today}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4 text-xs text-[#b9b39c]">
            {FEATURE_KEYS.map((k) => (
              <span key={k} className="rounded-full border border-[#c9a227]/30 bg-[#c9a227]/10 px-3 py-1.5">
                {t(k)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Login card */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md fade-in-up">
          {!selected ? (
            <>
              <h2 className="text-xl font-bold mb-1">{t('login.chooseAccountTitle')}</h2>
              <p className="text-sm text-muted-foreground mb-5">{t('login.chooseAccountHint')}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[60vh] overflow-y-auto pl-1">
                {staff.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => { setSelected(u); setPin(''); setError('') }}
                    className="group flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <UserAvatar name={u.name} color={u.color} username={u.username} size={56} className="group-hover:scale-105 transition-transform" />
                    <div className="text-center">
                      <p className="text-sm font-bold leading-tight">{u.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{u.title}</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="glow-border rounded-3xl p-6 text-center">
              <button
                onClick={() => { setSelected(null); setPin(''); setError('') }}
                className="text-xs text-muted-foreground hover:text-foreground mb-4"
              >
                {t('login.changeUser')}
              </button>
              <UserAvatar name={selected.name} color={selected.color} username={selected.username} size={64} className="mx-auto" />
              <h3 className="mt-3 font-bold text-lg">
                {isFa ? formalName(selected.gender, selected.name) : selected.name}
              </h3>
              <p className="text-xs text-muted-foreground">{selected.title}</p>

              <div className="flex justify-center gap-3 my-6" aria-label={t('login.pinStatus')}>
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={cn(
                      'h-4 w-4 rounded-full border-2 transition-all',
                      pin.length > i ? 'bg-primary border-primary scale-110' : 'border-muted-foreground/40'
                    )}
                  />
                ))}
              </div>

              {error && <p className="text-destructive text-sm mb-3">{error}</p>}

              <div className="grid grid-cols-3 gap-2.5 max-w-[260px] mx-auto">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <button
                    key={n}
                    disabled={busy}
                    onClick={() => pressDigit(String(n))}
                    className="touch-target rounded-2xl border border-border bg-card text-xl font-bold hover:bg-accent active:scale-95 transition-all"
                  >
                    {faNum(String(n))}
                  </button>
                ))}
                <button
                  disabled={busy}
                  onClick={() => setPin('')}
                  className="touch-target rounded-2xl border border-border bg-card text-sm font-bold text-muted-foreground hover:bg-accent active:scale-95"
                >
                  {t('login.clear')}
                </button>
                <button
                  disabled={busy}
                  onClick={() => pressDigit('0')}
                  className="touch-target rounded-2xl border border-border bg-card text-xl font-bold hover:bg-accent active:scale-95 transition-all"
                >
                  {faNum('0')}
                </button>
                <button
                  disabled={busy || pin.length < 4}
                  onClick={() => submitPin(pin)}
                  className="touch-target rounded-2xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 active:scale-95 disabled:opacity-40"
                >
                  {busy ? '…' : t('login.enter')}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-5">
                {t('login.defaultPinHint').replace('{pin}', faNum('1234'))}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
