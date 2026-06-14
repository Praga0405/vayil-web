'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LegacyVendorEnquiriesRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/vendor-studio/enquiries') }, [])
  return null
}
