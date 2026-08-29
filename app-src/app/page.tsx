import HabitTracker from '@/components/HabitTracker'
import TodayTasks from '@/components/TodayTasks'
import Calendar from '@/components/Calendar'

export default function Home() {
  return (
    <div style={{ padding: '16px 20px', width: '100%' }}>
      {/* Two columns since the job-search card moved to its own /jobs tab. */}
      <div className="grid gap-3 items-start grid-cols-1 md:grid-cols-[300px_1fr]">
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
