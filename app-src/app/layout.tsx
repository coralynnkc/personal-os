import type { Metadata } from 'next'
import { Italianno, Jost, DM_Mono } from 'next/font/google'
import Rail from '@/components/Rail'
import Masthead from '@/components/Masthead'
import PomodoroProvider from '@/components/pomodoro/PomodoroProvider'
import RefreshOnFocus from '@/components/RefreshOnFocus'
import KeyboardProvider from '@/lib/useKeyboard'
import './globals.css'

// Three families, three jobs: Italianno is a highlight (the masthead date and
// the region titles, nothing else), Jost is everything read as language, and
// DM Mono is everything read as a number.
const italianno = Italianno({ variable: '--font-italianno', weight: '400', subsets: ['latin'] })
const jost = Jost({ variable: '--font-jost', weight: ['200', '300', '400', '500'], subsets: ['latin'] })
const dmMono = DM_Mono({ variable: '--font-dm-mono', weight: ['300', '400', '500'], subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Personal OS',
  description: 'Personal dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${italianno.variable} ${jost.variable} ${dmMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {/* The pomodoro lives above the router outlet so a running session
            survives navigation between routes. */}
        <PomodoroProvider>
          {/* Same reason as the pomodoro: one listener, above the outlet, so
              the registry and the sheet survive navigation. */}
          <KeyboardProvider>
            <Rail />
            <RefreshOnFocus />
            <main style={{ flex: 1, minWidth: 0 }}>
              <Masthead />
              {children}
            </main>
          </KeyboardProvider>
        </PomodoroProvider>
      </body>
    </html>
  )
}
