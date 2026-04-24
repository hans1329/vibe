// Local CLI config — ~/.commitshow/config.json
//
// Holds the Supabase JWT once login lands (V1 backend work). For now the
// file mostly stores cached preferences, but we keep the path stable so the
// device-flow (when added) can drop tokens without migration.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface CliConfig {
  /** Supabase access_token once `commitshow login` completes. */
  token?: string
  /** Supabase refresh_token (device-flow adds this). */
  refresh_token?: string
  /** Linked member id (populated on login). */
  member_id?: string
  /** Display name (populated on login). */
  display_name?: string
  /** Override the base URL (for self-hosted or staging). */
  base_url?: string
}

const CONFIG_DIR = join(homedir(), '.commitshow')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

export function readConfig(): CliConfig {
  if (!existsSync(CONFIG_PATH)) return {}
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf8')
    return JSON.parse(raw) as CliConfig
  } catch {
    return {}
  }
}

export function writeConfig(next: CliConfig): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 })
  writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), { mode: 0o600 })
}

export function clearConfig(): void {
  writeConfig({})
}
