// Polymorphic applaud toggle (§7.5 · §13-B).
// Works on any target_type: product · comment · build_log · stack · brief · recommit.
// One click = on/off. Count updates optimistically; falls back on error.

import { useEffect, useState } from 'react'
import {
  castApplaud,
  removeApplaud,
  countApplauds,
  hasApplauded,
  CannotApplaudOwnContentError,
} from '../lib/applaud'
import type { ApplaudTargetType } from '../lib/supabase'
import { IconApplaud } from './icons'

export interface ApplaudButtonProps {
  targetType:     ApplaudTargetType
  targetId:       string
  viewerMemberId: string | null         // null → unauth
  isOwnContent?:  boolean               // render disabled with tooltip
  size?:          'sm' | 'md'
  className?:     string
  onChange?:      (active: boolean, count: number) => void
  // When true, hide the count label (pure icon button).
  hideCount?:     boolean
}

export function ApplaudButton({
  targetType,
  targetId,
  viewerMemberId,
  isOwnContent = false,
  size = 'md',
  className,
  onChange,
  hideCount = false,
}: ApplaudButtonProps) {
  const [active, setActive]   = useState(false)
  const [count, setCount]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const [c, mine] = await Promise.all([
        countApplauds(targetType, targetId),
        viewerMemberId
          ? hasApplauded({ targetType, targetId, memberId: viewerMemberId })
          : Promise.resolve(false),
      ])
      if (cancelled) return
      setCount(c)
      setActive(mine)
      setLoading(false)
    })().catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [targetType, targetId, viewerMemberId])

  const disabled = !viewerMemberId || isOwnContent || loading || busy

  const tooltip = !viewerMemberId
    ? 'Sign in to applaud'
    : isOwnContent
      ? "You can't applaud your own content"
      : active
        ? 'Remove applaud'
        : 'Applaud'

  const iconSize = size === 'sm' ? 12 : 14

  async function onClick() {
    if (disabled || !viewerMemberId) return
    setBusy(true)
    setError(null)

    // Optimistic flip
    const nextActive = !active
    const nextCount  = count + (nextActive ? 1 : -1)
    setActive(nextActive)
    setCount(nextCount)

    try {
      const ref = { targetType, targetId, memberId: viewerMemberId }
      if (nextActive) {
        await castApplaud(ref)
      } else {
        await removeApplaud(ref)
      }
      onChange?.(nextActive, nextCount)
    } catch (e) {
      // Rollback
      setActive(active)
      setCount(count)
      if (e instanceof CannotApplaudOwnContentError) {
        setError("You can't applaud your own content")
      } else {
        setError('Something went wrong. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  const padY = size === 'sm' ? 0.25 : 0.4
  const padX = size === 'sm' ? 0.55 : 0.75
  const fontSize = size === 'sm' ? 11 : 12

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={error ?? tooltip}
      aria-pressed={active}
      aria-label={tooltip}
      className={className}
      style={{
        display:       'inline-flex',
        alignItems:    'center',
        gap:           '0.4em',
        padding:       `${padY}rem ${padX}rem`,
        fontFamily:    'DM Mono, monospace',
        fontSize,
        lineHeight:    1,
        background:    active ? 'rgba(240,192,64,0.12)' : 'transparent',
        color:         active ? 'var(--gold-500)' : 'var(--text-label)',
        border:        `1px solid ${active ? 'rgba(240,192,64,0.45)' : 'rgba(255,255,255,0.12)'}`,
        borderRadius:  '2px',
        cursor:        disabled ? 'not-allowed' : 'pointer',
        opacity:       disabled && !active ? 0.55 : 1,
        transition:    'color 120ms, background 120ms, border-color 120ms',
      }}
      onMouseEnter={e => {
        if (disabled) return
        e.currentTarget.style.borderColor = 'rgba(240,192,64,0.6)'
        if (!active) e.currentTarget.style.color = 'var(--cream)'
      }}
      onMouseLeave={e => {
        if (disabled) return
        e.currentTarget.style.borderColor = active
          ? 'rgba(240,192,64,0.45)'
          : 'rgba(255,255,255,0.12)'
        if (!active) e.currentTarget.style.color = 'var(--text-label)'
      }}
    >
      <IconApplaud size={iconSize} />
      {!hideCount && (
        <span className="tabular-nums">{count}</span>
      )}
    </button>
  )
}
