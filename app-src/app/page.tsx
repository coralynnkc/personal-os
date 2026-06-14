import HabitTracker from '@/components/HabitTracker'
import TodayTasks from '@/components/TodayTasks'
import Calendar from '@/components/Calendar'
import JobSearchWidget from '@/components/JobSearchWidget'

export default function Home() {
  return (
    <div style={{ padding: '16px 20px', width: '100%' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '260px 280px 1fr',
        gap: 12,
        alignItems: 'start',
        width: '100%',
      }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TodayTasks />
          <Calendar />
        </div>

        {/* Middle column — Job Search */}
        <JobSearchWidget />

        {/* Right column — Habit Tracker */}
        <HabitTracker />
      </div>
    </div>
  )
}

function PlaceholderCard({ label, height }: { label: string; height: number }) {
  return (
    <div style={{
      background: 'var(--glass)',
      border: '1px solid var(--glass-border)',
      borderRadius: 'var(--radius)',
      backdropFilter: 'blur(16px)',
      overflow: 'hidden',
      minHeight: height,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px 10px', borderBottom: '1px solid var(--glass-border)',
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', color: 'var(--ink-4)', textTransform: 'uppercase' }}>
          {label}
        </span>
      </div>
      <div style={{ padding: '14px 16px', color: 'var(--ink-3)', fontSize: 11, fontStyle: 'italic' }}>
        Coming soon…
      </div>
    </div>
  )
}
