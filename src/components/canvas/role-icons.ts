'use client'

import {
  ChartNetwork,
  CodeXml,
  Combine,
  Compass,
  PenLine,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import type { AgentRole } from '@/lib/contracts/common'

export const roleIcons: Record<AgentRole, LucideIcon> = {
  researcher: Search,
  analyst: ChartNetwork,
  coder: CodeXml,
  specialist: Sparkles,
  writer: PenLine,
  synthesizer: Combine,
  reviewer: ShieldCheck,
  judge: Trophy,
  aligner: Compass,
}
