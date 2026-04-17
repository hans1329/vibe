import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { runLighthouse, checkGitHub, runClaudeAnalysis, type AnalysisResult } from '../lib/analysis'

type Step = 1 | 2 | 3 | 4

interface FormData {
  name: string; email: string; github: string; url: string; desc: string
  problem: string; features: string; tools: string; target: string
}

interface SubmitFormProps {
  onComplete?: () => void
}

const LOADER_STEPS = [
  'Checking Live URL health…',
  'Running Lighthouse via PageSpeed API…',
  'Parsing GitHub repository…',
  'Validating Build Brief integrity…',
  'Claude scoring & synthesizing…',
  'Saving to Supabase…',
]

const GRADE_COLORS: Record<string, string> = {
  Rookie: '#6B7280', Builder: '#60A5FA', Maker: '#00D4AA',
  Architect: '#A78BFA', 'Vibe Engineer': '#F0C040', Legend: '#C8102E',
}

function ScoreRing({ score }: { score: number }) {
  const r = 54
  const circumference = 2 * Math.PI * r
  const dash = (score / 100) * circumference
  const color = score >= 75 ? '#00D4AA' : score >= 50 ? '#F0C040' : '#C8102E'
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="140" height="140" className="-rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
        <circle
          cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="font-display font-black" style={{ fontSize: '2.2rem', color }}>{score}</div>
        <div className="font-mono text-xs" style={{ color: 'rgba(248,245,238,0.4)' }}>/ 100</div>
      </div>
    </div>
  )
}

