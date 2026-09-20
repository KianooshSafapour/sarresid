'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PUser } from './types'

export type ViewKey =
  | 'dashboard' | 'orders' | 'deliveries' | 'accounting' | 'payments'
  | 'products' | 'suppliers' | 'planogram' | 'warehouse' | 'tasks'
  | 'sops' | 'community' | 'notes' | 'messages' | 'crm' | 'profile'
  | 'admin' | 'audit' | 'reports' | 'demo' | 'pilot'

export type BadgeCounts = Record<
  'orders' | 'deliveries' | 'tasksMine' | 'messagesUnread' | 'cheques' | 'notifications',
  number
>

export const ZERO_BADGES: BadgeCounts = {
  orders: 0,
  deliveries: 0,
  tasksMine: 0,
  messagesUnread: 0,
  cheques: 0,
  notifications: 0,
}

interface AppState {
  user: PUser | null
  view: ViewKey
  focusOrderId: number | null
  newOrderSignal: number
  /** nav badge counts keyed by badgeKey (orders/deliveries/tasksMine/messagesUnread/cheques/notifications) */
  badges: BadgeCounts
  /** which user the current badge snapshot belongs to (so the poller can re-target after login/logout) */
  badgesUserId: number | null
  setUser: (u: PUser | null) => void
  setView: (v: ViewKey) => void
  openOrder: (id: number) => void
  requestNewOrder: () => void
  setBadges: (b: Partial<BadgeCounts> | Record<string, number>, userId?: number | null) => void
}

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      view: 'dashboard',
      focusOrderId: null,
      newOrderSignal: 0,
      badges: { ...ZERO_BADGES },
      badgesUserId: null,
      setUser: (u) => set({ user: u }),
      setView: (v) => set({ view: v, focusOrderId: null }),
      openOrder: (id) => set({ view: 'orders', focusOrderId: id }),
      requestNewOrder: () => set((s) => ({ view: 'orders', focusOrderId: null, newOrderSignal: s.newOrderSignal + 1 })),
      setBadges: (b, userId) =>
        set((s) => ({
          badges: { ...s.badges, ...b },
          ...(userId !== undefined ? { badgesUserId: userId } : {}),
        })),
    }),
    { name: 'hyperzeytoon-session' }
  )
)
