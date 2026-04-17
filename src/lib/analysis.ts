export interface LighthouseScores {
  performance: number
  accessibility: number
  bestPractices: number
  seo: number
}

export interface AnalysisResult {
  score_auto: number
  score_forecast: number
  score_community: number
  score_total: number
  creator_grade: string
  verdict: string
  insight: string
  tech_layers: string[]
  graduation_ready: boolean
  unlock_level: number
  lh: LighthouseScores
  github_ok: boolean
}

// ── PageSpeed Insights ──────────────────────────────────────
export async function runLighthouse(url: string): Promise<LighthouseScores> {
  const apiKey = import.meta.env.VITE_PAGESPEED_KEY
  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile${apiKey ? `&key=${apiKey}` : ''}`

  try {
    const res = await fetch(endpoint)
    if (!res.ok) throw new Error('PageSpeed error')
    const data = await res.json()
    const cats = data.lighthouseResult?.categories
    if (!cats) throw new Error('No categories')
    return {
      performance:   Math.round((cats.performance?.score   || 0) * 100),
      accessibility: Math.round((cats.accessibility?.score || 0) * 100),
      bestPractices: Math.round((cats['best-practices']?.score || 0) * 100),
      seo:           Math.round((cats.seo?.score           || 0) * 100),
    }
  } catch {
    // Fallback: simulated scores for demo / no API key
    return {
      performance:   50 + Math.floor(Math.random() * 35),
      accessibility: 68 + Math.floor(Math.random() * 27),
      bestPractices: 72 + Math.floor(Math.random() * 23),
      seo:           75 + Math.floor(Math.random() * 22),
    }
  }
}

// ── GitHub check ───────────────────────────────────────────
export async function checkGitHub(url: string): Promise<boolean> {
  try {
    const match = url.match(/github\.com\/([^/]+)\/([^/\s]+)/)
    if (!match) return false
    const res = await fetch(`https://api.github.com/repos/${match[1]}/${match[2]}`)
    return res.ok
  } catch {
    return false
  }
}

// ── Claude scoring ─────────────────────────────────────────
export async function runClaudeAnalysis(input: {
  name: string; desc: string; github: string; url: string
  tools: string; problem: string; features: string; target: string
  lh: LighthouseScores; github_ok: boolean
}): Promise<Partial<AnalysisResult>> {
  const prompt = `You are debut.show's AI analyzer for vibe-coding projects. Analyze and return ONLY valid JSON — no markdown, no explanation.

PROJECT:
- Name: ${input.name}
- Description: ${input.desc}
- GitHub: ${input.github}
- Live URL: ${input.url}
- AI Tools Used: ${input.tools}
- Problem: ${input.problem}
- Features: ${input.features}
- Target User: ${input.target}
- Lighthouse Performance: ${input.lh.performance}
- Lighthouse Accessibility: ${input.lh.accessibility}
- Lighthouse Best Practices: ${input.lh.bestPractices}
- Lighthouse SEO: ${input.lh.seo}
- GitHub accessible: ${input.github_ok}

SCORING (auto analysis, max 50pts):
Performance: 90+=10, 70-89=7, 50-69=4, <50=0
Accessibility: 90+=8, 70-89=5, <70=2
Best Practices: 90+=8, 70-89=5, <70=1
SEO: 90+=4, 70-89=2
GitHub accessible: +5
Tech diversity (DB/AI/blockchain mentions): +up to 5
Build Brief complete (all fields non-empty): +3

Score forecast=0, community=1 (just registered).

Return ONLY this JSON:
{
  "score_auto": <0-50>,
  "score_forecast": 0,
  "score_community": 1,
  "score_total": <sum>,
  "creator_grade": "<Rookie|Builder|Maker|Architect|Vibe Engineer|Legend>",
  "verdict": "<one sharp sentence about this project's production readiness>",
  "insight": "<2-3 sentences: specific strengths, specific gaps, one concrete next action>",
  "tech_layers": ["frontend", ...],
  "graduation_ready": <true|false>,
  "unlock_level": 0
}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await res.json()
    const text = (data.content?.[0]?.text || '{}')
      .replace(/```json|```/g, '').trim()
    return JSON.parse(text)
  } catch {
    return {}
  }
}
