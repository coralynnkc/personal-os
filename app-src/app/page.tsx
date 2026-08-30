import HabitTracker from '@/components/HabitTracker'
import TodayTasks from '@/components/TodayTasks'
import Calendar from '@/components/Calendar'

export default function Home() {
  return (
    <div style={{ padding: 'var(--s5)', width: '100%' }}>
      {/* Three regions, three treatments — the log on the page ground, the
          calendar between two hairlines, habits as the one filled surface.

          The tracker needs real width: 31 day-columns plus the habit names
          come to ~560px, and three tracks plus their gutters only fit from
          1280px up. Between 1024 and 1280 the month view breaks out instead,
          taking a full-width row under the other two — which is the shape the
          grid wants anyway. `.region-*` swaps the vertical hairlines for
          horizontal ones at each step, and the grid keeps its own
          `overflow-x: auto`. */}
      <div className="grid gap-0 items-start grid-cols-1 lg:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_minmax(240px,0.95fr)_minmax(560px,1.6fr)]">
        <TodayTasks />
        <Calendar />
        <div className="lg:col-span-2 xl:col-span-1 min-w-0">
          <HabitTracker />
        </div>
      </div>
    </div>
  )
}
