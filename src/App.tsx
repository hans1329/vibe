import { useEffect, useRef, useState } from 'react'
import { Nav } from './components/Nav'
import { Hero } from './components/Hero'
import { SubmitForm } from './components/SubmitForm'
import { ProjectFeed } from './components/ProjectFeed'
import { supabase } from './lib/supabase'
import './index.css'

const GRADE_DATA = [
  { icon: '🌱', name: 'Rookie', color: '#6B7280', cond: '1+ project registered · 0 graduated' },
  { icon: '🔨', name: 'Builder', color: '#60A5FA', cond: '1 graduated · avg 60+' },
  { icon: '⚙️', name: 'Maker', color: '#00D4AA', cond: '2 graduated · avg 70+' },
  { icon: '🏗️', name: 'Architect', color: '#A78BFA', cond: '3 graduated · avg 75+ · tech diversity' },
  { icon: '⚡', name: 'Vibe Engineer', color: '#F0C040', cond: '5 graduated · 20+ applause · avg 80+' },
  { icon: '👑', name: 'Legend', color: '#C8102E', cond: '10+ graduated · community influence' },
]

const UNLOCK_DATA = [
  { votes: 'Registration', label: 'Initial Analysis', desc: 'GitHub structure · Lighthouse 4 metrics · MD integrity · Live URL health', active: true },
  { votes: '3 votes', label: 'Code Quality Snapshot', desc: 'Complexity analysis · duplicate pattern detection · function length audit', active: false },
  { votes: '5 votes', label: 'Security Layer Analysis', desc: 'RLS policy check · env variable exposure · API auth pattern review', active: false },
  { votes: '10 votes', label: 'Production Ready Check', desc: 'Core Web Vitals · dependency vulnerabilities · uptime estimation', active: false },
  { votes: '20 votes', label: 'Scout Deep Review', desc: 'Structured expert feedback interface — Platinum+ Scouts only', active: false },
]

