import { getSessionUser, makeToken, json } from '@/lib/api-helpers'
import { extraViewsFor } from '@/lib/rbac'

export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return json({ user: null })
  const extraViews = await extraViewsFor(user)
  // self-heal: if the client lost its cookie (mobile iframe), give it a fresh
  // token to mirror into localStorage so the header channel keeps working.
  return json({ user, extraViews, token: makeToken(user.id) })
}
