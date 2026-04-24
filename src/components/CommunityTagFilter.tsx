// Tag chip row · filters the list under it to posts carrying the selected tag.
// Free-form tag text is allowed on the post side; this component only surfaces
// the DEFAULT_TAGS vocabulary (§13-B.10 V1 Day 1).

import { DEFAULT_TAGS } from '../lib/community'

interface Props {
  active:     string | null
  onChange:   (tag: string | null) => void
  className?: string
}

export function CommunityTagFilter({ active, onChange, className }: Props) {
  return (
    <div className={`flex items-center gap-1.5 overflow-x-auto pb-1 ${className ?? ''}`} style={{ scrollbarWidth: 'thin' }}>
      <TagChip label="All" active={active == null} onClick={() => onChange(null)} />
      {DEFAULT_TAGS.map(tag => (
        <TagChip
          key={tag}
          label={`#${tag}`}
          active={active === tag}
          onClick={() => onChange(active === tag ? null : tag)}
        />
      ))}
    </div>
  )
}

function TagChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-shrink-0 font-mono text-[11px] tracking-wide px-2.5 py-1 transition-colors"
      style={{
        background:   active ? 'rgba(240,192,64,0.12)' : 'transparent',
        color:        active ? 'var(--gold-500)' : 'var(--text-secondary)',
        border:       `1px solid ${active ? 'rgba(240,192,64,0.45)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: '2px',
        cursor:       'pointer',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--cream)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text-secondary)' }}
    >
      {label}
    </button>
  )
}
