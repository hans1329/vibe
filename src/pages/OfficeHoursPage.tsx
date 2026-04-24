// Office Hours list — live sessions archive + upcoming (§13-B.6).
// V1 scope is Discord voice + summary post. X Space integration lands V1.5+.

import { useEffect, useState } from 'react'
import { CommunityLayout } from '../components/CommunityLayout'
import { listUpcomingOfficeHours, listPastOfficeHours, OFFICE_HOURS_FORMATS } from '../lib/community'
import type { OfficeHoursEvent } from '../lib/supabase'

export function OfficeHoursPage() {
  const [upcoming, setUpcoming] = useState<OfficeHoursEvent[] | null>(null)
  const [past, setPast]         = useState<OfficeHoursEvent[] | null>(null)

  useEffect(() => {
    listUpcomingOfficeHours().then(setUpcoming)
    listPastOfficeHours().then(setPast)
  }, [])

  return (
    <CommunityLayout>
      <div className="mb-5">
        <div className="font-mono text-xs tracking-widest" style={{ color: 'var(--gold-500)' }}>
          // OFFICE HOURS
        </div>
        <div className="font-display font-bold text-2xl mt-1" style={{ color: 'var(--cream)' }}>
          Live sessions · AMAs · pair builds
        </div>
        <div className="font-mono text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
          Discord voice · weekly cadence · recordings pinned back here
        </div>
      </div>

      <Section title="Upcoming" tone="#00D4AA" events={upcoming} empty="No sessions on the calendar yet." />
      <div className="mt-8">
        <Section title="Past" tone="var(--gold-500)" events={past} empty="No recordings archived yet." />
      </div>
    </CommunityLayout>
  )
}

function Section({
  title, tone, events, empty,
}: {
  title: string; tone: string; events: OfficeHoursEvent[] | null; empty: string
}) {
  return (
    <div>
      <div className="font-mono text-[11px] tracking-widest uppercase mb-2" style={{ color: tone }}>
        {title}
      </div>
      {events === null ? (
        <Empty label="Loading…" />
      ) : events.length === 0 ? (
        <Empty label={empty} />
      ) : (
        <div className="grid gap-2">
          {events.map(e => <EventRow key={e.id} event={e} tone={tone} />)}
        </div>
      )}
    </div>
  )
}

function EventRow({ event, tone }: { event: OfficeHoursEvent; tone: string }) {
  const label = OFFICE_HOURS_FORMATS[event.format] ?? event.format
  const when  = new Date(event.scheduled_at).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
  const target = event.recording_url ?? event.discord_url
  return (
    <a
      href={target ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="card-navy p-4 flex items-center justify-between gap-3 transition-all"
      style={{
        borderRadius: '2px',
        borderLeft: `3px solid ${tone}`,
        textDecoration: 'none',
        opacity: target ? 1 : 0.7,
        cursor: target ? 'pointer' : 'default',
      }}
    >
      <div className="min-w-0">
        <div className="font-mono text-[10px] tracking-widest uppercase mb-0.5" style={{ color: tone }}>
          {label}
        </div>
        <div className="font-display font-bold text-base truncate" style={{ color: 'var(--cream)' }}>
          {event.title}
        </div>
        {event.description && (
          <div className="font-light text-xs mt-1 truncate" style={{ color: 'var(--text-secondary)' }}>
            {event.description}
          </div>
        )}
      </div>
      <div className="font-mono text-[11px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
        {when}
      </div>
    </a>
  )
}

function Empty({ label }: { label: string }) {
  return (
    <div
      className="font-mono text-xs flex items-center justify-center py-10 text-center"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px dashed rgba(255,255,255,0.08)',
        color: 'var(--text-muted)',
        borderRadius: '2px',
      }}
    >
      {label}
    </div>
  )
}