export default function App() {
  const submitRef = useRef<HTMLDivElement>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  const [projectCount, setProjectCount] = useState(0)
  const [graduatedCount, setGraduatedCount] = useState(0)
  const [feedKey, setFeedKey] = useState(0)

  useEffect(() => {
    supabase.from('projects').select('id, status').then(({ data }) => {
      if (data) {
        setProjectCount(data.length)
        setGraduatedCount(data.filter(p => p.status === 'graduated').length)
      }
    })
  }, [feedKey])

  const scrollToSubmit = () => submitRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const scrollToFeed = () => feedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="relative min-h-screen">
      <Nav onSubmitClick={scrollToSubmit} onFeedClick={scrollToFeed} />

      {/* Hero */}
      <Hero
        projectCount={projectCount}
        graduatedCount={graduatedCount}
        onSubmitClick={scrollToSubmit}
        onFeedClick={scrollToFeed}
      />

      {/* ── HOW IT WORKS ── */}
      <section id="how" className="relative z-10 py-24 px-6" style={{ borderTop: '1px solid rgba(240,192,64,0.08)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="font-mono text-xs tracking-widest mb-4" style={{ color: 'var(--gold-500)' }}>// HOW IT WORKS</div>
          <h2 className="font-display font-black text-4xl md:text-5xl mb-4 leading-tight" style={{ letterSpacing: '-2px' }}>
            3-week league.<br />Real graduation.
          </h2>
          <p className="font-light max-w-md mb-14" style={{ color: 'rgba(248,245,238,0.45)' }}>
            Not just upvotes. A structured analysis system that separates production-ready projects from prototypes.
          </p>

          <div className="grid md:grid-cols-3 gap-6 mb-20">
            {[
              { pct: '50%', color: 'var(--gold-500)', title: 'Automated Analysis', desc: 'GitHub structure · Lighthouse 4 metrics · MD integrity · Live URL · Tech layer diversity. Objective. Uncheatable.' },
              { pct: '30%', color: '#A78BFA', title: 'Scout Forecast', desc: 'Weighted votes from verified Scouts. Platinum×3 · Gold×2 · Silver×1.5 · Bronze×1. Quality over quantity.' },
              { pct: '20%', color: '#00D4AA', title: 'Community Signal', desc: 'Views · comment depth · shares · return visits. Quality-weighted — not raw counts.' },
            ].map(({ pct, color, title, desc }) => (
              <div key={title} className="card-navy p-7 transition-all duration-200 hover:border-gold-500/30">
                <div className="font-display font-black mb-2" style={{ fontSize: '2.8rem', color, lineHeight: 1 }}>{pct}</div>
                <div className="font-medium mb-2" style={{ color: 'var(--cream)' }}>{title}</div>
                <div className="text-sm font-light leading-relaxed" style={{ color: 'rgba(248,245,238,0.4)' }}>{desc}</div>
              </div>
            ))}
          </div>

          {/* Analysis unlock tree */}
          <div className="font-mono text-xs tracking-widest mb-6" style={{ color: 'rgba(248,245,238,0.3)' }}>PROGRESSIVE REVEAL — ANALYSIS UNLOCKS WITH SCOUT VOTES</div>
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-px" style={{ background: 'linear-gradient(to bottom, var(--gold-500), transparent)', opacity: 0.2 }} />
            {UNLOCK_DATA.map(({ votes, label, desc, active }) => (
              <div key={label} className="flex gap-6 pl-10 pb-6 relative">
                <div
                  className="absolute left-0 w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs flex-shrink-0"
                  style={active
                    ? { background: 'rgba(0,212,170,0.15)', color: '#00D4AA', border: '1px solid rgba(0,212,170,0.4)' }
                    : { background: 'var(--navy-800)', color: 'rgba(248,245,238,0.25)', border: '1px solid rgba(255,255,255,0.07)' }
                  }
                >
                  {active ? '✓' : '○'}
                </div>
                <div>
                  <div className="font-mono text-xs mb-1" style={{ color: active ? 'var(--gold-500)' : 'rgba(248,245,238,0.3)' }}>{votes}</div>
                  <div className="font-medium mb-1" style={{ color: active ? 'var(--cream)' : 'rgba(248,245,238,0.45)' }}>{label}</div>
                  <div className="text-sm font-light" style={{ color: 'rgba(248,245,238,0.3)' }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── GRADUATION ── */}
      <section className="relative z-10 py-24 px-6" style={{ borderTop: '1px solid rgba(240,192,64,0.08)', background: 'rgba(15,32,64,0.4)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="font-mono text-xs tracking-widest mb-4" style={{ color: 'var(--gold-500)' }}>// GRADUATION SYSTEM</div>
          <h2 className="font-display font-black text-4xl md:text-5xl mb-12" style={{ letterSpacing: '-2px' }}>
            Graduate or retry.
          </h2>
          <div className="grid md:grid-cols-4 gap-4">
            {[
              { grade: '수석 졸업', eng: 'Valedictorian', pct: '≈0.5% (1 fixed)', refund: '100% + $500 bonus', color: '#F0C040', perks: 'Hall of Fame · 10K media exposure · 1wk featured · Special NFT' },
              { grade: '우등 졸업', eng: 'Honors', pct: 'Top 5%', refund: '85%', color: '#A78BFA', perks: 'Hall of Fame · Cert badge · Featured · NFT' },
              { grade: '일반 졸업', eng: 'Graduate', pct: 'Top 20%', refund: '70%', color: '#60A5FA', perks: 'Grad badge · Brief full reveal · MD marketplace access' },
              { grade: '낙제', eng: 'Retry', pct: 'Bottom 80%', refund: '0%', color: '#6B7280', perks: 'AI analysis report · Brief private option · Retry next season' },
            ].map(({ grade, eng, pct, refund, color, perks }) => (
              <div key={grade} className="card-navy p-5 transition-all hover:border-gold-500/20" style={{ borderTop: `3px solid ${color}` }}>
                <div className="font-display font-bold text-base mb-0.5" style={{ color }}>{grade}</div>
                <div className="font-mono text-xs mb-3" style={{ color: 'rgba(248,245,238,0.3)' }}>{eng} · {pct}</div>
                <div className="font-mono text-sm font-medium mb-3" style={{ color: 'var(--cream)' }}>Refund: {refund}</div>
                <div className="text-xs font-light leading-relaxed" style={{ color: 'rgba(248,245,238,0.4)' }}>{perks}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── GRADES ── */}
      <section id="grades" className="relative z-10 py-24 px-6" style={{ borderTop: '1px solid rgba(240,192,64,0.08)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="font-mono text-xs tracking-widest mb-4" style={{ color: 'var(--gold-500)' }}>// CREATOR GRADES</div>
          <h2 className="font-display font-black text-4xl md:text-5xl mb-4" style={{ letterSpacing: '-2px' }}>Earn your grade.</h2>
          <p className="font-light max-w-md mb-10" style={{ color: 'rgba(248,245,238,0.45)' }}>
            Your cumulative graduation record determines your Creator Grade — visible on your profile, LinkedIn, and the Hall of Fame.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {GRADE_DATA.map(({ icon, name, color, cond }) => (
              <div key={name} className="card-navy p-5 transition-all hover:border-gold-500/30" style={{ borderLeft: `3px solid ${color}` }}>
                <div className="text-2xl mb-2">{icon}</div>
                <div className="font-display font-bold text-lg mb-1" style={{ color }}>{name}</div>
                <div className="font-mono text-xs leading-relaxed" style={{ color: 'rgba(248,245,238,0.35)' }}>{cond}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEED ── */}
      <section ref={feedRef} id="feed" className="relative z-10 py-24 px-6" style={{ borderTop: '1px solid rgba(240,192,64,0.08)', background: 'rgba(15,32,64,0.3)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="font-mono text-xs tracking-widest mb-4" style={{ color: 'var(--gold-500)' }}>// SEASON ZERO · LIVE FEED</div>
          <h2 className="font-display font-black text-4xl md:text-5xl" style={{ letterSpacing: '-2px' }}>Active projects.</h2>
          <ProjectFeed key={feedKey} />
        </div>
      </section>

      {/* ── SUBMIT ── */}
      <section ref={submitRef} id="submit" className="relative z-10 py-24 px-6" style={{ borderTop: '1px solid rgba(240,192,64,0.15)', background: 'rgba(10,22,40,0.6)' }}>
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <div className="font-mono text-xs tracking-widest mb-4" style={{ color: 'var(--gold-500)' }}>// REGISTER PROJECT</div>
            <h2 className="font-display font-black text-4xl md:text-5xl mb-3" style={{ letterSpacing: '-2px' }}>Debut your project.</h2>
            <p className="font-light" style={{ color: 'rgba(248,245,238,0.4)' }}>
              $99 entry fee · refunded on graduation · AI analysis starts immediately
            </p>
          </div>
          <SubmitForm onComplete={() => setFeedKey(k => k + 1)} />
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="relative z-10 py-8 px-6 text-center" style={{ borderTop: '1px solid rgba(240,192,64,0.08)' }}>
        <div className="font-display font-bold text-lg mb-1" style={{ color: 'var(--gold-500)' }}>debut<span style={{ color: 'rgba(248,245,238,0.4)' }}>.show</span></div>
        <p className="font-mono text-xs" style={{ color: 'rgba(248,245,238,0.2)' }}>
          Vibe Coding League · Season Zero · US Launch 2026 · All scores algorithmically determined
        </p>
      </footer>
    </div>
  )
}
