import * as React from 'react'

/**
 * Persian / Kerman cultural SVG ornaments — hand-drawn geometric motifs
 * inspired by pistachio orchards, iwan arches and girih tilework.
 * All decorative; aria-hidden by default.
 */

export function PistachioMotif({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      {/* open shell, left */}
      <path
        d="M30 52C16 52 8 41 8 30 8 17 18 8 30 8c4 0 6 3 6 6v32c0 3-2 6-6 6Z"
        fill="currentColor"
        opacity="0.16"
      />
      <path
        d="M30 52C16 52 8 41 8 30 8 17 18 8 30 8c4 0 6 3 6 6v32c0 3-2 6-6 6Z"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* shell ridge lines */}
      <path d="M28 14c-7 3-11 9-11 16s4 13 11 16" stroke="currentColor" strokeWidth="1.4" opacity="0.45" strokeLinecap="round" />
      {/* kernel */}
      <ellipse cx="42" cy="30" rx="10" ry="15" fill="currentColor" opacity="0.35" />
      <ellipse cx="42" cy="30" rx="10" ry="15" stroke="currentColor" strokeWidth="2.4" />
      <path d="M42 17c2 4 2 22 0 26" stroke="currentColor" strokeWidth="1.4" opacity="0.5" strokeLinecap="round" />
      {/* leaf sprig */}
      <path d="M52 46c4 1 7 4 8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
    </svg>
  )
}

export function IwanArch({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 90" fill="none" className={className} aria-hidden="true">
      {/* frame */}
      <rect x="4" y="4" width="112" height="82" rx="6" stroke="currentColor" strokeWidth="2.4" opacity="0.8" />
      {/* pointed persian arch */}
      <path
        d="M34 86V44c0-14 12-24 26-24s26 10 26 24v42"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      {/* arch inner offset */}
      <path
        d="M42 86V46c0-10 8-18 18-18s18 8 18 18v40"
        stroke="currentColor"
        strokeWidth="1.4"
        opacity="0.5"
      />
      {/* finial ornament */}
      <circle cx="60" cy="14" r="4" fill="currentColor" opacity="0.7" />
      <path d="M60 4v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {/* corner girih dots */}
      {[
        [12, 12], [108, 12], [12, 78], [108, 78],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2" fill="currentColor" opacity="0.55" />
      ))}
    </svg>
  )
}

export function GirihStar({ className }: { className?: string }) {
  // classic 8-pointed girih star
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <path
        d="M24 2l5 12 12-5-5 12 12 5-12 5 5 12-12-5-5 12-5-12-12 5 5-12-12-5 12-5-5-12 12 5 5-12Z"
        fill="currentColor"
        opacity="0.14"
      />
      <path
        d="M24 2l5 12 12-5-5 12 12 5-12 5 5 12-12-5-5 12-5-12-12 5 5-12-12-5 12-5-5-12 12 5 5-12Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="24" r="4" fill="currentColor" opacity="0.6" />
    </svg>
  )
}

/** Horizontal saffron-thread divider with pistachio center — for section breaks */
export function SaffronDivider({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className || ''}`} aria-hidden="true">
      <div className="h-px flex-1 bg-gradient-to-l from-transparent via-primary/40 to-primary/20" />
      <GirihStar className="size-5 text-primary/70" />
      <PistachioMotif className="size-7 text-primary/80" />
      <GirihStar className="size-5 text-primary/70" />
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/40 to-primary/20" />
    </div>
  )
}
