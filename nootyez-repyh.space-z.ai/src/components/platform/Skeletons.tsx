'use client'
import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Shared premium loading skeletons (Task 8-a — skeleton parity sweep).
 * All placeholders use the .pz-skeleton shimmer utility from globals.css
 * (cream/stone sweep, prefers-reduced-motion opt-out, .dark variant).
 * Each skeleton mirrors the real card/table layout of its section so the
 * swap from skeleton → data feels seamless.
 */

/** shimmer placeholder block (cream/stone sweep — .pz-skeleton in globals.css) */
export function SkeletonBlock({ className }: { className?: string }) {
  return <div aria-hidden className={cn('pz-skeleton', className)} />
}

/* ================= generic table rows (Orders / Deliveries history) ================= */

/** one skeleton <tr> with `cols` shimmer cells */
export function TableRowSkeleton({ cols, widths }: { cols: number; widths?: string[] }) {
  return (
    <tr aria-hidden>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="border-b border-[#EFEAD8] px-3 py-2.5">
          <SkeletonBlock className={cn('h-4', widths?.[i] ?? 'w-3/4')} />
        </td>
      ))}
    </tr>
  )
}

/** table skeleton mirroring TableWrap (header strip + N rows) — used inside TableWrap */
export function TableRowsSkeleton({ rows = 6, cols = 5, widths }: { rows?: number; cols?: number; widths?: string[] }) {
  return (
    <tbody role="status" aria-label="در حال بارگذاری…">
      {Array.from({ length: rows }).map((_, r) => (
        <TableRowSkeleton key={r} cols={cols} widths={widths} />
      ))}
    </tbody>
  )
}

/* ================= delivery cards (DeliveriesSection receive/confirm/overview) ================= */

/** mirrors the real delivery card: code+badge header, supplier line, meta row, full-width button */
export function DeliveryCardSkeleton() {
  return (
    <SkeletonCard aria-hidden>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <SkeletonBlock className="h-5 w-24" />
          <SkeletonBlock className="mt-2 h-3 w-2/3" />
        </div>
        <SkeletonBlock className="h-5 w-16 rounded-full" />
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        <SkeletonBlock className="h-3 w-20" />
        <SkeletonBlock className="h-3 w-12" />
        <SkeletonBlock className="h-3 w-16" />
      </div>
      <SkeletonBlock className="mt-3 h-11 w-full rounded-xl" />
    </SkeletonCard>
  )
}

/** grid of delivery-card skeletons — same classes as the real grid */
export function DeliveryGridSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div role="status" aria-label="در حال بارگذاری تحویل‌ها…" className={cn('grid gap-3 md:grid-cols-2 xl:grid-cols-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <DeliveryCardSkeleton key={i} />
      ))}
    </div>
  )
}

/* ================= order cards (OrdersSection list) ================= */

/** mirrors OrderListCard: code+badge, supplier+payment, meta row, footer money+time */
export function OrderCardSkeleton() {
  return (
    <SkeletonCard aria-hidden className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <SkeletonBlock className="h-5 w-24" />
        <SkeletonBlock className="h-5 w-16 rounded-full" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <SkeletonBlock className="h-4 w-1/2" />
        <SkeletonBlock className="h-5 w-14 rounded-full" />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <SkeletonBlock className="h-3 w-24" />
        <SkeletonBlock className="h-3 w-14" />
      </div>
      <SkeletonBlock className="h-1.5 w-full rounded-full" />
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-[#EFEAD8] pt-2.5">
        <SkeletonBlock className="h-4 w-20" />
        <SkeletonBlock className="h-3 w-16" />
      </div>
    </SkeletonCard>
  )
}

/** grid of order-card skeletons — same classes as the real orders grid */
export function OrdersGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div role="status" aria-label="در حال بارگذاری سفارش‌ها…" className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <OrderCardSkeleton key={i} />
      ))}
    </div>
  )
}

/* ================= warehouse tabs ================= */

