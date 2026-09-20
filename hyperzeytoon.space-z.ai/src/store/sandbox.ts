'use client'

/**
 * حالت تمرین (Sandbox) — a safe practice mode.
 *
 * When enabled, every non-GET request made through the central `api()` helper
 * is intercepted CLIENT-SIDE: nothing reaches the server and no real data is
 * touched. Each intercepted call is recorded in a local journal (کارنامه) so
 * the user can review what WOULD have happened. Journal is capped at 300
 * entries and persisted to localStorage.
 *
 * NOTE: this module must stay free of imports from `@/lib/api` to avoid a
 * circular dependency (api.ts imports this store, not the other way around).
 */

import { create } from 'zustand'

export interface JournalEntry {
  ts: number
  method: string
  url: string
  body?: unknown
}

const ENABLED_KEY = 'hz_sandbox'
const JOURNAL_KEY = 'hz_sandbox_journal'
export const JOURNAL_CAP = 300

function loadEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

function loadJournal(): JournalEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(JOURNAL_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as JournalEntry[]).slice(0, JOURNAL_CAP) : []
  } catch {
    return []
  }
}

function saveJournal(entries: JournalEntry[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(JOURNAL_KEY, JSON.stringify(entries.slice(0, JOURNAL_CAP)))
  } catch {
    /* storage unavailable — journal stays in memory only */
  }
}

interface SandboxState {
  enabled: boolean
  journal: JournalEntry[]
  enable: () => void
  disable: () => void
  clearJournal: () => void
}

export const useSandboxStore = create<SandboxState>((set) => ({
  // Hydrated synchronously at module evaluation so the very first api() call
  // after a reload already respects the stored flag (no write can leak).
  enabled: loadEnabled(),
  journal: loadJournal(),
  enable: () => {
    try {
      window.localStorage.setItem(ENABLED_KEY, '1')
    } catch {
      /* noop */
    }
    set({ enabled: true })
  },
  disable: () => {
    try {
      window.localStorage.removeItem(ENABLED_KEY)
    } catch {
      /* noop */
    }
    set({ enabled: false })
  },
  clearJournal: () => {
    try {
      window.localStorage.removeItem(JOURNAL_KEY)
    } catch {
      /* noop */
    }
    set({ journal: [] })
  },
}))

/** Module-level getter for non-React callers (the central api helper). */
export function isSandboxEnabled(): boolean {
  return useSandboxStore.getState().enabled
}

/** Append an intercepted write to the journal (newest first, capped). */
export function recordJournal(entry: JournalEntry): void {
  let safeBody: unknown = entry.body ?? null
  try {
    safeBody = JSON.parse(JSON.stringify(entry.body ?? null))
  } catch {
    safeBody = null
  }
  const journal = [{ ...entry, body: safeBody }, ...useSandboxStore.getState().journal].slice(0, JOURNAL_CAP)
  useSandboxStore.setState({ journal })
  saveJournal(journal)
}
