'use client'
import React, { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useLiveEnquiry } from '@/hooks/useVendorStudio'
import { vendorApi } from '@/lib/api/client'
import { demoOrLive } from '@/lib/demoMode'
import { Button, StatusBadge, PageLoader } from '@/components/ui'
import { formatRelative } from '@/lib/utils'
import { ChevronLeft, CheckCircle, XCircle, FileText, Phone, MapPin, Calendar, Home, Ruler } from 'lucide-react'
import toast from 'react-hot-toast'

export default function VendorEnquiryDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const router = useRouter()
  const { data: enquiry, loading, reload } = useLiveEnquiry(id)
  // All hooks declared up-front — never after a conditional return.
  const [localStatus, setLocalStatus] = useState<string>(enquiry?.status || 'NEW')
  const [pending, setPending] = useState<'accept' | 'reject' | null>(null)

  // Sync localStatus when the enquiry first loads (live or fallback).
  React.useEffect(() => { if (enquiry?.status) setLocalStatus(enquiry.status) }, [enquiry?.status])

  if (loading)   return <PageLoader />
  if (!enquiry)  return <div className="text-center py-20 text-gray-500">Enquiry not found</div>

  const accept = async () => {
    if (!id) return
    setPending('accept')
    try {
      await demoOrLive(() => vendorApi.acceptEnquiry(id))
      setLocalStatus('ACCEPTED')
      reload()
      toast.success('Enquiry accepted — customer notified')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.response?.data?.message || 'Failed to accept enquiry')
    } finally { setPending(null) }
  }
  const reject = async () => {
    if (!id) return
    setPending('reject')
    try {
      await demoOrLive(() => vendorApi.rejectEnquiry(id))
      setLocalStatus('REJECTED')
      reload()
      toast.success('Enquiry rejected')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.response?.data?.message || 'Failed to reject enquiry')
    } finally { setPending(null) }
  }

  // Normalise status to lower-case for badge; "unknown" sneaks in when
  // upstream returns null / undefined. Default to NEW until the live data
  // returns something explicit.
  const displayStatus = (localStatus || 'new').toString().toUpperCase()
  const contactValue  = enquiry.customer_mobile
    ? `+91 ${enquiry.customer_mobile}`
    : 'Revealed after you accept'

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-500 hover:text-navy transition">
        <ChevronLeft className="w-4 h-4" /> Back to Enquiries
      </button>

      {/* Header */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col xs:flex-row xs:items-start xs:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-navy">{enquiry.customer_name}</h1>
            <p className="text-sm text-gray-500">{enquiry.service_title} · {enquiry.category_name}</p>
            <p className="text-xs text-gray-400 mt-1">{formatRelative(enquiry.created_at)}</p>
          </div>
          <StatusBadge status={displayStatus} />
        </div>
      </div>

      {enquiry.had_rejected_quote && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-red-700">Previous quote rejected</p>
          <p className="text-sm text-red-800 mt-1">
            {enquiry.rejection_reason || 'The customer rejected the previous quote. You can send a revised quote while the enquiry remains open.'}
          </p>
        </div>
      )}

      {/* Two-column workspace: details on the left, action panel on the right. */}
      <div className="grid lg:grid-cols-[1fr,320px] gap-6 items-start">
        <div className="bg-white border border-gray-100 rounded-2xl p-6 space-y-4">
          <h2 className="text-base font-bold text-navy">Customer Request</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <DetailRow icon={Phone}    label="Contact"       value={contactValue} />
            <DetailRow icon={MapPin}   label="Location"      value={enquiry.location || '—'} />
            <DetailRow icon={Home}     label="Property Type" value={enquiry.property_type || '—'} />
            <DetailRow icon={Ruler}    label="Scope"         value={enquiry.scope || '—'} />
            <DetailRow icon={Calendar} label="Timeline"      value={enquiry.timeline || '—'} />
          </div>
          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Description</p>
            <p className="text-sm text-navy leading-relaxed">{enquiry.description}</p>
          </div>
        </div>

        {/* Side action panel — sticky so it stays visible while scrolling long descriptions. */}
        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-3 lg:sticky lg:top-24">
          <h2 className="text-base font-bold text-navy">Next Step</h2>
          {enquiry.order_id ? (
            <>
              <Button full onClick={() => router.push(`/vendor-studio/jobs/${enquiry.order_id}`)}>
                <FileText className="w-4 h-4" /> View Project
              </Button>
              <p className="text-xs text-gray-500 leading-relaxed pt-1">
                This enquiry has been paid and is now managed from the project workflow.
              </p>
            </>
          ) : displayStatus === 'NEW' ? (
            <>
              <Button full onClick={accept} loading={pending === 'accept'}>
                <CheckCircle className="w-4 h-4" /> Accept Enquiry
              </Button>
              <Button variant="outline" full onClick={reject} loading={pending === 'reject'}>
                <XCircle className="w-4 h-4" /> Reject
              </Button>
              <p className="text-xs text-gray-500 leading-relaxed pt-1">
                Accepting reveals the customer's phone and unlocks quoting.
              </p>
            </>
          ) : displayStatus === 'ACCEPTED' ? (
            <Button full onClick={() => router.push(`/vendor-studio/enquiries/${id}/quote`)}>
              <FileText className="w-4 h-4" /> Create &amp; Send Quote
            </Button>
          ) : displayStatus === 'QUOTED' ? (
            <>
              <Button full onClick={() => router.push(`/vendor-studio/enquiries/${id}/quote`)}>
                <FileText className="w-4 h-4" /> Edit Quote
              </Button>
              <p className="text-xs text-gray-500 leading-relaxed pt-1">
                You can edit the quote until the customer accepts it.
              </p>
            </>
          ) : displayStatus === 'AWAITING_PAYMENT' ? (
            <p className="text-sm text-gray-500 text-center py-2">
              Quote accepted. Waiting for the customer payment.
            </p>
          ) : displayStatus === 'REJECTED' && enquiry.re_quote_available ? (
            <>
              <Button full onClick={() => router.push(`/vendor-studio/enquiries/${id}/quote`)}>
                <FileText className="w-4 h-4" /> Send Revised Quote
              </Button>
              <p className="text-xs text-gray-500 leading-relaxed pt-1">
                The previous quote remains visible in history. This creates a new quote version.
              </p>
            </>
          ) : (displayStatus === 'REJECTED' || displayStatus === 'CANCELLED') ? (
            <p className="text-sm text-gray-500 text-center py-2">
              This enquiry was {displayStatus.toLowerCase()}.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function DetailRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-orange shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</p>
        <p className="text-sm text-navy">{value}</p>
      </div>
    </div>
  )
}
