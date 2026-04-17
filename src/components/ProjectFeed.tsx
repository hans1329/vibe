import { useEffect, useState } from 'react'
import { supabase, type Project } from '../lib/supabase'

const GRADE_COLORS: Record<string, string> = {
  Rookie: '#6B7280', Builder: '#60A5FA', Maker: '#00D4AA',
  Architect: '#A78BFA', 'Vibe Engineer': '#F0C040', Legend: '#C8102E',
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 75 ? '#00D4AA' : score >= 50 ? '#F0C040' : '#C8102E'
  return (
    <span className="font-mono text-xs px-2 py-1" style={{
      background: `${color}15`, color, border: `1px solid ${color}30`, borderRadius: '2px',
    }}>
      {score}pts
    </span>
  )
}

export function ProjectFeed() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setProjects(data || [])
        setLoading(false)
      })
  }, [])

  if (loading) return (
    <div className="text-center py-20 font-mono text-sm" style={{ color: 'rgba(248,245,238,0.25)' }}>
      Loading projects…
    </div>
  )

  if (projects.length === 0) return (
    <div className="text-center py-20">
      <div className="font-display text-2xl font-bold mb-3" style={{ color: 'rgba(248,245,238,0.2)' }}>No projects yet.</div>
      <p className="font-mono text-sm" style={{ color: 'rgba(248,245,238,0.2)' }}>Be the first to debut. ↑</p>
    </div>
  )

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-10">
      {projects.map((p, i) => {
        const gc = GRADE_COLORS[p.creator_grade] || '#6B7280'
        return (
          <div
            key={p.id}
            className="card-navy p-6 transition-all duration-200 cursor-pointer group"
            style={{ animationDelay: `${i * 0.05}s` }}
            onClick={() => window.open(p.live_url, '_blank')}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-display font-bold text-lg leading-tight group-hover:text-gold-400 transition-colors" style={{ color: 'var(--cream)' }}>
                {p.name}
              </h3>
              <ScoreBadge score={p.score_total} />
            </div>

            {/* Desc */}
            <p className="text-sm font-light mb-4 line-clamp-2" style={{ color: 'rgba(248,245,238,0.5)', lineHeight: 1.6 }}>
              {p.description}
            </p>

            {/* Tags */}
            {p.tech_layers?.length > 0 && (
              <div className="flex gap-2 flex-wrap mb-4">
                {p.tech_layers.slice(0, 3).map(t => (
                  <span key={t} className="font-mono text-xs px-2 py-0.5" style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(248,245,238,0.35)',
                    borderRadius: '2px',
                  }}>{t}</span>
                ))}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <span className="font-mono text-xs font-medium" style={{ color: gc }}>{p.creator_grade}</span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs" style={{ color: 'rgba(248,245,238,0.25)' }}>
                  ⚡ {p.score_forecast} votes
                </span>
                {p.github_url && (
                  <a
                    href={p.github_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="font-mono text-xs transition-colors"
                    style={{ color: 'rgba(248,245,238,0.25)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--gold-500)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(248,245,238,0.25)')}
                  >
                    GitHub ↗
                  </a>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
