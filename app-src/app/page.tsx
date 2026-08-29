import HabitTracker from '@/components/HabitTracker'
import TodayTasks from '@/components/TodayTasks'
import Calendar from '@/components/Calendar'

export default function Home() {
  return (
    <div style={{ padding: '16px 20px', width: '100%' }}>
      {/* Two columns since the job-search card moved to its own /jobs tab.
          The tracker is capped so it doesn't stretch across a wide screen, and
          the leftover width goes to the task column so titles aren't clipped. */}
      <div
        className="grid gap-3 items-start grid-cols-1 md:grid-cols-[minmax(320px,1fr)_minmax(0,600px)]"
        style={{ maxWidth: 1200 }}
      >
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TodayTasks />
          <Calendar />
        </div>

        {/* Right column — Habit Tracker */}
        <HabitTracker />
      </div>
    </div>
  )
}
