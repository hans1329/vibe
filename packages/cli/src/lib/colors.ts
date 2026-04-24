// Brand palette — mirrors src/index.css tokens.
// Uses kleur (no dependencies) for terminal coloring with graceful fallback.

import kleur from 'kleur'

// Hex reference (for 24-bit terminals):
//   navy-900  #060C1A     gold-500 #F0C040     cream    #F8F5EE
//   teal-500  #00D4AA     scarlet  #C8102E     muted    #6B7280

// True-color escapes — kleur doesn't expose setRgb, so we wrap manually.
// Terminals without truecolor still see readable ANSI (dim fallback chain).
function rgb(r: number, g: number, b: number) {
  return (s: string) => `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m`
}

export const c = {
  gold:    rgb(0xF0, 0xC0, 0x40),
  cream:   rgb(0xF8, 0xF5, 0xEE),
  teal:    rgb(0x00, 0xD4, 0xAA),
  scarlet: rgb(0xC8, 0x10, 0x2E),
  muted:   rgb(0x6B, 0x72, 0x80),
  blue:    rgb(0x60, 0xA5, 0xFA),
  violet:  rgb(0xA7, 0x8B, 0xFA),
  dim:     kleur.dim,
  bold:    kleur.bold,
}

/** Pick a color based on a 0–100 score, matching web UI thresholds. */
export function scoreTone(score: number) {
  if (score >= 75) return c.teal
  if (score >= 50) return c.gold
  return c.scarlet
}

/** Pick a color for delta (+/- vs parent snapshot). */
export function deltaTone(delta: number) {
  if (delta > 0) return c.teal
  if (delta < 0) return c.scarlet
  return c.muted
}
