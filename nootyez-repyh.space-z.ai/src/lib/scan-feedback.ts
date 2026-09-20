'use client'

/**
 * Scan feedback — WebAudio tones + haptics, zero audio files.
 *
 *  - playScanOk()   → short two-note rising chime (880 → 1320 Hz sine)
 *  - playScanWarn() → single mid tone
 *  - playScanErr()  → low brief buzz (~180 Hz square, quiet)
 *
 * The AudioContext is created/resumed lazily on the first call — every call
 * site (scan submit, camera-detect submit, toggle click) is a user gesture,
 * which is what browsers require before audio may start. Everything is
 * try/catch-guarded so a missing/blank WebAudio can never break a scan.
 *
 * Mute flag persists in localStorage key `hz_scan_sound` ('1' = muted,
 * absent/'0' = sound on — the default). Muting silences tones AND haptics.
 */

export const SCAN_MUTE_KEY = 'hz_scan_sound'

let ctx: AudioContext | null = null

/** lazily create + resume the AudioContext (must be called from a gesture) */
function ensureCtx(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    if (!ctx) ctx = new AC()
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
    return ctx
  } catch {
    return null
  }
}

/** pre-warm the audio context inside a real user gesture (camera button etc.) */
export function primeScanAudio(): void {
  ensureCtx()
}

function mutedNow(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(SCAN_MUTE_KEY) === '1'
  } catch {
    return false
  }
}

/** current mute state (sound + haptics) */
export function isScanMuted(): boolean {
  return mutedNow()
}

/** persist mute state to localStorage (best-effort) */
export function setScanMuted(muted: boolean): void {
  try {
    localStorage.setItem(SCAN_MUTE_KEY, muted ? '1' : '0')
  } catch {
    /* private mode etc. — flag simply won't persist */
  }
}

function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern)
  } catch {
    /* unsupported / ignored */
  }
}

interface ToneOpts {
  freq: number
  /** start offset in seconds from now */
  at?: number
  /** duration in seconds */
  dur?: number
  type?: OscillatorType
  /** peak gain (kept gentle on purpose) */
  vol?: number
}

function tone({ freq, at = 0, dur = 0.12, type = 'sine', vol = 0.12 }: ToneOpts): void {
  const ac = ensureCtx()
  if (!ac || mutedNow()) return
  try {
    const t0 = ac.currentTime + at
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    // gentle attack/release envelope — no clicks
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(gain)
    gain.connect(ac.destination)
    osc.start(t0)
    osc.stop(t0 + dur + 0.03)
  } catch {
    /* audio unavailable — feedback is best-effort */
  }
}

/** success: two-note rising chime + a single 30 ms haptic tick */
export function playScanOk(): void {
  tone({ freq: 880, dur: 0.12, vol: 0.14 })
  tone({ freq: 1320, at: 0.11, dur: 0.14, vol: 0.12 })
  if (!mutedNow()) vibrate(30)
}

/** warn: single mid tone, no haptics */
export function playScanWarn(): void {
  tone({ freq: 600, dur: 0.16, vol: 0.09 })
}

/** error: low quiet buzz (~180 Hz square) + double-pulse haptics [60,40,60] */
export function playScanErr(): void {
  tone({ freq: 180, dur: 0.2, type: 'square', vol: 0.05 })
  if (!mutedNow()) vibrate([60, 40, 60])
}

/* QA/debug handles (same convention as window.__errs) */
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__hzScanFx = {
    playScanOk,
    playScanWarn,
    playScanErr,
    isScanMuted,
    setScanMuted,
    primeScanAudio,
  }
}
