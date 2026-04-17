# debut.show

**The vibe coding league.** Submit your AI-built project, get objectively scored, and graduate to the Hall of Fame.

> Season Zero · US Launch 2026

---

## What is debut.show?

A structured league platform for vibe-coded (AI-assisted) projects. Unlike Product Hunt's popularity contest, debut.show uses a **50% automated analysis + 30% Scout forecast + 20% community signal** scoring system to determine which projects are truly production-ready.

**Graduation** = Hall of Fame + Certification badge + Media exposure (10K guaranteed for Valedictorian) + Entry fee refund.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Backend | Supabase (PostgreSQL + Auth + Edge Functions) |
| AI Analysis | Claude API (claude-sonnet-4-5) |
| Lighthouse | Google PageSpeed Insights API |
| Deployment | Netlify |

---

## Getting Started

### 1. Clone & install

```bash
git clone https://github.com/hans1329/vibe.git
cd vibe
npm install
```

### 2. Set up environment

```bash
cp .env.example .env
```

Edit `.env`:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_PAGESPEED_KEY=your_google_api_key   # optional
```

### 3. Set up Supabase

Go to your Supabase dashboard → SQL Editor → paste and run `supabase/schema.sql`.

### 4. Run dev server

```bash
npm run dev
```

---

## Deploy to Cloudflare Pages (Free · Unlimited builds)

1. Push to GitHub
2. [dash.cloudflare.com](https://dash.cloudflare.com) → Pages → Create a project → Connect GitHub → `hans1329/vibe`
3. Build settings:
   - Framework preset: Vite
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_PAGESPEED_KEY` (optional)
5. Save and Deploy → `vibe.pages.dev` live
6. Custom domain: Pages → Custom domains → debut.show (1-click if domain is on Cloudflare)

---

## Project Structure

```
src/
├── components/
│   ├── Nav.tsx          # Fixed navigation
│   ├── Hero.tsx         # Landing hero section
│   ├── SubmitForm.tsx   # 4-step project submission + analysis
│   └── ProjectFeed.tsx  # Live project cards
├── lib/
│   ├── supabase.ts      # Supabase client + types
│   └── analysis.ts      # Lighthouse + GitHub + Claude pipeline
├── App.tsx              # Page layout + all sections
├── main.tsx
└── index.css            # Global styles + Ivy League design tokens
supabase/
└── schema.sql           # Full DB schema + RLS policies
```

---

## Scoring System

| Component | Weight | Source |
|-----------|--------|--------|
| Automated Analysis | 50% | GitHub API + PageSpeed API + MD integrity |
| Scout Forecast | 30% | Weighted votes (Platinum×3, Gold×2, Silver×1.5, Bronze×1) |
| Community Signal | 20% | Views · comments · shares · return visits |

**Graduation requires:** Total ≥ 75pts · Auto score ≥ 35/50 · ≥3 Scout votes · 2-week sustained score

---

## Roadmap

- **V0 (now):** Project submission + AI analysis + score card + feed
- **V0.5:** Supabase Auth + Scout tier system + Vote/Forecast UI + Stripe $99
- **V1:** Full 3-week season engine + Progress Bar + Applaud Week + Community Awards
- **V1.5:** MD Marketplace + Talent Market + Season Partners

---

## License

© 2026 debut.show · All rights reserved
