// Types for `taskMatch.mjs`. The implementation is plain JS so that a node
// script can import the same matcher the app uses (see the file's header);
// this is the half TypeScript needs to keep checking the callers.

import type { MatchableTask, RowArm, WeekRow } from './weekDoc'

/** What `matchTask` needs of either side: a name, and the day it belongs to. */
export type Matchable = { title: string; date: string }

export type MatchOptions = {
  requireDate?: boolean
  threshold?: number
  minTokens?: number
}

/** Why a task did or didn't answer to a title — the diagnostic's raw material. */
export type Score = {
  want: string[]
  missing: string[]
  dated: boolean
  score: number
}

export function tokens(s: string): string[]
export function chosenArm(row: WeekRow, choice: string | undefined): RowArm | null
export function rowWhat(row: WeekRow, choice?: string): string
export function rowSkipped(row: WeekRow, choice?: string): boolean
export function rowTitle(row: WeekRow, choice?: string): string
export function scoreTask(target: Matchable, task: MatchableTask): Score
export function matchTask(
  target: Matchable, tasks: MatchableTask[], options?: MatchOptions,
): MatchableTask | null
export const ROW_MATCH: Required<MatchOptions>
export function rowTask(
  row: WeekRow, date: string | null, tasks: MatchableTask[], choice?: string,
): MatchableTask | null
