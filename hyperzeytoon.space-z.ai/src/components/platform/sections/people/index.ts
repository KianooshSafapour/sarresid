import type { ComponentType } from 'react'
import { Tasks } from './Tasks'
import { SOPs } from './SOPs'
import { Wall } from './Wall'
import { Notes } from './Notes'
import { Feedback } from './Feedback'
import { Chat } from './Chat'
import { Team } from './Team'
import { Customers } from './Customers'
import { FloorOps } from './FloorOps'
import { Planogram } from './Planogram'
import { Help } from './Help'
import { Admin } from './Admin'
import { Settings } from './Settings'
import { ActivityLog } from './ActivityLog'
import { DemoLab } from './DemoLab'
import { Leaves } from './Leaves'
import { Vault } from './Vault'

export const peopleSections: Record<string, ComponentType> = {
  tasks: Tasks,
  sops: SOPs,
  wall: Wall,
  notes: Notes,
  feedback: Feedback,
  chat: Chat,
  team: Team,
  customers: Customers,
  floor: FloorOps,
  planogram: Planogram,
  help: Help,
  admin: Admin,
  settings: Settings,
  activity: ActivityLog,
  'demo-lab': DemoLab,
  leaves: Leaves,
  vault: Vault,
}
