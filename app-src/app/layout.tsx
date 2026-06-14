import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import Rail from '@/components/Rail'
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
        <Rail />
        <main style={{ flex: 1 }}>
          {children}
        </main>
      </body>
    </html>
  )
}
