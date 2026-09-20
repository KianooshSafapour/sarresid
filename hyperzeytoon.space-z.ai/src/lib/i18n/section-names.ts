// ============================================================
// Localized section names — maps the EXISTING Persian section /
// nav-group labels (exactly as they appear in registry.tsx
// SECTION_NAMES and store/app.ts NAV_GROUPS) to translations.
//
// Built by REVERSING the fa dictionary (section.* / nav.group.*
// keys) so the lookup keys are guaranteed byte-identical to the
// labels already rendered by the sidebar/topbar/registry — no
// duplicated Persian literals to drift out of sync.
//
// Graceful contract: unknown label or locale 'fa' → returns the
// Persian label unchanged (orchestrator can wire it blindly).
// ============================================================

import { DICT, type Locale } from './dict'

type Triple = { en: string; ar: string; tr: string }

const REVERSE: Map<string, Triple> = (() => {
  const map = new Map<string, Triple>()
  for (const [key, faValue] of Object.entries(DICT.fa)) {
    if (!key.startsWith('section.') && !key.startsWith('nav.group.')) continue
    map.set(faValue, {
      en: DICT.en[key] ?? faValue,
      ar: DICT.ar[key] ?? faValue,
      tr: DICT.tr[key] ?? faValue,
    })
  }
  return map
})()

/**
 * Translate a Persian section/nav label into the target locale.
 * Returns the input unchanged for 'fa' or unknown labels.
 */
export function localizedSectionLabel(locale: Locale, persianLabel: string): string {
  if (locale === 'fa') return persianLabel
  return REVERSE.get(persianLabel)?.[locale] ?? persianLabel
}

/** True when the Persian label has a translation for this locale. */
export function hasLocalizedSectionLabel(locale: Locale, persianLabel: string): boolean {
  if (locale === 'fa') return true
  return REVERSE.has(persianLabel)
}
