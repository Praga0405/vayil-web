'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUserAuth } from '@/stores/auth'

export function useRequireAuth(loginPath: string) {
  const router = useRouter()
  const { token } = useUserAuth()
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    // Wait one tick so Zustand persist can rehydrate from localStorage
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated && !token) {
      router.replace(loginPath)
    }
  }, [hydrated, token, loginPath, router])

  return { hydrated, token }
}
