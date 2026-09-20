'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Barcode-friendly input: focuses itself, works with USB/keyboard-wedge scanners
 * (they "type" the code + Enter). Enter triggers onScan. Also has a manual button.
 */
export function BarcodeInput({
  onScan,
  placeholder = 'بارکد را اسکن کنید یا دستی وارد کنید…',
  className,
  autoFocus = false,
  value,
  onValueChange,
}: {
  onScan?: (code: string) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
  value?: string
  onValueChange?: (v: string) => void
}) {
  const [internal, setInternal] = React.useState('')
  const v = value ?? internal
  const setV = (nv: string) => {
    setInternal(nv)
    onValueChange?.(nv)
  }
  const ref = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  return (
    <div className={cn('relative flex items-center', className)}>
      <input
        ref={ref}
        value={v}
        inputMode="numeric"
        autoComplete="off"
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && v.trim()) {
            e.preventDefault()
            onScan?.(v.trim())
            setV('')
          }
        }}
        placeholder={placeholder}
        className="w-full h-11 rounded-xl border border-input bg-card px-4 pl-11 text-sm num outline-none focus:ring-2 focus:ring-ring/40"
      />
      <span className="absolute left-3.5 pointer-events-none text-muted-foreground" aria-hidden>
        🔍
      </span>
    </div>
  )
}
