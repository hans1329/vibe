// One-click install card for the commit.show MCP server.
//
// Three editor surfaces, three different install ergonomics:
//   · Claude Code (CLI)  — copy a `claude mcp add …` shell command, the
//                          user pastes it into their terminal once.
//   · Claude Desktop     — no deep-link scheme exists, so we copy the
//                          JSON block the user pastes into the
//                          claude_desktop_config.json. Path is shown
//                          per OS so they don't have to google it.
//   · Cursor             — deep-link scheme `cursor://…/mcp/install`
//                          opens Cursor and pops the install dialog
//                          directly. One click and they're done.
//
// Cline / Windsurf / Continue all read the same JSON shape Claude
// Desktop uses, so we surface a single 'Other MCP host' button that
// copies that JSON.

import { useState } from 'react'

type Editor = 'claude_code' | 'claude_desktop' | 'cursor' | 'other'

const MCP_NAME = 'commitshow'
const MCP_CMD  = 'npx'
const MCP_ARGS = ['-y', 'commitshow-mcp'] as const

const CLAUDE_CODE_CMD = `claude mcp add ${MCP_NAME} -s user -- ${MCP_CMD} ${MCP_ARGS.join(' ')}`

const CLAUDE_DESKTOP_JSON = JSON.stringify(
  {
    mcpServers: {
      [MCP_NAME]: { command: MCP_CMD, args: [...MCP_ARGS] },
    },
  },
  null,
  2,
)

const OTHER_MCP_JSON = JSON.stringify(
  {
    [MCP_NAME]: { command: MCP_CMD, args: [...MCP_ARGS] },
  },
  null,
  2,
)

function buildCursorDeepLink(): string {
  const config = { command: MCP_CMD, args: [...MCP_ARGS] }
  // Cursor's deep-link expects a base64-encoded JSON config blob.
  // Browser only — this component is rendered client-side so window.btoa
  // is always available; we don't pull in a Node Buffer fallback.
  const b64 = typeof window !== 'undefined' && typeof window.btoa === 'function'
    ? window.btoa(JSON.stringify(config))
    : ''
  const params = new URLSearchParams({ name: MCP_NAME, config: b64 })
  return `cursor://anysphere.cursor-deeplink/mcp/install?${params.toString()}`
}

export function InstallInEditor() {
  const [copied, setCopied] = useState<Editor | null>(null)
  const [openHelp, setOpenHelp] = useState<Editor | null>(null)

  const copy = async (text: string, kind: Editor) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      setTimeout(() => setCopied(prev => (prev === kind ? null : prev)), 2200)
    } catch (e) {
      console.error('[install] clipboard failed', e)
    }
  }

  return (
    <section
      className="card-navy p-5 md:p-6"
      style={{ borderRadius: '2px' }}
      aria-labelledby="install-heading"
    >
      <div className="font-mono text-xs tracking-widest mb-2" style={{ color: 'var(--gold-500)' }}>
        // INSTALL IN YOUR EDITOR
      </div>
      <h2 id="install-heading" className="font-display font-bold text-2xl mb-2" style={{ color: 'var(--cream)' }}>
        Run the audit from inside your AI editor
      </h2>
      <p className="font-light text-sm mb-5 max-w-2xl" style={{ color: 'var(--text-secondary)', lineHeight: 1.65 }}>
        commit.show ships an MCP server. Pick your editor below — one click installs it. After that, just ask
        the model "audit this repo on commit.show" and it'll call the audit tool for you.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card
          editor="claude_code"
          title="Claude Code"
          subtitle="CLI · npx · 1 command"
          primaryLabel={copied === 'claude_code' ? 'Copied · paste in terminal' : 'Copy install command'}
          primaryActive={copied === 'claude_code'}
          onPrimary={() => copy(CLAUDE_CODE_CMD, 'claude_code')}
          codeBlock={CLAUDE_CODE_CMD}
          codeLang="bash"
          helpOpen={openHelp === 'claude_code'}
          onHelpToggle={() => setOpenHelp(o => (o === 'claude_code' ? null : 'claude_code'))}
          helpBody={(
            <>
              <p>Paste in any terminal. Registers globally (<span className="font-mono">-s user</span>) so every Claude Code session gets the audit tool.</p>
              <p className="mt-2">Verify with <span className="font-mono">claude mcp list</span>.</p>
            </>
          )}
        />

        <Card
          editor="cursor"
          title="Cursor"
          subtitle="Deep link · 1 click"
          primaryLabel="Open Cursor and install →"
          primaryHref={buildCursorDeepLink()}
          codeBlock={null}
          helpOpen={openHelp === 'cursor'}
          onHelpToggle={() => setOpenHelp(o => (o === 'cursor' ? null : 'cursor'))}
          helpBody={(
            <>
              <p>Cursor pops a 'Install MCP server?' dialog. Confirm and the audit tool surfaces in the chat panel.</p>
              <p className="mt-2">If the deep link doesn't fire (Cursor not installed yet), grab Cursor first — <a href="https://cursor.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold-500)' }}>cursor.com</a>.</p>
            </>
          )}
        />

        <Card
          editor="claude_desktop"
          title="Claude Desktop"
          subtitle="JSON snippet · paste once"
          primaryLabel={copied === 'claude_desktop' ? 'Copied · paste into config' : 'Copy config snippet'}
          primaryActive={copied === 'claude_desktop'}
          onPrimary={() => copy(CLAUDE_DESKTOP_JSON, 'claude_desktop')}
          codeBlock={CLAUDE_DESKTOP_JSON}
          codeLang="json"
          helpOpen={openHelp === 'claude_desktop'}
          onHelpToggle={() => setOpenHelp(o => (o === 'claude_desktop' ? null : 'claude_desktop'))}
          helpBody={(
            <>
              <p>Open the config file at:</p>
              <ul className="mt-1.5 list-disc pl-5 space-y-1">
                <li className="font-mono text-[11px]">macOS — <span style={{ color: 'var(--text-primary)' }}>~/Library/Application Support/Claude/claude_desktop_config.json</span></li>
                <li className="font-mono text-[11px]">Windows — <span style={{ color: 'var(--text-primary)' }}>%APPDATA%\Claude\claude_desktop_config.json</span></li>
              </ul>
              <p className="mt-2">Paste the snippet (merge with existing <span className="font-mono">mcpServers</span> if you have other entries). Quit Claude Desktop fully (<span className="font-mono">⌘Q</span>) and relaunch — the audit tool appears under the 🔌 icon.</p>
            </>
          )}
        />

        <Card
          editor="other"
          title="Cline · Windsurf · Continue · other"
          subtitle="Same MCP snippet"
          primaryLabel={copied === 'other' ? 'Copied' : 'Copy config snippet'}
          primaryActive={copied === 'other'}
          onPrimary={() => copy(OTHER_MCP_JSON, 'other')}
          codeBlock={OTHER_MCP_JSON}
          codeLang="json"
          helpOpen={openHelp === 'other'}
          onHelpToggle={() => setOpenHelp(o => (o === 'other' ? null : 'other'))}
          helpBody={(
            <p>Drop this entry under your host's <span className="font-mono">mcpServers</span> object. The exact file path varies — see your host's MCP docs (Cline · Windsurf · Continue all use the same shape).</p>
          )}
        />
      </div>

      <div className="mt-5 font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
        Source · <a href="https://www.npmjs.com/package/commitshow-mcp" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold-500)' }}>commitshow-mcp@npm</a>
        {' · '}
        <a href="https://github.com/commitshow/cli/tree/main/mcp" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold-500)' }}>repo</a>
        {' · '}No API key. Free · rate limits identical to the public REST API.
      </div>
    </section>
  )
}

