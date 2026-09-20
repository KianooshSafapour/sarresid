'use client'

/**
 * Tiny WebAudio sound effects — zero audio assets, works fully offline.
 * Used for barcode scan feedback and success celebrations.
 */

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(freq: number, startAt: number, duration: number, gainValue = 0.06, type: OscillatorType = 'sine') {
  const c = getCtx()
  if (!c) return
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0, c.currentTime + startAt)
  gain.gain.linearRampToValueAtTime(gainValue, c.currentTime + startAt + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + startAt + duration)
  osc.connect(gain).connect(c.destination)
  osc.start(c.currentTime + startAt)
  osc.stop(c.currentTime + startAt + duration + 0.05)
}

/** short confirmation beep — barcode matched / positive feedback */
export function sfxSuccess() {
  tone(880, 0, 0.09)
  tone(1318.5, 0.09, 0.14)
}

/** low double-buzz — barcode not found / warning */
export function sfxError() {
  tone(220, 0, 0.12, 0.07, 'square')
  tone(180, 0.14, 0.18, 0.07, 'square')
}

/** cheerful 3-note arpeggio — task/order completed */
export function sfxCelebrate() {
  tone(523.25, 0, 0.12)
  tone(659.25, 0.1, 0.12)
  tone(783.99, 0.2, 0.22)
}
