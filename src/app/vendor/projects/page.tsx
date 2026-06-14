'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LegacyVendorProjectsRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/vendor-studio/jobs') }, [])
  return null
}
