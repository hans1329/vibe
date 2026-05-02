// Privacy Policy · public page.
//
// V1 minimum-viable draft (CLAUDE.md §17 flags external counsel review
// before launch). Mirrors the data we actually collect and the third
// parties we share with — kept honest so a security reviewer or a state
// attorney general checking compliance can match what we say to what the
// codebase actually does.
//
// Categories we touch and where they're documented in code:
//   · auth identities         · src/lib/auth.tsx + supabase/migrations
//   · project metadata         · supabase/schema.sql + projects
//   · audit data               · supabase/functions/analyze-project
//   · view tracking            · supabase/migrations/20260502_project_views
//   · X handle                 · supabase/migrations/20260502_x_oauth_identity
//   · payment processor        · Stripe (V1 launch)
//   · third-party APIs         · Anthropic Claude · GitHub · Google PageSpeed
//
// LEGAL DISCLAIMER (in-code only): not a substitute for counsel review.
// CCPA / GDPR / COPPA specific clauses should be verified by an attorney
// before public launch.

import { useNavigate } from 'react-router-dom'

export function PrivacyPage() {
  const navigate = useNavigate()
  const lastUpdated = 'May 2, 2026'

  return (
    <section className="relative z-10 pt-20 pb-20 px-4 md:px-6 min-h-screen">
      <div className="max-w-3xl mx-auto">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
          className="mb-5 font-mono text-xs tracking-wide"
          style={{ background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', padding: 0 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--gold-500)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
        >
          ← BACK
        </button>

        <header className="mb-10">
          <div className="font-mono text-xs tracking-widest mb-2" style={{ color: 'var(--gold-500)' }}>
            // PRIVACY POLICY
          </div>
          <h1 className="font-display font-black text-3xl md:text-4xl mb-3" style={{ color: 'var(--cream)' }}>
            Privacy Policy
          </h1>
          <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
            Last updated: {lastUpdated}
          </p>
        </header>

        <Section title="1 · Who we are" anchor="who">
          <P>
            commit.show is operated by <B>Madeflo Inc.</B>, a Delaware
            corporation ("Madeflo", "commit.show", "we", "us", or "our"),
            and runs a public league for AI-assisted software projects.
            This policy explains what personal information we collect, how
            we use it, and the choices you have.
          </P>
        </Section>

        <Section title="2 · Information we collect" anchor="collect">
          <P>
            <B>Account information.</B> When you sign in, we receive your
            email address and a unique user identifier. If you sign in via
            Google, GitHub, X (Twitter), or LinkedIn, we additionally
            receive your public username, display name, and avatar from that
            provider. We do not receive your password.
          </P>
          <P>
            <B>Profile information.</B> Anything you add to your profile —
            display name, avatar, preferred stack, X handle — is stored on
            our servers and may be visible to other members.
          </P>
          <P>
            <B>Project information.</B> The GitHub URL, live URL, project
            name, description, screenshots, build brief, and any related
            metadata you submit, plus everything our audit engine derives
            from those (Lighthouse scores, GitHub statistics, code-style
            findings, etc.).
          </P>
          <P>
            <B>Audit history.</B> Every analysis run produces an immutable
            snapshot. We retain these so the ladder, season standings, and
            per-project timelines stay reproducible.
          </P>
          <P>
            <B>Engagement.</B> Comments, applauds, votes, and forecasts you
            create, along with the timestamps and the targets they apply to.
          </P>
          <P>
            <B>View tracking.</B> When you visit a project page, we record
            an event with a randomly generated session identifier (hashed in
            your browser before being sent), a coarse referrer hostname,
            and your member id if you are signed in. We do not collect raw
            IP addresses.
          </P>
          <P>
            <B>Payment information (when applicable).</B> If you pay an
            audition fee, our payment processor (Stripe) collects your
            payment details directly — we receive only the transaction
            metadata (status, amount, last-four of card).
          </P>
          <P>
            <B>Communications.</B> Emails you send us, notification
            preferences, and any feedback you submit.
          </P>
        </Section>

        <Section title="3 · How we use it" anchor="use">
          <ul className="space-y-2 ml-2">
            <Bullet>To operate the Service (sign-in, profile, audits, ladder, comments).</Bullet>
            <Bullet>To produce and maintain audit reports and rankings.</Bullet>
            <Bullet>To prevent abuse (duplicate submissions, vote manipulation, IP-rotation rate-limit evasion).</Bullet>
            <Bullet>To send transactional emails (account, audit-completion, season events) and, if you opt in, product news.</Bullet>
            <Bullet>To improve the audit engine's accuracy via aggregate metrics.</Bullet>
            <Bullet>To comply with law and respond to legal process.</Bullet>
          </ul>
        </Section>

        <Section title="4 · Service providers we share with" anchor="providers">
          <P>
            We share the minimum data necessary with these providers:
          </P>
          <ul className="space-y-2 ml-2">
            <Bullet><B>Supabase</B> — hosts our database, authentication, and storage.</Bullet>
            <Bullet><B>Cloudflare</B> — serves the website and protects against abuse.</Bullet>
            <Bullet><B>Anthropic (Claude API)</B> — generates audit narratives from project metadata you submitted.</Bullet>
            <Bullet><B>GitHub</B> — we read public information from the repository URLs you provide.</Bullet>
            <Bullet><B>Google PageSpeed Insights</B> — runs Lighthouse measurements against your live URL.</Bullet>
            <Bullet><B>X / Google / GitHub / LinkedIn</B> — only when you choose to sign in or link an identity.</Bullet>
            <Bullet><B>Stripe</B> — processes payments. Stripe's Privacy Policy applies to payment data.</Bullet>
          </ul>
          <P>
            We do not sell personal information to advertisers or data
            brokers.
          </P>
        </Section>

        <Section title="5 · Cookies and local storage" anchor="cookies">
          <P>
            We use browser cookies and localStorage to keep you signed in,
            remember your session for view-tracking deduplication, and store
            UI preferences. You can clear these at any time via your
            browser; doing so will sign you out.
          </P>
        </Section>

        <Section title="6 · Retention and deletion" anchor="retention">
          <P>
            We retain your data for as long as your account is active. You
            can delete a project (which cascades to its audit history,
            comments, votes, and applauds) from the project page, or your
            entire account from your profile page. Account deletion removes
            personal identifiers; some derived ladder statistics may persist
            in anonymized form.
          </P>
          <P>
            Backup copies kept for disaster recovery may persist for up to
            30 days after deletion.
          </P>
        </Section>

        <Section title="7 · Your rights" anchor="rights">
          <P>
            Depending on where you live, you may have the right to:
          </P>
          <ul className="space-y-2 ml-2">
            <Bullet>Access the personal information we hold about you.</Bullet>
            <Bullet>Correct inaccurate information.</Bullet>
            <Bullet>Delete your information (subject to lawful exceptions).</Bullet>
            <Bullet>Receive a portable copy of your information.</Bullet>
            <Bullet>Object to or restrict certain processing.</Bullet>
            <Bullet>Withdraw consent at any time, where processing is consent-based.</Bullet>
          </ul>
          <P>
            To exercise any of these rights, write to <Email />. We will
            respond within 30 days.
          </P>
        </Section>

        <Section title="8 · Children" anchor="children">
          <P>
            commit.show is not directed at children under 13. We do not
            knowingly collect personal information from children under 13.
            If you believe we have, contact us at <Email /> and we will
            promptly delete it.
          </P>
        </Section>

        <Section title="9 · Security" anchor="security">
          <P>
            We use industry-standard security measures (TLS in transit,
            row-level security on the database, hashed identifiers, scoped
            API keys) to protect your information. No system is perfectly
            secure; please use a strong password and report any suspected
            issue to <Email />.
          </P>
        </Section>

        <Section title="10 · International transfers" anchor="transfers">
          <P>
            Madeflo Inc. is incorporated in Delaware, United States, and
            our service providers may operate in multiple regions. By using
            the Service you consent to your information being processed in
            the United States and other countries with different
            data-protection laws than your home country.
          </P>
        </Section>

        <Section title="11 · Changes to this policy" anchor="changes">
          <P>
            We may update this Policy from time to time. Material changes
            will be communicated via the Service or by email at least 14
            days before they take effect.
          </P>
        </Section>

        <Section title="12 · Contact" anchor="contact">
          <P>
            For privacy questions or requests, write to us at <Email />.
          </P>
        </Section>
      </div>
    </section>
  )
}

function Section({ title, anchor, children }: { title: string; anchor: string; children: React.ReactNode }) {
  return (
    <section id={anchor} className="mb-10" style={{ scrollMarginTop: '80px' }}>
      <h2 className="font-display font-black text-xl md:text-2xl mb-4" style={{ color: 'var(--cream)' }}>
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm font-light" style={{ color: 'var(--text-primary)', lineHeight: 1.7 }}>
      {children}
    </p>
  )
}

function B({ children }: { children: React.ReactNode }) {
  return <strong style={{ color: 'var(--cream)' }}>{children}</strong>
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="pl-3 text-sm font-light flex gap-2" style={{ color: 'var(--text-primary)', lineHeight: 1.6 }}>
      <span style={{ color: 'var(--gold-500)', flexShrink: 0 }}>·</span>
      <span>{children}</span>
    </li>
  )
}

function Email() {
  return (
    <a href="mailto:privacy@commit.show" style={{ color: 'var(--gold-500)' }}>
      privacy@commit.show
    </a>
  )
}
