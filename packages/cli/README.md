# commitshow

> Audit any vibe-coded project from your terminal.

`commitshow` pulls the latest [commit.show](https://commit.show) audit report for
a project and renders it inline — Audit / Scout / Community scores, 3 strengths
+ 2 concerns, current season rank, delta since the last snapshot. Local runs
also save a `.commitshow/audit.md` file so your AI coding agent can read the
report in the next turn and iterate.

```bash
npx commitshow audit
# or audit any public project by URL — no cd required
npx commitshow audit github.com/owner/repo
```

## Install

```bash
# one-shot
npx commitshow audit <target>

# or global
npm i -g commitshow
commitshow audit <target>
```

Node 20+.

## Usage

| Command | What it does |
|---|---|
| `commitshow audit [target]` | Fetch + render the latest audit, write `.commitshow/audit.md` in local mode |
| `commitshow status [target]` | Same render, no re-run |
| `commitshow submit [target]` | Audition a project (coming soon · needs login) |
| `commitshow install <pack>` | Install a Library artifact (coming soon) |
| `commitshow login` | Device-flow sign-in (coming soon) |
| `commitshow whoami` | Print the linked account |

### Target forms

`audit` and `status` accept a positional target that auto-detects:

| Form | Example |
|---|---|
| cwd (omitted) | `commitshow audit` · infers from `git remote get-url origin` |
| Local path | `commitshow audit ./my-repo` |
| Remote URL | `commitshow audit github.com/owner/repo` · `commitshow audit https://github.com/owner/repo` |
| SSH remote | `commitshow audit git@github.com:owner/repo.git` (auto-converted) |
| Shorthand | `commitshow audit owner/repo` |

Remote-URL mode works from any directory, which makes one-line X posts
(`npx commitshow audit <their-url>`) trivial.

## The AI-coding loop

`commitshow audit` in local mode writes to `.commitshow/audit.md` after every
run. Point your coding agent at the file and it picks up exactly what
the audit flagged, with no prompt engineering:

```
You are pairing on <repo>. Read .commitshow/audit.md before each turn.
Pick the top concern and propose a minimal change; I'll run
`commitshow audit` again to check the delta.
```

## What's in the report

- **Score** · total out of 100, colored by threshold (teal ≥ 75 · gold 50–74 · scarlet < 50)
- **3-axis bars** · Audit / Scout / Community
- **3 strengths + 2 concerns** · asymmetric by design — concerns don't dominate
- **Rank + projected tier** · where you stand in the current season
- **Δ** · movement since the parent snapshot

## Roadmap

- `0.2` — device-flow login · `commitshow submit` · `.json` output for CI
- `0.3` — `commitshow install <pack>` with {{VARIABLE}} substitution
- `0.4` — MCP server variant (Cursor / Claude Desktop can call commit.show tools directly)

## Links

- Home: <https://commit.show>
- Source: <https://github.com/hans1329/vibe/tree/main/packages/cli>
- Issues: <https://github.com/hans1329/vibe/issues>

MIT © 2026 commit.show
