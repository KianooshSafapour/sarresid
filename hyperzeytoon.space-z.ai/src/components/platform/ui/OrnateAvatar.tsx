'use client'

// ============================================================================
// OrnateAvatar — professional digital avatar for Hyper Zeytoon.
// ----------------------------------------------------------------------------
// A pure-SVG "engraved seal" avatar: warm professional gradient, a subtle
// Persian ornament (boteh / girih star / shamsa / cypress / olive / pistachio
// / jajim weave / khatam marquetry), engraved double ring, soft sheen and
// business-safe initials. No animation, no images, no network — a full avatar
// is roughly 1 KB of markup and renders instantly even in long lists.
// ============================================================================

import * as React from 'react'
import { cn } from '@/lib/utils'
import { safeInitials, paletteByKey, avatarConfigFor, type AvatarConfig } from '@/lib/avatar'

/* ---------- ornament library (100×100 space, stroke-only, static) ---------- */

function Ornament({ pattern, stroke }: { pattern: string; stroke: string }) {
  const common = {
    fill: 'none',
    stroke,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  switch (pattern) {
    case 'girih': // eight-point tile star
      return (
        <g {...common} opacity={0.3}>
          <rect x="33" y="33" width="34" height="34" />
          <rect x="33" y="33" width="34" height="34" transform="rotate(45 50 50)" />
          <circle cx="50" cy="50" r="3.5" />
        </g>
      )
    case 'shamsa': // dome medallion
      return (
        <g {...common} opacity={0.3}>
          <circle cx="50" cy="50" r="17" />
          <circle cx="50" cy="50" r="7" />
          <path d="M50 18c4.5 7.5 4.5 13 0 20c-4.5-7-4.5-12.5 0-20z" />
          <path d="M50 82c4.5-7.5 4.5-13 0-20c-4.5 7-4.5 12.5 0 20z" />
          <path d="M18 50c7.5-4.5 13-4.5 20 0c-7 4.5-12.5 4.5-20 0z" />
          <path d="M82 50c-7.5 4.5-13 4.5-20 0c7-4.5 12.5-4.5 20 0z" />
        </g>
      )
    case 'cypress': // free-standing cypress
      return (
        <g {...common} opacity={0.32}>
          <path d="M50 14c11 14 13 32 5 46c4 8 2 16-5 22c-7-6-9-14-5-22c-8-14-6-32 5-46z" />
          <path d="M50 60v22" />
          <path d="M34 22c6 4 8 8 8 12" opacity={0.7} />
          <path d="M66 22c-6 4-8 8-8 12" opacity={0.7} />
        </g>
      )
    case 'olive': // olive branch
      return (
        <g {...common} opacity={0.32}>
          <path d="M24 70c14-16 32-26 54-30" />
          <path d="M40 62c1-8 5-13 12-16c0 8-4 13-12 16z" />
          <path d="M56 52c0-8 4-14 11-17c1 8-3 14-11 17z" />
          <circle cx="34" cy="68" r="4" />
          <circle cx="70" cy="40" r="4" />
        </g>
      )
    case 'pistachio': // smiling pistachio kernel
      return (
        <g {...common} opacity={0.32}>
          <ellipse cx="50" cy="52" rx="15" ry="20" transform="rotate(-16 50 52)" />
          <path d="M52 33c-7 9-7 29 2 38" />
          <path d="M46 30c-3-5-1-9 4-11" />
        </g>
      )
    case 'jajim': // tribal diagonal weave
      return (
        <g {...common} opacity={0.34}>
          <path d="M16 34l9-8 9 8 9-8 9 8 9-8 9 8 9-8" />
          <path d="M16 70l9 8 9-8 9 8 9-8 9 8 9-8 9 8" />
          <circle cx="50" cy="52" r="3" />
          <path d="M30 52h8M62 52h8" opacity={0.7} />
        </g>
      )
    case 'khatam': // marquetry diamond medallion
      return (
        <g {...common} opacity={0.3}>
          <path d="M50 24l24 26-24 26-24-26z" />
          <path d="M50 38l11 12-11 12-11-12z" />
          <path d="M18 50l8-8 8 8-8 8zM66 50l8-8 8 8-8 8z" opacity={0.7} />
        </g>
      )
    case 'boteh':
    default: // Kerman boteh-jegheh
      return (
        <g {...common} opacity={0.32}>
          <path d="M62 20c14 12 16 34 0 48c-13 12-31 8-35-6c-4-13 6-25 18-25c9 0 13 8 9 15" />
          <circle cx="50" cy="52" r="3" />
          <path d="M28 30c4-6 10-9 16-9" opacity={0.7} />
        </g>
      )
  }
}

/* ---------- the avatar ------------------------------------------------------- */

export interface OrnateAvatarProps {
  /** Full display name (initials are derived with the safe engine). */
  name: string
  /** Legacy accent color — used only as a graceful fallback gradient seed. */
  color?: string
  /** px, default 36 */
  size?: number
  /** stable seed for the deterministic style when no config is pinned */
  username?: string
  /** explicit pinned {pattern, palette} (from user prefs) */
  config?: { pattern?: string; palette?: string } | null
  className?: string
  /** hide the engraved ring (for tiny sizes) */
  ring?: boolean
  title?: string
}

export function OrnateAvatar({
  name,
  color,
  size = 36,
  username,
  config,
  className,
  ring = true,
  title,
}: OrnateAvatarProps) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '')
  const cfg: AvatarConfig = React.useMemo(
    () => avatarConfigFor(name, username, config),
    [name, username, config]
  )
  const pal = paletteByKey(cfg.palette)
  const initials = React.useMemo(() => safeInitials(name), [name])

  const gradientId = `hzav-g-${uid}`
  const sheenId = `hzav-s-${uid}`
  const clipId = `hzav-c-${uid}`

  // one hidden-word fallback for accessibility
  const label = title ?? name

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={label}
      className={cn('shrink-0 select-none', className)}
      style={{ width: size, height: size, backgroundColor: color ?? undefined, borderRadius: '9999px' }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={pal.from} />
          <stop offset="1" stopColor={pal.to} />
        </linearGradient>
        <radialGradient id={sheenId} cx="0.32" cy="0.24" r="0.9">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.16" />
        </radialGradient>
        <clipPath id={clipId}>
          <circle cx="50" cy="50" r="49" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        {/* base gradient (legacy color as floor for robustness) */}
        <rect x="0" y="0" width="100" height="100" fill={`url(#${gradientId})`} />
        {/* ornament */}
        <Ornament pattern={cfg.pattern} stroke={pal.ring} />
        {/* light shaping */}
        <rect x="0" y="0" width="100" height="100" fill={`url(#${sheenId})`} />
        {/* initials */}
        <text
          x="50"
          y="52"
          textAnchor="middle"
          dominantBaseline="central"
          fill={pal.ink}
          fontWeight={800}
          fontSize={initials.length > 1 ? 33 : 40}
          style={{ paintOrder: 'stroke', letterSpacing: '0.01em' }}
        >
          {initials}
        </text>
      </g>

      {/* engraved seal ring */}
      {ring && (
        <g fill="none" pointerEvents="none">
          <circle cx="50" cy="50" r="47.6" stroke={pal.ring} strokeWidth="2.6" opacity="0.95" />
          <circle cx="50" cy="50" r="43.8" stroke={pal.ring} strokeWidth="1" opacity="0.55" />
        </g>
      )}
    </svg>
  )
}
