import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Public (pre-login): active staff directory for the login picker — no sensitive fields.
export async function GET() {
  const users = await db.user.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, username: true, name: true, title: true, gender: true, color: true },
  })
  return NextResponse.json({
    users: users.map((u) => ({
      ...u,
      // backup root account — rendered as «حساب پشتیبان» chip in the login grid
      isBackup: u.username === 'root.backup',
    })),
  })
}
