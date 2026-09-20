'use client'

// ============================================================
// Hyper Zeytoon i18n runtime — dependency-free React context.
//
// - <I18nProvider> : hydrate-safe (SSR renders fa; saved locale
//   applied in useEffect). Applies document.documentElement.dir/lang
//   and dispatches window event 'hz-locale-change' so non-React
//   consumers (print windows, mini widgets) stay in sync.
// - useI18n()      : { locale, dir, t(key, fallbackFa?), setLocale }.
//   Works standalone too (before the orchestrator mounts the
//   provider) via a tiny module-level store + useSyncExternalStore.
// - makeT(locale)  : pure translator factory, chain locale → fa →
//   fallbackFa → key.
// - useDir()       : convenience hook for writing direction.
//
// setLocale persists to localStorage 'hz_locale' and fire-and-forget
// PATCHes /api/auth/prefs (route may not exist yet — errors ignored).
// ============================================================

import * as React from 'react'
import { DICT, LOCALES, localeDir, type Locale } from './dict'
import { api } from '@/lib/api'

export const LOCALE_STORAGE_KEY = 'hz_locale'
export const LOCALE_EVENT = 'hz-locale-change'

// ---------- pure translator factory ----------
/** t(key) resolution chain: dict[locale] → dict.fa → fallbackFa → key. */
export function makeT(locale: Locale) {
  return (key: string, fallbackFa?: string): string => {
    return DICT[locale]?.[key] ?? DICT.fa[key] ?? fallbackFa ?? key
  }
}

export type TFn = ReturnType<typeof makeT>

export interface I18nCtx {
  locale: Locale
  dir: 'rtl' | 'ltr'
  t: TFn
  setLocale: (l: Locale) => void
}

// ---------- side-effect helpers (shared by provider & fallback) ----------
function readSavedLocale(): Locale | null {
  try {
    const v = localStorage.getItem(LOCALE_STORAGE_KEY)
    return LOCALES.some((l) => l.code === v) ? (v as Locale) : null
  } catch {
    return null
  }
}

function persistLocale(l: Locale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, l)
  } catch {
    /* private mode */
  }
}

/** Fire-and-forget preference sync — route may 404 until wired; ignore. */
function patchPrefs(l: Locale) {
  try {
    api('/api/auth/prefs', { method: 'PATCH', body: { prefs: { locale: l } } }).catch(() => null)
  } catch {
    /* never break UI for prefs */
  }
}

/** Apply dir/lang on <html> + notify non-React consumers. */
function applyLocaleDom(l: Locale) {
  if (typeof document === 'undefined') return
  document.documentElement.dir = localeDir(l)
  document.documentElement.lang = l
  window.dispatchEvent(new CustomEvent(LOCALE_EVENT, { detail: { locale: l, dir: localeDir(l) } }))
}

// ---------- module-level fallback store (standalone mode) ----------
let fallbackLocale: Locale = 'fa'
const fallbackListeners = new Set<() => void>()

function subscribeFallback(fn: () => void) {
  fallbackListeners.add(fn)
  return () => {
    fallbackListeners.delete(fn)
  }
}

function getFallbackSnapshot(): Locale {
  return fallbackLocale
}

function setFallbackLocale(l: Locale) {
  fallbackLocale = l
  for (const fn of fallbackListeners) fn()
}

/** setLocale for components mounted OUTSIDE the provider. */
function setLocaleStandalone(l: Locale) {
  persistLocale(l)
  patchPrefs(l)
  setFallbackLocale(l)
  applyLocaleDom(l)
}

// ---------- React context ----------
const I18nContext = React.createContext<I18nCtx | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // hydrate-safe: SSR + first client render always use 'fa'
  const [locale, setLocaleState] = React.useState<Locale>('fa')

  // hydrate saved choice once, after mount
  React.useEffect(() => {
    const saved = readSavedLocale()
    if (saved) setLocaleState(saved)
  }, [])

  // apply to <html> + notify non-React consumers on every change (incl. boot)
  React.useEffect(() => {
    applyLocaleDom(locale)
  }, [locale])

  const setLocale = React.useCallback((l: Locale) => {
    persistLocale(l)
    patchPrefs(l)
    setLocaleState(l)
  }, [])

  const value = React.useMemo<I18nCtx>(
    () => ({ locale, dir: localeDir(locale), t: makeT(locale), setLocale }),
    [locale, setLocale]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/**
 * Access the i18n context. If no provider is mounted yet (e.g. the
 * login screen before orchestrator wiring), falls back to a tiny
 * external store so locale switching still works end-to-end.
 */
export function useI18n(): I18nCtx {
  const ctx = React.useContext(I18nContext)
  const snap = React.useSyncExternalStore(subscribeFallback, getFallbackSnapshot, () => 'fa' as Locale)

  // standalone mode: hydrate the saved locale once
  React.useEffect(() => {
    if (ctx) return
    const saved = readSavedLocale()
    if (saved && saved !== fallbackLocale) {
      setFallbackLocale(saved)
      applyLocaleDom(saved)
    }
  }, [ctx])

  return React.useMemo<I18nCtx>(() => {
    if (ctx) return ctx
    return { locale: snap, dir: localeDir(snap), t: makeT(snap), setLocale: setLocaleStandalone }
  }, [ctx, snap])
}

/** Convenience: current writing direction ('rtl' | 'ltr'). */
export function useDir(): 'rtl' | 'ltr' {
  return useI18n().dir
}
