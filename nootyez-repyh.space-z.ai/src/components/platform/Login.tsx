'use client'
import * as React from 'react'
import { GitBranch } from 'lucide-react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/store'
import { ROLE_LABELS, type PUser } from '@/lib/types'
import { Avatar, Spinner } from './kit'
import { toFaDigits } from '@/lib/jalali'
import { APP_RELEASE_FA, APP_TAG } from '@/lib/version'

function PaisleyCorner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} fill="none" aria-hidden>
      <g stroke="currentColor" strokeWidth="2">
        <path d="M20 180c0-45 35-80 80-80 40 0 70 30 70 66" opacity=".5" />
        <path d="M60 180c0-34 28-62 62-62 28 0 50 20 52 46" opacity=".4" />
        <path d="M100 180c0-24 20-44 44-44 18 0 32 12 34 28" opacity=".3" />
        <path d="M140 60c14 2 24 14 24 28 0 17-13 30-30 30-14 0-26-10-26-24 0-11 8-20 19-20 8 0 15 6 15 14 0 6-5 11-11 11" opacity=".55" />
        <circle cx="132" cy="94" r="3.5" opacity=".5" />
        <path d="M150 76c4 4 6 9 6 14" opacity=".45" />
      </g>
    </svg>
  )
}

export default function Login() {
  const setUser = useApp((s) => s.setUser)
  const [users, setUsers] = React.useState<PUser[]>([])
  const [sel, setSel] = React.useState<PUser | null>(null)
  const [pin, setPin] = React.useState('')
  const [err, setErr] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    api.get<{ users: PUser[] }>('/api/users').then((r) => setUsers(r.users.filter((u) => u.active))).catch(() => {}).finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    if (pin.length === 4 && sel) submit(pin)
     
  }, [pin])

  async function submit(entered: string) {
    if (!sel) return
    setBusy(true)
    try {
      const r = await api.post<PUser & { user?: PUser }>('/api/auth/login', { userId: sel.id, pin: entered })
      const u = (r as PUser & { user?: PUser }).user ?? (r as PUser)
      if (u && typeof u.id === 'number') setUser(u)
      else throw new Error('bad login response')
    } catch {
      setErr(true)
      setPin('')
      setTimeout(() => setErr(false), 700)
    } finally {
      setBusy(false)
    }
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok']

  return (
    <div dir="rtl" className="pz-page-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10">
      <PaisleyCorner className="pointer-events-none absolute -left-10 -top-10 h-72 w-72 rotate-12 text-[#5F8F55] opacity-40" />
      <PaisleyCorner className="pointer-events-none absolute -bottom-14 -right-14 h-80 w-80 -rotate-[100deg] text-[#B8860B] opacity-40" />
      <PatternDecor />

      {/* Brand */}
      <div className="relative z-10 mb-8 text-center">
        <div className="pz-glow-border mx-auto mb-5 w-fit rounded-3xl p-[2px]">
          <div className="flex h-20 w-20 items-center justify-center rounded-[22px] bg-gradient-to-br from-[#2F4A36] to-[#3E6B4A] shadow-xl">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#DAA520" strokeWidth="1.6" aria-hidden>
              <path d="M12 3c4 0 7 2.5 7 6.5 0 5-3.5 9.5-7 11.5-3.5-2-7-6.5-7-11.5C5 5.5 8 3 12 3Z" />
              <path d="M12 6.5c1.8.3 3 1.8 3 3.6 0 2.2-1.5 4.1-3 5-1.5-.9-3-2.8-3-5 0-1.8 1.2-3.3 3-3.6Z" stroke="#93C572" />
            </svg>
          </div>
        </div>
        <h1 className="pz-gold-text text-4xl font-black tracking-tight">هایپر زیتون</h1>
        <p className="mt-1 text-sm font-semibold tracking-wide text-[#4A5A44]">HYPER ZEYTOON — Smart Operations Platform</p>
        <p className="mt-1 text-xs text-[#8A9884]">پلتفرم هوشمند مدیریت عملیات سوپرمارکت</p>
      </div>

      {/* Staff picker or PIN pad */}
      {!sel ? (
        <div className="relative z-10 w-full max-w-3xl">
          <p className="mb-3 text-center text-sm font-bold text-[#4A5A44]">
            برای ورود، نام خود را انتخاب کنید
            <span className="hidden text-[#8A9884] sm:inline"> — Tap your name to sign in</span>
            <span className="mt-0.5 block text-xs font-semibold text-[#8A9884] sm:hidden">Tap your name to sign in</span>
          </p>
          {loading ? (
            <Spinner className="text-[#3E6B4A]" />
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => { setSel(u); setPin('') }}
                  className="pz-lift flex items-center gap-3 rounded-2xl border border-[#E4DCC8] bg-white/85 p-3 text-right shadow-sm backdrop-blur-sm transition-all hover:border-[#93C572]"
                >
                  <Avatar name={u.name} color={u.color} size={42} />
                  <div className="min-w-0 flex-1">
                    <div dir="auto" className="truncate text-sm font-bold text-[#253A2A]">{u.name}</div>
                    <div dir="rtl" className="truncate text-right text-[11px] font-medium text-[#6B7A66]">
                      {u.roles.split(',').map((r) => r.trim()).map((r) => (ROLE_LABELS[r]?.split('|')[0] ?? r).trim()).join(' · ')}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className={`relative z-10 w-full max-w-sm rounded-3xl border border-[#E4DCC8] bg-white/90 p-6 shadow-xl backdrop-blur-sm transition ${err ? 'animate-[shake_0.4s]' : ''}`}>
          <div className="mb-5 flex flex-col items-center gap-2">
            <Avatar name={sel.name} color={sel.color} size={56} />
            <div className="text-center font-bold text-[#253A2A]">{sel.name}</div>
            <div className="text-xs text-[#8A9884]">کد ورود ۴ رقمی را وارد کنید</div>
          </div>
          {/* PIN dots */}
          <div className="mb-5 flex justify-center gap-3" dir="ltr">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`h-4 w-4 rounded-full border-2 transition-all ${err ? 'border-rose-400 bg-rose-300' : pin.length > i ? 'border-[#3E6B4A] bg-[#93C572] scale-110' : 'border-[#C9C3AC]'}`} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {keys.map((k) => (
              <button
                key={k}
                disabled={busy}
                onClick={() => {
                  if (k === 'del') setPin((p) => p.slice(0, -1))
                  else if (k === 'ok') submit(pin)
                  else setPin((p) => (p.length < 4 ? p + k : p))
                }}
                className="flex h-14 items-center justify-center rounded-2xl border border-[#E4DCC8] bg-white text-xl font-bold text-[#253A2A] shadow-sm transition-all hover:border-[#93C572] hover:bg-[#F3F7EF] active:scale-95 disabled:opacity-50"
              >
                {k === 'del' ? '⌫' : k === 'ok' ? '✓' : toFaDigits(k)}
              </button>
            ))}
          </div>
          <button onClick={() => { setSel(null); setPin('') }} className="mt-4 w-full text-center text-sm font-semibold text-[#6B7A66] transition hover:text-[#3E6B4A]">
            ← تغییر کاربر | Change user
          </button>
        </div>
      )}

      <div className="relative z-10 mt-10 flex flex-col items-center gap-2">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E4DCC8] bg-white/70 px-3 py-1 text-[10px] font-semibold text-[#A8A28C] backdrop-blur-sm" title={APP_TAG}>
          <GitBranch size={11} aria-hidden />
          {APP_RELEASE_FA}
        </div>
        <div className="text-[11px] text-[#A8A28C]">
          Hyper Zeytoon Operations Platform · کمان / Kerman · {toFaDigits(1404)}
        </div>
      </div>
      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
      `}</style>
    </div>
  )
}

function PatternDecor() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.35]" style={{
      backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cg fill='none' stroke='%23B8860B' stroke-width='1' opacity='0.14'%3E%3Cpath d='M78 18c14 2 24 14 24 28 0 17-13 30-30 30-14 0-26-10-26-24 0-11 8-20 19-20 8 0 15 6 15 14 0 6-5 11-11 11'/%3E%3Ccircle cx='70' cy='52' r='3.5'/%3E%3Cpath d='M18 86c2-9 10-15 19-14 8 1 14 8 13 16-1 7-7 12-14 11-6-1-10-6-9-12 1-5 5-8 10-7'/%3E%3Ccircle cx='36' cy='88' r='2.5'/%3E%3C/g%3E%3C/svg%3E\")",
      backgroundSize: '120px 120px',
    }} />
  )
}
