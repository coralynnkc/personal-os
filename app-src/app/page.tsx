import HabitTracker from '@/components/HabitTracker'
import TodayTasks from '@/components/TodayTasks'
import Calendar from '@/components/Calendar'

export default function Home() {
  return (
    <div style={{ padding: '16px 20px', width: '100%' }}>
      {/*
        Three columns need 1124px to hold their minimums (260 + 260 + 560 plus
        gaps and padding), but this used to switch at `lg` — 1024px — so between
        those two widths the third column pushed the page sideways.

        Now there is a real tablet state: one column, then two at `lg`, then
        three only at `xl` where the tracker's 560px actually fits. Every track
        is `minmax(0, …)` rather than `minmax(<px>, …)` — a grid item defaults
        to `min-width: auto` and refuses to shrink below its content, which is
        what turns one long task title into a horizontal scrollbar on the body.
      */}
      <div className="grid gap-3 items-start grid-cols-1 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.8fr)]">
        <div className="min-w-0"><TodayTasks /></div>
        <div className="min-w-0"><Calendar /></div>
        <div className="lg:col-span-2 xl:col-span-1 min-w-0">
          <HabitTracker />
        </div>
      </div>
    </div>
  )
}
