// Generic "Share on X" button driven by a cmo_templates row.
// Higher-level than ShareToXButton (which uses hardcoded copy) — this
// fetches the user_share template from the DB so the copy is admin-
// editable from /admin/cmo without redeploying.
//
// Common surfaces:
//   ProjectDetailPage  · audit_complete / graduation / milestone
//   ScoutsPage · /me   · early_spotter (Scout Forecast hit)

import { useState } from 'react'
import { shareWithTemplate, type UserShareTemplateId, type SlotMap } from '../lib/userShareTemplate'

function IconX({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

interface Props {
  templateId: UserShareTemplateId
  slots:      SlotMap
  /** Canonical commit.show URL the tweet should attach (X embeds the
   *  page's og:image as a card). For per-project share the project
   *  detail URL is the right call. */
  url?:       string
  /** Visual variant. `gold` is primary CTA placement; `ghost` is a
   *  secondary inline action that won't compete with other gold buttons. */
  variant?:   'gold' | 'ghost'
  /** Override the rendered label · default "Share on X". */
  label?:     string
}

export function ShareUserTemplateButton({
  templateId, slots, url,
  variant = 'gold', label = 'Share on X',
}: Props) {
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState<string | null>(null)

  const click = async () => {
    setBusy(true)
    setErr(null)
    const ok = await shareWithTemplate(templateId, slots, url)
    setBusy(false)
    if (!ok) setErr('share template not found · admin must seed cmo_templates')
  }

  const baseStyle: React.CSSProperties = {
    border:       'none',
    borderRadius: '2px',
    cursor:       busy ? 'wait' : 'pointer',
    fontWeight:   600,
  }
  const styleByVariant: Record<string, React.CSSProperties> = {
    gold: {
      ...baseStyle,
      background: busy ? 'rgba(240,192,64,0.5)' : 'var(--gold-500)',
      color:      'var(--navy-900)',
      padding:    '8px 14px',
    },
    ghost: {
      ...baseStyle,
      background: 'transparent',
      color:      'var(--gold-500)',
      border:     '1px solid rgba(240,192,64,0.45)',
      padding:    '6px 12px',
    },
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <button
        type="button"
        onClick={click}
        disabled={busy}
        className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wide"
        style={styleByVariant[variant]}
        onMouseEnter={e => { if (variant === 'gold' && !busy) e.currentTarget.style.background = 'var(--gold-400)' }}
        onMouseLeave={e => { if (variant === 'gold' && !busy) e.currentTarget.style.background = 'var(--gold-500)' }}
        aria-label={label}
      >
        <IconX size={12} />
        {busy ? 'OPENING…' : label}
      </button>
      {err && <span className="font-mono text-[10px]" style={{ color: 'var(--scarlet)' }}>{err}</span>}
    </span>
  )
}
