'use client'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    cache: 'no-store',
    ...options,
  })
  if (!res.ok) {
    let msg = `Request failed (${res.status})`
    try {
      const j = await res.json()
      if (j?.error) msg = j.error
    } catch { /* ignore */ }
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}

export const api = {
  get: <T,>(url: string) => request<T>(url),
  post: <T,>(url: string, body?: unknown) => request<T>(url, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T,>(url: string, body?: unknown) => request<T>(url, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
  del: <T,>(url: string) => request<T>(url, { method: 'DELETE' }),
}

/** Download a file from an API endpoint (GET) */
export async function downloadFile(url: string, filename: string) {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error('Download failed')
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 1000)
}

/** Upload a file (multipart) */
export async function uploadFile<T>(url: string, file: File, extra?: Record<string, string>): Promise<T> {
  const fd = new FormData()
  fd.append('file', file)
  if (extra) Object.entries(extra).forEach(([k, v]) => fd.append(k, v))
  const res = await fetch(url, { method: 'POST', body: fd })
  if (!res.ok) {
    let msg = 'Upload failed'
    try { const j = await res.json(); if (j?.error) msg = j.error } catch { /* ignore */ }
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}
