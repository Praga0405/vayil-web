'use client'
import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function Redirect() {
  const router = useRouter()
  const params = useSearchParams()
  useEffect(() => {
    const q   = params.get('q') || ''
    const cat = params.get('category') || ''
    const qs  = new URLSearchParams()
    if (q)   qs.set('q', q)
    if (cat) qs.set('category', cat)
    router.replace(`/search${qs.toString() ? `?${qs.toString()}` : ''}`)
  }, [params, router])
  return null
}

export default function LegacyCustomerMarketplaceRedirect() {
  return <Suspense fallback={null}><Redirect /></Suspense>
}
