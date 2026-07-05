'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { toDateKey, USER_TZ } from '@/lib/dateKey'

const CAL_KEY = 'job_search_cal_v1'
const IDS_KEY = 'job_search_ids_v1'

const NEETCODE: { from: string; pattern: string }[] = [
  { from: '2026-06-01', pattern: 'Trees — BFS/DFS' },
  { from: '2026-06-08', pattern: 'Graphs — BFS/DFS' },
  { from: '2026-06-15', pattern: 'Dynamic Programming (1D)' },
  { from: '2026-06-22', pattern: 'DP (2D) + Heaps' },
  { from: '2026-06-29', pattern: 'Tries + Union-Find' },
  { from: '2026-07-06', pattern: 'Backtracking + Greedy' },
  { from: '2026-07-13', pattern: 'Bit Manipulation + Math' },
  { from: '2026-07-20', pattern: 'LC medium review (mixed)' },
  { from: '2026-07-27', pattern: 'LC medium blitz' },
  { from: '2026-08-03', pattern: 'LC hard exposure' },
  { from: '2026-08-10', pattern: 'LC hard (cont.)' },
  { from: '2026-08-17', pattern: 'LC hard (1/day)' },
]

const MILESTONES: Record<string, string> = {
  '2026-07-01': 'Wave 1 opens — apply to Intuit TODAY',
  '2026-07-08': 'Wave 1 — apply to Bloomberg SWE + BI',
  '2026-07-15': 'Wave 1 — apply to Amex, Capital One',
  '2026-07-22': 'Wave 1 — apply to Visa, Mastercard, Salesforce',
  '2026-08-01': 'Wave 2 opens — apply to Stripe TODAY',
  '2026-08-04': 'Wave 2 — apply to Plaid, Brex',
  '2026-08-08': 'Wave 2 — apply to Figma, Affirm, Flatiron Health',
  '2026-08-15': 'Internship ends — Phase 3 begins',
  '2026-09-01': 'Wave 3 opens — apply to Jane Street TODAY',
  '2026-09-08': 'Wave 3 — apply to Citadel, Two Sigma, D.E. Shaw',
}

type Task = { id: string; text: string; tag: string; points: number }

function toDateStr(d: Date) {
  return toDateKey(d, USER_TZ)
}

function getPhase(d: Date): number {
  const s = toDateStr(d)
  if (s < '2026-05-29') return 1
  if (s < '2026-08-15') return 2
  if (s < '2026-10-01') return 3
  return 4
}

function getLCPattern(d: Date): string {
  const s = toDateStr(d)
  let pattern = 'LC problem'
  for (const n of NEETCODE) {
    if (s >= n.from) pattern = n.pattern
    else break
  }
  return pattern
}

function generateDayTasks(d: Date): Task[] {
  const s = toDateStr(d)
  const dow = new Date(s + 'T12:00:00').getDay()
  if (dow === 0) return []
  const phase = getPhase(d)
  const tasks: Task[] = []

  tasks.push({ id: 'lc-new',    text: `LeetCode: 1 new problem — ${getLCPattern(d)}`, tag: 'lc', points: 3 })
  tasks.push({ id: 'lc-review', text: 'LeetCode: re-solve 1 old problem cold',        tag: 'lc', points: 2 })

  const rhythms: Record<number, Task> = {
    1: { id: 'rhythm', text: 'Log any Wave portals opening this week',            tag: 'apps',    points: 2 },
    2: { id: 'rhythm', text: 'STAR stories: write or refine one story',           tag: 'stories', points: 2 },
    3: { id: 'rhythm', text: phase >= 3 ? 'System design: study one concept (20 min)' : 'System design: preview — start Aug 15', tag: 'design', points: 3 },
    4: { id: 'rhythm', text: 'Company research: read 1 engineering blog',         tag: 'research', points: 1 },
    5: { id: 'rhythm', text: 'Pipeline admin: update tracking spreadsheet',       tag: 'admin',   points: 1 },
    6: { id: 'rhythm', text: phase >= 3 ? 'System design: full design session (60–90 min)' : 'Rest or extra LC session', tag: phase >= 3 ? 'design' : 'rest', points: phase >= 3 ? 3 : 1 },
  }
  if (rhythms[dow]) tasks.push(rhythms[dow])
  if (MILESTONES[s]) tasks.push({ id: 'milestone', text: MILESTONES[s], tag: 'milestone', points: 5 })

  return tasks
}

const TAG_STYLE: Record<string, { bg: string; color: string }> = {
  lc:        { bg: 'oklch(0.72 0.18 260 / 0.15)', color: 'oklch(0.82 0.18 260)' },
  apps:      { bg: 'oklch(0.78 0.17 45  / 0.15)', color: 'oklch(0.82 0.17 55)'  },
  stories:   { bg: 'oklch(0.72 0.18 300 / 0.15)', color: 'oklch(0.80 0.16 300)' },
  design:    { bg: 'oklch(0.72 0.16 180 / 0.15)', color: 'oklch(0.80 0.16 180)' },
  research:  { bg: 'oklch(0.78 0.17 80  / 0.15)', color: 'oklch(0.82 0.16 85)'  },
  admin:     { bg: 'oklch(0.25 0.01 250 / 0.5)',  color: 'var(--ink-4)'         },
  milestone: { bg: 'oklch(0.70 0.16 142 / 0.15)', color: 'oklch(0.78 0.16 142)' },
  rest:      { bg: 'transparent',                  color: 'var(--ink-3)'         },
}

