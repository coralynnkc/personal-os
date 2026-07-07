import HabitTracker from '@/components/HabitTracker'
import TodayTasks from '@/components/TodayTasks'
import Calendar from '@/components/Calendar'
import JobSearchWidget from '@/components/JobSearchWidget'

export default function Home() {
  return (
    <div style={{ padding: '16px 20px', width: '100%' }}>
      <div className="grid gap-3 items-start grid-cols-1 md:grid-cols-[260px_280px_1fr]">
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
