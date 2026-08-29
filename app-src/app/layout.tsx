import type { Metadata } from 'next'
import { Figtree, DM_Mono } from 'next/font/google'
import Rail from '@/components/Rail'
import PomodoroProvider from '@/components/pomodoro/PomodoroProvider'
import RefreshOnFocus from '@/components/RefreshOnFocus'
import './globals.css'

// Figtree for everything you read, DM Mono only for things that align in a
// column. Both are rounder and lower-contrast than the pair they replace —
// the app should feel approachable rather than like a terminal.
const figtree = Figtree({ variable: '--font-figtree', subsets: ['latin'], display: 'swap' })
const dmMono = DM_Mono({
  variable: '--font-dm-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Personal OS',
  description: 'Personal dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${figtree.variable} ${dmMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {/* The pomodoro lives above the router outlet so a running session
            survives navigation between routes. */}
        <PomodoroProvider>
          <Rail />
          <RefreshOnFocus />
          <main style={{ flex: 1 }}>
            {children}
          </main>
        </PomodoroProvider>
      </body>
    </html>
  )
}
