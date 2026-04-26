# Cloudflare — let AI agents read commit.show

## The problem

Cloudflare's "Block AI Bots" feature (enabled by default on many CF accounts
since early 2025) returns HTTP 403 for known AI crawler / agent user agents.
We verified live:

| User-Agent | Status |
|---|---|
| `Mozilla/5.0 Chrome` (browsers) | 200 ✅ |
| `Googlebot/2.1` | 200 ✅ |
| `Bingbot/2.0` | 200 ✅ |
| **`anthropic-ai/0.1.0`** | **403 ❌** |
| **`Claude-Web/1.0`** | **403 ❌** |
| **`ClaudeBot`** | **403 ❌** |
| **`GPTBot/1.0`** | **403 ❌** |
| **`ChatGPT-User/1.0`** | **403 ❌** |

This kills our viral funnel: when a user types
`commit.show 에서 우리 프로젝트 분석해줘` in Cursor / Claude Code / ChatGPT,
the agent's first instinct is `WebFetch https://commit.show` to learn what
the platform is. That returns 403, the agent assumes commit.show doesn't
exist or is broken, and falls back to "let me do my own scoring instead."

## The fix (one toggle in CF dashboard)

1. Go to https://dash.cloudflare.com → select the `commit.show` zone (or the
   Pages project if proxied separately)
2. Sidebar: **Security → Bots**
3. **Disable** "Block AI Scrapers and Crawlers" (the toggle that's on by
   default for many accounts)
4. Save

Optionally keep the lower-friction defences:
- ✅ "Bot Fight Mode" can stay on — it blocks low-effort scrapers but not
  the major AI agents whose UA we want to allow
- ✅ "Super Bot Fight Mode" — only enable on paid plans if you see actual
  abuse; otherwise it tends to false-positive on legit AI traffic

## How to verify after the fix

```bash
curl -sS https://commit.show/ -A "ClaudeBot" -o /dev/null -w "HTTP %{http_code}\n"
curl -sS https://commit.show/ -A "GPTBot/1.0" -o /dev/null -w "HTTP %{http_code}\n"
```

Both should return `HTTP 200`. If still 403:
- Check the Cloudflare → Security → WAF → Custom rules for any rule
  matching AI user agents
- Check Pages project → Settings → Functions → see if there's a custom
  middleware blocking

## Belt + suspenders we shipped on our side

Even after CF unblocks, these maximise the chance an agent figures out
commit.show on first contact:

| Asset | Purpose |
|---|---|
| `/llms.txt` | The emerging convention for "tell LLMs what this site is" — describes the npx CLI invocation, JSON schema, rate limits, scoring channels |
| `/robots.txt` | Explicitly allows ClaudeBot, GPTBot, PerplexityBot, etc. by name |
| `<noscript>` block in `index.html` | Static fallback with `npx commitshow audit ...` invocation visible even if the React SPA never hydrates |
| `og-image.png` + Twitter card | Already shipped — when commit.show is mentioned in chat, the link unfurl carries the brand mark and the score visual |

## Why we don't just remove Cloudflare

The CDN cache, edge `_headers`/`_redirects` rules, and Pages auto-deploy are
all pulling weight. Disabling the AI-bot block gives us crawlability without
losing any of that infrastructure.

## Long-term: don't depend on external crawlability

The MCP server (`@commitshow/mcp`, V1.5) sidesteps this problem entirely
because the agent doesn't need to web-fetch anything to discover the tool —
the tool registers itself via the MCP protocol. CLI + npm registry is also
crawlable independently of commit.show's HTTP origin.
