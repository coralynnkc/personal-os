import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import Rail from '@/components/Rail'
import PomodoroProvider from '@/components/pomodoro/PomodoroProvider'
import RefreshOnFocus from '@/components/RefreshOnFocus'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Personal OS',
  description: 'Personal dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
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