interface CardProps {
  editor:        Editor
  title:         string
  subtitle:      string
  primaryLabel:  string
  primaryActive?: boolean
  onPrimary?:    () => void
  primaryHref?:  string
  codeBlock:     string | null
  codeLang?:     string
  helpOpen:      boolean
  onHelpToggle:  () => void
  helpBody:      React.ReactNode
}

function Card({
  title, subtitle, primaryLabel, primaryActive, onPrimary, primaryHref,
  codeBlock, codeLang, helpOpen, onHelpToggle, helpBody,
}: CardProps) {
  const primaryStyle: React.CSSProperties = {
    background:   primaryActive ? 'rgba(63,168,116,0.18)' : 'var(--gold-500)',
    color:        primaryActive ? '#3FA874' : 'var(--navy-900)',
    border:       primaryActive ? '1px solid rgba(63,168,116,0.45)' : 'none',
    borderRadius: '2px',
    cursor:       'pointer',
    fontWeight:   600,
    textDecoration: 'none',
  }
  return (
    <div
      className="px-4 py-4 flex flex-col gap-3"
      style={{
        border:      '1px solid rgba(255,255,255,0.08)',
        borderRadius: '2px',
        background:  'rgba(6,12,26,0.4)',
      }}
    >
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div>
          <div className="font-display font-bold text-base" style={{ color: 'var(--cream)' }}>{title}</div>
          <div className="font-mono text-[10px] tracking-wide" style={{ color: 'var(--text-muted)' }}>{subtitle}</div>
        </div>
      </div>

      {primaryHref ? (
        <a
          href={primaryHref}
          className="font-mono text-xs tracking-wide px-3 py-2 inline-flex items-center justify-center gap-2"
          style={primaryStyle}
        >
          {primaryLabel}
        </a>
      ) : (
        <button
          type="button"
          onClick={onPrimary}
          className="font-mono text-xs tracking-wide px-3 py-2"
          style={primaryStyle}
        >
          {primaryLabel}
        </button>
      )}

      {codeBlock && (
        <pre
          className="font-mono text-[10.5px] leading-relaxed whitespace-pre-wrap break-words m-0 px-3 py-2"
          style={{
            background:  'var(--navy-950)',
            border:      '1px solid rgba(255,255,255,0.06)',
            borderRadius: '2px',
            color:       'var(--text-primary)',
            maxHeight:   '180px',
            overflow:    'auto',
          }}
        >
          {codeBlock}
        </pre>
      )}

      <button
        type="button"
        onClick={onHelpToggle}
        className="font-mono text-[10px] tracking-wide self-start"
        style={{
          background: 'transparent',
          border:     'none',
          padding:    0,
          cursor:     'pointer',
          color:      'var(--text-muted)',
        }}
        aria-expanded={helpOpen}
      >
        {helpOpen ? '↑ hide details' : '↓ how this works'}
      </button>
      {helpOpen && (
        <div className="font-light text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {helpBody}
        </div>
      )}

      <div className="font-mono text-[9px] tracking-wide pt-1" style={{ color: 'var(--text-faint)' }}>
        {codeLang ? `lang · ${codeLang}` : 'one click'}
      </div>
    </div>
  )
}
