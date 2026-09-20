'use client'

import { useEffect, useState } from 'react'

export interface ClientUser {
  id: string
  name: string
  roles: string[]
  primaryRole: string
  color: string
  points: number
  token: string
}

const STORAGE_KEY = 'zeytoon_session'

export function getStoredUser(): ClientUser | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function storeUser(u: ClientUser | null) {
  if (u) localStorage.setItem(STORAGE_KEY, JSON.stringify(u))
  else localStorage.removeItem(STORAGE_KEY)
}

export function useUser(): { user: ClientUser | null; loading: boolean; logout: () => void } {
  const [user, setUser] = useState<ClientUser | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe session read from localStorage after mount
    setUser(getStoredUser())
    setLoading(false)
  }, [])
  return {
    user,
    loading,
    logout: () => {
      storeUser(null)
      setUser(null)
      window.location.reload()
    },
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const user = getStoredUser()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (user?.token) headers['Authorization'] = `Bearer ${user.token}`
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || `خطا در ارتباط با سرور (${res.status})`)
  }
  return res.json()
}

export const api = {
  get: <T,>(url: string) => request<T>('GET', url),
  post: <T,>(url: string, body?: unknown) => request<T>('POST', url, body),
  patch: <T,>(url: string, body?: unknown) => request<T>('PATCH', url, body),
  put: <T,>(url: string, body?: unknown) => request<T>('PUT', url, body),
  delete: <T,>(url: string) => request<T>('DELETE', url),
}
