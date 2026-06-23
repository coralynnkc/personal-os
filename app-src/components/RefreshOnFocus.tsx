'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function RefreshOnFocus() {
  const router = useRouter()
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') router.refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [router])
  return null
}
