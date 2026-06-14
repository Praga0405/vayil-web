'use client'
import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function LegacyVendorProjectDetailRedirect() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  useEffect(() => { router.replace(`/vendor-studio/jobs/${id}`) }, [id])
  return null
}
