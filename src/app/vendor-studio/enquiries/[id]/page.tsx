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
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: enquiry, loading } = useLiveEnquiry(id)
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
      toast.success('Enquiry accepted — customer notified')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to accept enquiry')
    } finally { setPending(null) }
  }
  const reject = async () => {
    if (!id) return
    setPending('reject')
    try {
      await demoOrLive(() => vendorApi.rejectEnquiry(id))
      setLocalStatus('REJECTED')
      toast.success('Enquiry rejected')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to reject enquiry')
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
      <div className="bg-white border border-gray-100 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-navy">{enquiry.customer_name}</h1>
            <p className="text-sm text-gray-500">{enquiry.service_title} · {enquiry.category_name}</p>
            <p className="text-xs text-gray-400 mt-1">{formatRelative(enquiry.created_at)}</p>
          </div>
          <StatusBadge status={displayStatus} />
        </div>
      </div>

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
          {displayStatus === 'NEW' && (
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
          )}
          {displayStatus === 'ACCEPTED' && (
            <Button full onClick={() => router.push(`/vendor-studio/enquiries/${id}/quote`)}>
              <FileText className="w-4 h-4" /> Create &amp; Send Quote
            </Button>
          )}
          {displayStatus === 'QUOTED' && (
            <p className="text-sm text-gray-500 text-center py-2">
              Quote sent — waiting for the customer to accept or reject.
            </p>
          )}
          {(displayStatus === 'REJECTED' || displayStatus === 'CANCELLED') && (
            <p className="text-sm text-gray-500 text-center py-2">
              This enquiry was {displayStatus.toLowerCase()}.
            </p>
          )}
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
