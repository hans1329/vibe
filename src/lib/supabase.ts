import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export type Project = {
  id: string
  created_at: string
  name: string
  email: string
  github_url: string
  live_url: string
  description: string
  brief_problem: string
  brief_features: string
  brief_tools: string
  brief_target: string
  lh_performance: number
  lh_accessibility: number
  lh_best_practices: number
  lh_seo: number
  github_accessible: boolean
  score_auto: number
  score_forecast: number
  score_community: number
  score_total: number
  creator_grade: string
  verdict: string
  claude_insight: string
  tech_layers: string[]
  unlock_level: number
  status: string
  season: string
}