/** mirrors a warehouse request card: title, badge row, note strip, avatar+actions footer */
export function WarehouseRequestSkeleton() {
  return (
    <SkeletonCard aria-hidden>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <SkeletonBlock className="h-4 w-2/5" />
          <div className="mt-2 flex items-center gap-2">
            <SkeletonBlock className="h-6 w-20 rounded-full" />
            <SkeletonBlock className="h-3 w-16" />
          </div>
        </div>
        <SkeletonBlock className="h-5 w-24 rounded-full" />
      </div>
      <SkeletonBlock className="mt-3 h-9 w-full rounded-lg" />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#EFEAD8] pt-3">
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-7 w-7 rounded-full" />
          <SkeletonBlock className="h-3 w-16" />
        </div>
        <div className="flex gap-2">
          <SkeletonBlock className="h-10 w-24 rounded-xl" />
          <SkeletonBlock className="h-10 w-20 rounded-xl" />
        </div>
      </div>
    </SkeletonCard>
  )
}

/** vertical stack of warehouse request skeletons (requests tab) */
export function WarehouseRequestsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div role="status" aria-label="در حال بارگذاری درخواست‌های انبار…" className="max-h-[68vh] space-y-3 overflow-y-auto pz-scroll pl-1">
      {Array.from({ length: count }).map((_, i) => (
        <WarehouseRequestSkeleton key={i} />
      ))}
    </div>
  )
}

/** mirrors a customer-ask card in the 2-col grid */
export function CustomerAskSkeleton() {
  return (
    <SkeletonCard aria-hidden className="flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <SkeletonBlock className="h-5 w-1/2" />
        <SkeletonBlock className="h-5 w-24 rounded-full" />
      </div>
      <SkeletonBlock className="mt-2 h-3 w-2/3" />
      <div className="mt-3 flex items-center gap-2">
        <SkeletonBlock className="h-6 w-6 rounded-full" />
        <SkeletonBlock className="h-3 w-14" />
      </div>
      <div className="mt-3 border-t border-[#EFEAD8] pt-3">
        <SkeletonBlock className="h-11 w-full rounded-xl" />
      </div>
    </SkeletonCard>
  )
}

/** 2-col grid of customer-ask skeletons */
export function CustomerAsksSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div role="status" aria-label="در حال بارگذاری درخواست مشتریان…" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <CustomerAskSkeleton key={i} />
      ))}
    </div>
  )
}

/** mirrors a low-stock row card: product image + text lines + qty input + button */
export function LowStockRowSkeleton() {
  return (
    <SkeletonCard aria-hidden className="flex flex-wrap items-center gap-3 p-3.5">
      <SkeletonBlock className="h-12 w-12" />
      <div className="min-w-0 flex-1">
        <SkeletonBlock className="h-4 w-2/5" />
        <SkeletonBlock className="mt-1.5 h-3 w-1/3" />
        <div className="mt-2 flex items-center gap-2">
          <SkeletonBlock className="h-5 w-16 rounded-full" />
          <SkeletonBlock className="h-3 w-20" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <SkeletonBlock className="h-11 w-20 rounded-xl" />
        <SkeletonBlock className="h-10 w-28 rounded-xl" />
      </div>
    </SkeletonCard>
  )
}

/** vertical stack of low-stock row skeletons */
export function LowStockListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div role="status" aria-label="در حال بارگذاری کمبود موجودی…" className="max-h-[68vh] space-y-3 overflow-y-auto pz-scroll pl-1">
      {Array.from({ length: count }).map((_, i) => (
        <LowStockRowSkeleton key={i} />
      ))}
    </div>
  )
}

/* ================= local helper ================= */

/**
 * Card shell identical to kit Card (same border/shadow/rounding) so skeleton
 * cards occupy exactly the same visual space as the real ones. Local copy
 * instead of importing kit Card to keep this module dependency-light — but
 * any kit Card could be swapped in 1:1.
 */
function SkeletonCard({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-[#E4DCC8] bg-white/90 p-4 shadow-[0_2px_14px_-4px_rgba(90,74,32,0.14)]',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