export function SubmitForm({ onComplete }: SubmitFormProps) {
  const [step, setStep] = useState<Step>(1)
  const [form, setForm] = useState<FormData>({
    name: '', email: '', github: '', url: '', desc: '',
    problem: '', features: '', tools: '', target: '',
  })
  const [loaderIndex, setLoaderIndex] = useState(-1)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState('')

  const set = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const validateStep1 = () => {
    if (!form.name || !form.email || !form.github || !form.url || !form.desc) {
      setError('Please fill in all fields.'); return false
    }
    if (!form.github.includes('github.com')) {
      setError('Please enter a valid GitHub URL.'); return false
    }
    setError(''); return true
  }

  const validateStep2 = () => {
    if (!form.problem || !form.features || !form.tools || !form.target) {
      setError('Please fill in all Build Brief fields.'); return false
    }
    setError(''); return true
  }

  async function handleSubmit() {
    if (!validateStep2()) return
    setStep(3)

    // Step 1 — URL health
    setLoaderIndex(0)
    await new Promise(r => setTimeout(r, 700))

    // Step 2 — Lighthouse
    setLoaderIndex(1)
    const lh = await runLighthouse(form.url)

    // Step 3 — GitHub
    setLoaderIndex(2)
    const github_ok = await checkGitHub(form.github)

    // Step 4 — Brief
    setLoaderIndex(3)
    await new Promise(r => setTimeout(r, 500))

    // Step 5 — Claude
    setLoaderIndex(4)
    const claudeResult = await runClaudeAnalysis({
      name: form.name, desc: form.desc, github: form.github,
      url: form.url, tools: form.tools, problem: form.problem,
      features: form.features, target: form.target,
      lh, github_ok,
    })

    const final: AnalysisResult = {
      score_auto: claudeResult.score_auto || 0,
      score_forecast: 0,
      score_community: 1,
      score_total: claudeResult.score_total || (claudeResult.score_auto || 0) + 1,
      creator_grade: claudeResult.creator_grade || 'Rookie',
      verdict: claudeResult.verdict || '',
      insight: claudeResult.insight || '',
      tech_layers: claudeResult.tech_layers || [],
      graduation_ready: claudeResult.graduation_ready || false,
      unlock_level: 0,
      lh,
      github_ok,
    }

    // Step 6 — Supabase
    setLoaderIndex(5)
    await supabase.from('projects').insert([{
      name: form.name, email: form.email,
      github_url: form.github, live_url: form.url, description: form.desc,
      brief_problem: form.problem, brief_features: form.features,
      brief_tools: form.tools, brief_target: form.target,
      lh_performance: lh.performance, lh_accessibility: lh.accessibility,
      lh_best_practices: lh.bestPractices, lh_seo: lh.seo,
      github_accessible: github_ok,
      score_auto: final.score_auto,
      score_forecast: 0, score_community: 1,
      score_total: final.score_total,
      creator_grade: final.creator_grade,
      verdict: final.verdict,
      claude_insight: final.insight,
      tech_layers: final.tech_layers,
      unlock_level: 0,
      status: 'active',
      season: 'season_zero',
    }])

    await new Promise(r => setTimeout(r, 600))
    setResult(final)
    setStep(4)
    onComplete?.()
  }

  // ── STEP LABELS ──
  const steps = ['Project Info', 'Build Brief', 'Analysis', 'Result']

  return (
    <div className="max-w-2xl mx-auto px-4">

      {/* Progress */}
      <div className="flex mb-8">
        {steps.map((label, i) => {
          const n = i + 1
          const active = step === n
          const done = step > n
          return (
            <div key={label} className="flex-1 text-center relative">
              <div
                className="font-mono text-xs tracking-widest py-2.5"
                style={{
                  color: active ? 'var(--gold-500)' : done ? 'var(--accent3)' : 'rgba(248,245,238,0.25)',
                  borderBottom: `2px solid ${active ? 'var(--gold-500)' : done ? '#00D4AA' : 'rgba(255,255,255,0.06)'}`,
                  transition: 'all 0.3s',
                }}
              >
                {done ? '✓' : `0${n}`} {label}
              </div>
            </div>
          )
        })}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 text-sm font-mono" style={{ background: 'rgba(200,16,46,0.1)', border: '1px solid rgba(200,16,46,0.3)', color: '#F87171', borderRadius: '2px' }}>
          {error}
        </div>
      )}

      {/* ── STEP 1 ── */}
      {step === 1 && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="block font-mono text-xs tracking-widest mb-1.5" style={{ color: 'var(--gold-500)' }}>PROJECT NAME *</span>
              <input className="w-full px-3 py-2.5" value={form.name} onChange={set('name')} placeholder="My Vibe App" />
            </label>
            <label className="block">
              <span className="block font-mono text-xs tracking-widest mb-1.5" style={{ color: 'var(--gold-500)' }}>YOUR EMAIL *</span>
              <input className="w-full px-3 py-2.5" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="block font-mono text-xs tracking-widest mb-1.5" style={{ color: 'var(--gold-500)' }}>GITHUB URL *</span>
              <input className="w-full px-3 py-2.5" value={form.github} onChange={set('github')} placeholder="https://github.com/user/repo" />
            </label>
            <label className="block">
              <span className="block font-mono text-xs tracking-widest mb-1.5" style={{ color: 'var(--gold-500)' }}>LIVE URL *</span>
              <input className="w-full px-3 py-2.5" value={form.url} onChange={set('url')} placeholder="https://myapp.com" />
            </label>
          </div>
          <label className="block">
            <span className="block font-mono text-xs tracking-widest mb-1.5" style={{ color: 'var(--gold-500)' }}>ONE-LINE DESCRIPTION *</span>
            <input className="w-full px-3 py-2.5" value={form.desc} onChange={set('desc')} placeholder="What does your app do?" />
          </label>
          <button
            onClick={() => validateStep1() && setStep(2)}
            className="w-full py-3.5 font-mono text-sm tracking-wide transition-all mt-2"
            style={{ background: 'var(--gold-500)', color: 'var(--navy-900)', border: 'none', borderRadius: '2px', cursor: 'pointer' }}
          >
            Next: Build Brief →
          </button>
        </div>
      )}

      {/* ── STEP 2 ── */}
      {step === 2 && (
        <div className="space-y-5">
          <p className="text-sm font-light" style={{ color: 'rgba(248,245,238,0.45)' }}>
            Build Brief Phase 1 — Core Intent. Public during the season.
            Phase 2 (Strategy & Fix) unlocks after graduation.
          </p>
          {[
            { key: 'problem' as const, label: 'PROBLEM YOU\'RE SOLVING *', placeholder: 'What specific problem? Who has this problem?', area: true },
            { key: 'features' as const, label: 'CORE FEATURES (1–3) *', placeholder: 'List 1-3 core MVP features.', area: true },
            { key: 'tools' as const, label: 'AI TOOLS USED *', placeholder: 'Claude Code, Cursor, Lovable, v0, Supabase AI…', area: false },
            { key: 'target' as const, label: 'TARGET USER *', placeholder: 'indie hackers, K-pop fans, small teams…', area: false },
          ].map(({ key, label, placeholder, area }) => (
            <label key={key} className="block">
              <span className="block font-mono text-xs tracking-widest mb-1.5" style={{ color: 'var(--gold-500)' }}>{label}</span>
              {area
                ? <textarea className="w-full px-3 py-2.5" style={{ minHeight: 80, resize: 'vertical' }} value={form[key]} onChange={set(key)} placeholder={placeholder} />
                : <input className="w-full px-3 py-2.5" value={form[key]} onChange={set(key)} placeholder={placeholder} />
              }
            </label>
          ))}
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="flex-1 py-3 font-mono text-sm" style={{ background: 'transparent', border: '1px solid rgba(248,245,238,0.15)', color: 'var(--cream)', borderRadius: '2px', cursor: 'pointer' }}>
              ← Back
            </button>
            <button onClick={handleSubmit} className="flex-2 py-3 font-mono text-sm px-8 transition-all" style={{ background: 'var(--gold-500)', color: 'var(--navy-900)', border: 'none', borderRadius: '2px', cursor: 'pointer', flex: 2 }}>
              Run Analysis →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: LOADER ── */}
      {step === 3 && (
        <div className="text-center py-8">
          <div className="inline-block w-10 h-10 border-2 rounded-full mb-6" style={{ borderColor: 'rgba(240,192,64,0.2)', borderTopColor: 'var(--gold-500)', animation: 'spin 0.8s linear infinite' }} />
          <p className="font-mono text-sm mb-6" style={{ color: 'rgba(248,245,238,0.4)' }}>Analyzing your project…</p>
          <ul className="text-left max-w-xs mx-auto space-y-2">
            {LOADER_STEPS.map((label, i) => (
              <li key={i} className="flex gap-3 items-center font-mono text-xs" style={{
                color: i < loaderIndex ? 'rgba(248,245,238,0.3)' : i === loaderIndex ? 'var(--gold-500)' : 'rgba(248,245,238,0.2)',
                textDecoration: i < loaderIndex ? 'line-through' : 'none',
              }}>
                <span>{i < loaderIndex ? '✓' : i === loaderIndex ? '›' : '○'}</span>
                {label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── STEP 4: RESULT ── */}
      {step === 4 && result && (
        <div className="space-y-6">
          {/* Grade badge */}
          <div className="text-center mb-2">
            <span
              className="inline-block px-5 py-2 font-mono text-xs tracking-widest"
              style={{
                background: `${GRADE_COLORS[result.creator_grade] || '#6B7280'}18`,
                border: `1px solid ${GRADE_COLORS[result.creator_grade] || '#6B7280'}44`,
                color: GRADE_COLORS[result.creator_grade] || '#6B7280',
                borderRadius: '2px',
              }}
            >
              CREATOR GRADE: {result.creator_grade.toUpperCase()}
            </span>
          </div>

          {/* Score ring + sub scores */}
          <div className="card-navy p-6 text-center">
            <ScoreRing score={result.score_total} />
            <p className="mt-3 text-sm font-light" style={{ color: 'rgba(248,245,238,0.5)' }}>{result.verdict}</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Auto Analysis', val: result.score_auto, max: 50, color: 'var(--gold-500)' },
              { label: 'Scout Forecast', val: result.score_forecast, max: 30, color: '#A78BFA' },
              { label: 'Community', val: result.score_community, max: 20, color: '#00D4AA' },
            ].map(({ label, val, max, color }) => (
              <div key={label} className="card-navy p-4 text-center">
                <div className="font-display font-bold text-2xl" style={{ color }}>{val}</div>
                <div className="font-mono text-xs mt-1" style={{ color: 'rgba(248,245,238,0.3)' }}>{label} /{max}</div>
              </div>
            ))}
          </div>

          {/* Lighthouse */}
          <div className="card-navy p-5">
            <div className="font-mono text-xs tracking-widest mb-3" style={{ color: 'rgba(248,245,238,0.3)' }}>LIGHTHOUSE SCORES</div>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Perf', val: result.lh.performance },
                { label: 'A11y', val: result.lh.accessibility },
                { label: 'BP', val: result.lh.bestPractices },
                { label: 'SEO', val: result.lh.seo },
              ].map(({ label, val }) => {
                const color = val >= 90 ? '#00D4AA' : val >= 70 ? '#F0C040' : '#C8102E'
                return (
                  <div key={label} className="text-center p-3" style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '2px' }}>
                    <div className="font-display font-bold text-xl" style={{ color }}>{val}</div>
                    <div className="font-mono text-xs mt-1" style={{ color: 'rgba(248,245,238,0.3)' }}>{label}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Claude insight */}
          <div className="card-navy p-5" style={{ borderLeft: '3px solid var(--gold-500)' }}>
            <div className="font-mono text-xs tracking-widest mb-2" style={{ color: 'var(--gold-500)' }}>CLAUDE INSIGHT</div>
            <p className="text-sm font-light leading-relaxed" style={{ color: 'rgba(248,245,238,0.65)' }}>{result.insight}</p>
          </div>

          {/* Unlock tree */}
          <div className="card-navy p-5">
            <div className="font-mono text-xs tracking-widest mb-4" style={{ color: 'rgba(248,245,238,0.3)' }}>ANALYSIS UNLOCK TREE</div>
            {[
              { votes: 0, label: 'Initial Analysis', desc: 'GitHub · Lighthouse · MD integrity · Live URL', done: true },
              { votes: 3, label: 'Code Quality Snapshot', desc: 'Complexity · duplicate patterns · function audit', done: false },
              { votes: 5, label: 'Security Layer', desc: 'RLS · env vars · API auth patterns', done: false },
              { votes: 10, label: 'Production Ready Check', desc: 'CWV · dependency vulnerabilities · uptime', done: false },
              { votes: 20, label: 'Scout Deep Review', desc: 'Expert structured feedback — Platinum+ only', done: false },
            ].map(({ votes, label, desc, done }) => (
              <div key={label} className="flex gap-3 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div
                  className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-mono text-xs font-medium mt-0.5"
                  style={done
                    ? { background: 'rgba(0,212,170,0.15)', color: '#00D4AA', border: '1px solid rgba(0,212,170,0.3)' }
                    : { background: 'rgba(255,255,255,0.04)', color: 'rgba(248,245,238,0.25)', border: '1px solid rgba(255,255,255,0.08)' }
                  }
                >
                  {done ? '✓' : votes}
                </div>
                <div>
                  <div className="text-sm font-medium" style={{ color: done ? 'var(--cream)' : 'rgba(248,245,238,0.4)' }}>{label}</div>
                  <div className="text-xs font-light mt-0.5" style={{ color: 'rgba(248,245,238,0.3)' }}>{desc}</div>
                  {!done && <div className="font-mono text-xs mt-1" style={{ color: 'var(--gold-500)', opacity: 0.7 }}>Unlocks at {votes} Scout votes</div>}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => { setStep(1); setResult(null); setForm({ name:'',email:'',github:'',url:'',desc:'',problem:'',features:'',tools:'',target:'' }) }}
            className="w-full py-3 font-mono text-sm tracking-wide"
            style={{ background: 'transparent', border: '1px solid rgba(240,192,64,0.25)', color: 'var(--gold-500)', borderRadius: '2px', cursor: 'pointer' }}
          >
            Submit Another Project
          </button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