export default function JobSearchWidget() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [done, setDone] = useState<Record<string, boolean>>({})
  const [taskDbIds, setTaskDbIds] = useState<Record<string, string>>({})
  const [todayStr, setTodayStr] = useState('')

  useEffect(() => {
    const today = new Date()
    const ds = toDateStr(today)
    setTodayStr(ds)
    setTasks(generateDayTasks(today))
    try {
      const state = JSON.parse(localStorage.getItem(CAL_KEY) ?? '{}')
      setDone(state[ds] ?? {})
    } catch {
      setDone({})
    }
    try {
      const ids = JSON.parse(localStorage.getItem(IDS_KEY) ?? '{}')
      setTaskDbIds(ids[ds] ?? {})
    } catch {}
  }, [])

  const toggle = async (task: Task) => {
    const completing = !done[task.id]
    const newDone = { ...done, [task.id]: completing }
    setDone(newDone)
    try {
      const state = JSON.parse(localStorage.getItem(CAL_KEY) ?? '{}')
      state[todayStr] = newDone
      localStorage.setItem(CAL_KEY, JSON.stringify(state))
    } catch {}

    const bc = new BroadcastChannel('pos-tasks')

    if (completing) {
      try {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: task.text,
            points: task.points,
            completed_at: new Date().toISOString(),
            tags: ['job-search'],
            urgency: 'today',
          }),
        }).then(r => r.json())
        if (res.id) {
          const newIds = { ...taskDbIds, [task.id]: res.id }
          setTaskDbIds(newIds)
          try {
            const ids = JSON.parse(localStorage.getItem(IDS_KEY) ?? '{}')
            ids[todayStr] = newIds
            localStorage.setItem(IDS_KEY, JSON.stringify(ids))
          } catch {}
        }
      } catch {}
    } else {
      const dbId = taskDbIds[task.id]
      if (dbId) {
        try {
          await fetch(`/api/tasks/${dbId}`, { method: 'DELETE' })
          const newIds = { ...taskDbIds }
          delete newIds[task.id]
          setTaskDbIds(newIds)
          try {
            const ids = JSON.parse(localStorage.getItem(IDS_KEY) ?? '{}')
            ids[todayStr] = newIds
            localStorage.setItem(IDS_KEY, JSON.stringify(ids))
          } catch {}
        } catch {}
      }
    }

    bc.postMessage({ type: 'task_completed' })
    bc.close()
  }

  const checkedCount = tasks.filter(t => done[t.id]).length
  const totalPoints = tasks.reduce((s, t) => s + t.points, 0)
  const earnedPoints = tasks.filter(t => done[t.id]).reduce((s, t) => s + t.points, 0)

  if (tasks.length === 0) return null

  return (
    <div style={{
      background: 'var(--glass)',
      border: '1px solid var(--glass-border)',
      borderRadius: 'var(--radius)',
      backdropFilter: 'blur(16px)',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px 10px', borderBottom: '1px solid var(--glass-border)',
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9,
          letterSpacing: '0.14em', color: 'var(--ink-4)', textTransform: 'uppercase',
        }}>
          Job Search · Today
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9,
            color: checkedCount === tasks.length ? 'var(--ok)' : 'var(--ink-4)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {checkedCount}/{tasks.length}
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9,
            color: earnedPoints === totalPoints ? 'var(--ok)' : 'oklch(0.78 0.16 142)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {earnedPoints}/{totalPoints} pts
          </span>
        </div>
      </div>

      <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {tasks.map(task => {
          const isDone = !!done[task.id]
          const colors = TAG_STYLE[task.tag] ?? TAG_STYLE.admin
          return (
            <div key={task.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <button
                onClick={() => toggle(task)}
                style={{
                  flexShrink: 0, width: 18, height: 18, marginTop: 6,
                  borderRadius: 4,
                  border: `1px solid ${isDone ? 'var(--ok)' : 'var(--ink-3)'}`,
                  background: isDone ? 'var(--ok)' : 'transparent',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.12s, border-color 0.12s',
                }}
              >
                {isDone && <Check size={11} strokeWidth={3} color="var(--ink-0)" />}
              </button>

              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 8px', borderRadius: 6,
                background: 'var(--ink-1)', border: '1px solid var(--glass-border)',
                opacity: isDone ? 0.45 : 1,
                transition: 'opacity 0.15s',
                minWidth: 0,
              }}>
                <span style={{
                  flex: 1, fontSize: 11,
                  lineHeight: 1.4,
                  textDecoration: isDone ? 'line-through' : 'none',
                  color: isDone ? 'var(--ink-3)' : 'var(--ink-6)',
                }}>
                  {task.text}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <span style={{
                    fontSize: 9, fontFamily: 'var(--font-mono)',
                    color: isDone ? 'var(--ok)' : 'var(--ink-3)',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {task.points}pt
                  </span>
                  <span style={{
                    fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    background: colors.bg, color: colors.color,
                    border: `1px solid ${colors.color}`,
                    borderRadius: 4, padding: '1px 5px',
                  }}>
                    {task.tag}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
