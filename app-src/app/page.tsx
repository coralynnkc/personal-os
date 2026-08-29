import HabitTracker from '@/components/HabitTracker'
import TodayTasks from '@/components/TodayTasks'
import Calendar from '@/components/Calendar'

export default function Home() {
  return (
    <div style={{ padding: '16px 20px', width: '100%' }}>
      {/* Three columns on wide screens; the tracker gets the widest share so
          the month grid's 31 day-columns stay legible. Stacks below lg. */}
      <div className="grid gap-3 items-start grid-cols-1 lg:grid-cols-[minmax(260px,1fr)_minmax(260px,1fr)_minmax(560px,1.8fr)]">
        <TodayTasks />
        <Calendar />
        <HabitTracker />
      </div>
    </div>
  )
}
