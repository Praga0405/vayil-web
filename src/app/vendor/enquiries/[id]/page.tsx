'use client'
import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function LegacyVendorEnquiryDetailRedirect() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  useEffect(() => { router.replace(`/vendor-studio/enquiries/${id}`) }, [id])
  return null
}
