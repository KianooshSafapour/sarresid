'use client'

/**
 * SystemOverlays — client wrapper that mounts the platform-wide overlays:
 *   • SandboxBanner (حالت تمرین) — visible while sandbox is enabled
 *   • GuidedTour auto-trigger — opens once per session for first-time users
 *   • 'hz:start-tour' CustomEvent listener — manual tour start (Help section)
 *   • section_view analytics — useApp section subscription (outside React)
 *
 * Mount this ONCE from the platform shell (page.tsx orchestrator):
 *   import { SystemOverlays } from '@/components/platform/shell/SystemOverlays'
 *   <SystemOverlays />
 */

import * as React from 'react'
import { useApp, NAV_GROUPS } from '@/store/app'
import { trackEvent } from '@/lib/api'
import { SandboxBanner } from './SandboxBanner'
import { GuidedTour } from './GuidedTour'

function sectionLabel(key: string): string {
  for (const group of NAV_GROUPS) {
    const item = group.items.find((i) => i.key === key)
    if (item) return item.label
  }
  return key
}

export function SystemOverlays() {
  const user = useApp((s) => s.user)
  const [tourOpen, setTourOpen] = React.useState(false)
  const [tourNonce, setTourNonce] = React.useState(0)

  // ---- auto-open the guided tour once per session for first-time users ----
  React.useEffect(() => {
    if (!user) return
    const doneKey = `hz_tour_done_${user.id}`
    const sessKey = `hz_tour_session_${user.id}`
    let done = false
    let seenThisSession = false
    try {
      done = localStorage.getItem(doneKey) === '1'
      seenThisSession = sessionStorage.getItem(sessKey) === '1'
    } catch {
      /* storage unavailable — stay quiet */
    }
    if (done || seenThisSession) return
    try {
      sessionStorage.setItem(sessKey, '1')
    } catch {
      /* noop */
    }
    const t = setTimeout(() => setTourOpen(true), 1400) // let the shell settle first
    return () => clearTimeout(t)
  }, [user])

  // ---- manual start via CustomEvent('hz:start-tour') ----
  React.useEffect(() => {
    const handler = () => {
      setTourNonce((n) => n + 1) // remount → restart from step 1
      setTourOpen(true)
    }
    window.addEventListener('hz:start-tour', handler)
    return () => window.removeEventListener('hz:start-tour', handler)
  }, [])

  // ---- section_view analytics: subscribe outside React render ----
  React.useEffect(() => {
    const unsub = useApp.subscribe((state, prev) => {
      if (state.user && state.section !== prev.section) {
        trackEvent('section_view', state.section, sectionLabel(state.section))
      }
    })
    return unsub
  }, [])

  // initial section_view after login/boot
  React.useEffect(() => {
    if (!user) return
    trackEvent('section_view', useApp.getState().section, sectionLabel(useApp.getState().section))
  }, [user])

  if (!user) return null

  return (
    <>
      <SandboxBanner />
      <GuidedTour key={tourNonce} open={tourOpen} user={user} onClose={() => setTourOpen(false)} />
    </>
  )
}
