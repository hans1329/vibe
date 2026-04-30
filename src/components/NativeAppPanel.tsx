// Native-app surface · only renders when the latest snapshot's
// breakdown.is_native_app is true. Reads from
// snapshot.rich_analysis.breakdown.{native_distribution, native_completeness}.
//
// Strategic framing (errors-first · 2026-04-30 pivot): leads with the
// gates that block App Store / Play Store approval (privacy policy,
// permissions manifest), then surfaces distribution evidence as
// "where users can get this app". The score isn't repeated here;
// this panel is about *concrete things to fix*.

interface NativeDistribution {
  pts: number
  breakdown: {
    app_store:      boolean
    play_store:     boolean
    test_flight:    boolean
    f_droid:        boolean
    release_binary: boolean
  }
}

interface NativeCompleteness {
  pts: number
  breakdown: {
    privacy_policy:        boolean
    permissions_manifest:  boolean
  }
}

export interface NativeAppBreakdown {
  is_native_app:        true
  native_distribution?: NativeDistribution | null
  native_completeness?: NativeCompleteness | null
}

interface Props {
  breakdown: NativeAppBreakdown
}

export function NativeAppPanel({ breakdown }: Props) {
  const dist = breakdown.native_distribution
  const compl = breakdown.native_completeness

  const distRows: Array<{ label: string; ok: boolean; hint: string }> = [
    { label: 'App Store',   ok: !!dist?.breakdown.app_store,      hint: 'iTunes / App Store listing link in README' },
    { label: 'Play Store',  ok: !!dist?.breakdown.play_store,     hint: 'play.google.com/store/apps link in README' },
    { label: 'TestFlight',  ok: !!dist?.breakdown.test_flight,    hint: 'testflight.apple.com/join invite link' },
    { label: 'F-Droid',     ok: !!dist?.breakdown.f_droid,        hint: 'f-droid.org/packages listing' },
    { label: 'Release binary', ok: !!dist?.breakdown.release_binary, hint: 'APK / DMG / MSI / AAB / etc mentioned in README' },
  ]

  const gateRows: Array<{ label: string; ok: boolean; hint: string }> = [
    { label: 'Privacy policy URL',   ok: !!compl?.breakdown.privacy_policy,        hint: 'Public privacy-policy URL · App Store / Play Store rejection gate' },
    { label: 'Permissions manifest', ok: !!compl?.breakdown.permissions_manifest,  hint: 'AndroidManifest.xml · Info.plist · entitlements.plist present in repo' },
  ]

  return (
    <div className="card-navy w-full max-w-full overflow-hidden" style={{ borderRadius: '2px' }}>
      {/* Header */}
      <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="font-mono text-xs tracking-widest mb-1.5" style={{ color: 'var(--gold-500)' }}>
          // NATIVE APP TRACK
        </div>
        <div className="font-display font-bold text-lg" style={{ color: 'var(--cream)' }}>
          Where this app ships, and what gatekeepers will check
        </div>
        <p className="font-light text-xs mt-1.5" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          We don't run Lighthouse on a native app — the runtime is the user's phone, not a server.
          Instead we look for the things App Store / Play Store reviewers and your own users will check.
        </p>
      </div>

      {/* Store-gating row · errors-first */}
      <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="font-mono text-[10px] tracking-widest mb-3 flex items-baseline justify-between" style={{ color: 'var(--text-muted)' }}>
          <span>STORE GATES</span>
          <span className="tabular-nums" style={{ color: compl && compl.pts === 2 ? '#00D4AA' : '#F88771' }}>
            {compl?.pts ?? 0} / 2
          </span>
        </div>
        <div className="space-y-2">
          {gateRows.map(r => (
            <div key={r.label} className="flex items-baseline gap-3">
              <span className="font-mono text-[11px] flex-shrink-0" style={{
                color: r.ok ? '#00D4AA' : '#F88771', width: 14, textAlign: 'center',
              }}>
                {r.ok ? '✓' : '✗'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs" style={{ color: r.ok ? 'var(--cream)' : '#F88771' }}>
                  {r.label}
                </div>
                <div className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {r.hint}
                </div>
              </div>
            </div>
          ))}
        </div>
        {compl && compl.pts < 2 && (
          <div className="mt-3 pl-3 py-2 pr-3 font-mono text-[11px]" style={{
            borderLeft: '2px solid #F88771',
            background: 'rgba(248,120,113,0.04)',
            color: '#F88771',
            lineHeight: 1.55,
          }}>
            App / Play Store will reject submissions without these.
            Add them before you ship.
          </div>
        )}
      </div>

      {/* Distribution evidence */}
      <div className="px-5 py-4">
        <div className="font-mono text-[10px] tracking-widest mb-3 flex items-baseline justify-between" style={{ color: 'var(--text-muted)' }}>
          <span>DISTRIBUTION</span>
          <span className="tabular-nums" style={{ color: 'var(--gold-500)' }}>
            {dist?.pts ?? 0} / 5
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {distRows.map(r => (
            <div key={r.label} className="flex items-baseline gap-2 px-2.5 py-2" style={{
              background: r.ok ? 'rgba(0,212,170,0.04)' : 'rgba(255,255,255,0.015)',
              border: `1px solid ${r.ok ? 'rgba(0,212,170,0.25)' : 'rgba(255,255,255,0.05)'}`,
              borderRadius: '2px',
            }}>
              <span className="font-mono text-[10px] flex-shrink-0" style={{
                color: r.ok ? '#00D4AA' : 'var(--text-muted)', width: 10, textAlign: 'center',
              }}>
                {r.ok ? '●' : '○'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-[11px]" style={{ color: r.ok ? 'var(--cream)' : 'var(--text-muted)' }}>
                  {r.label}
                </div>
                <div className="font-mono text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-faint)' }}>
                  {r.hint}
                </div>
              </div>
            </div>
          ))}
        </div>
        {dist && dist.pts === 0 && (
          <div className="mt-3 font-mono text-[11px]" style={{ color: 'var(--text-muted)', lineHeight: 1.55 }}>
            No distribution links detected. Add an App Store / Play Store /
            TestFlight link to your README so we can verify the app is
            actually shipping somewhere users can install it.
          </div>
        )}
      </div>
    </div>
  )
}
