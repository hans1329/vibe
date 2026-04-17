import { useState, useEffect } from 'react'

interface NavProps {
  onSubmitClick: () => void
  onFeedClick: () => void
}

export function Nav({ onSubmitClick, onFeedClick }: NavProps) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 h-16 transition-all duration-300"
      style={{
        background: scrolled ? 'rgba(6, 12, 26, 0.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(16px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(240,192,64,0.1)' : 'none',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="seal w-9 h-9 text-xs font-mono font-medium text-gold-500">d.</div>
        <span
          className="font-display font-bold text-xl tracking-tight"
          style={{ color: 'var(--cream)' }}
        >
          debut<span style={{ color: 'var(--gold-500)' }}>.show</span>
        </span>
      </div>

      {/* Links */}
      <div className="hidden md:flex items-center gap-8">
        {[
          { label: 'How it works', action: () => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' }) },
          { label: 'Projects', action: onFeedClick },
          { label: 'Grades', action: () => document.getElementById('grades')?.scrollIntoView({ behavior: 'smooth' }) },
        ].map(({ label, action }) => (
          <button
            key={label}
            onClick={action}
            className="text-sm font-mono tracking-wide transition-colors"
            style={{ color: 'rgba(248,245,238,0.5)', background: 'none', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--gold-500)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(248,245,238,0.5)')}
          >
            {label}
          </button>
        ))}
        <button
          onClick={onSubmitClick}
          className="px-5 py-2 text-sm font-medium tracking-wide transition-all"
          style={{
            background: 'var(--gold-500)',
            color: 'var(--navy-900)',
            border: 'none',
            borderRadius: '2px',
            cursor: 'pointer',
            fontFamily: 'DM Mono, monospace',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--gold-400)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--gold-500)')}
        >
          Register — $99
        </button>
      </div>
    </nav>
  )
}
