/**
 * CultureArt (Task 12-a) — decorative Persian-arch & pistachio line-art SVGs
 * for the Industry Demo Lab hero. Pure presentational components: stroke-only,
 * aria-hidden, colored via `currentColor` so the caller sets text-[#…]/opacity.
 * Olive/gold strokes only — matches the platform palette (no indigo/blue).
 */

/** Persian iwan arch (nested pointed arches + finial + hanging lamp) */
export function ArchMotif({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 300" className={className} fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.6">
        <path d="M30 300 V150 C30 66 118 34 210 32 C302 34 390 66 390 150 V300" />
        <path d="M70 300 V162 C70 96 138 64 210 62 C282 64 350 96 350 162 V300" opacity=".8" />
        <path d="M110 300 V178 C110 122 162 96 210 94 C258 96 310 122 310 178 V300" opacity=".55" />
        {/* finial */}
        <circle cx="210" cy="18" r="6" />
        <path d="M210 24 v8" opacity=".8" />
        {/* hanging lamp under the apex */}
        <path d="M210 94 v20" opacity=".7" />
        <circle cx="210" cy="122" r="7" opacity=".8" />
        <path d="M210 129 l9 16 -9 16 -9 -16 Z" opacity=".7" />
        {/* base bands */}
        <path d="M30 272 H132" opacity=".5" />
        <path d="M288 272 H390" opacity=".5" />
        <path d="M30 284 H108" opacity=".3" />
        <path d="M312 284 H390" opacity=".3" />
      </g>
    </svg>
  )
}

/** Pistachio branch — leaves + hulled nuts with their characteristic seam */
export function PistachioMotif({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 160" className={className} fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.6">
        {/* main branch */}
        <path d="M8 142 C78 132 152 112 286 38" />
        <path d="M62 134 C92 104 122 90 152 86" opacity=".7" />
        {/* leaves */}
        <path d="M96 112 C108 90 130 80 150 84 C140 106 118 116 96 112 Z" opacity=".8" />
        <path d="M150 84 C158 60 180 50 200 54 C192 76 170 86 150 84 Z" opacity=".7" />
        <path d="M40 132 C44 114 58 102 76 100 C74 118 60 130 40 132 Z" opacity=".55" />
        {/* pistachio nuts (ellipse + seam) */}
        <ellipse cx="228" cy="62" rx="14" ry="21" transform="rotate(-26 228 62)" opacity=".85" />
        <path d="M221 77 C225 68 231 56 235 46" opacity=".7" />
        <ellipse cx="262" cy="44" rx="12" ry="18" transform="rotate(-26 262 44)" opacity=".65" />
        <path d="M256 57 C259 50 265 40 268 32" opacity=".55" />
        <ellipse cx="196" cy="92" rx="10" ry="15" transform="rotate(-26 196 92)" opacity=".5" />
        <path d="M191 103 C194 97 199 89 202 82" opacity=".45" />
      </g>
    </svg>
  )
}
