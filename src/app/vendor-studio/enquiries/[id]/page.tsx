'use client'
import React, { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useLiveEnquiry } from '@/hooks/useVendorStudio'
import { Button, StatusBadge, PageLoader } from '@/components/ui'
import { formatRelative } from '@/lib/utils'
import { ChevronLeft, CheckCircle, XCircle, FileText, Phone, MapPin, Calendar, Home, Ruler } from 'lucide-react'
import toast from 'react-hot-toast'

export default function VendorEnquiryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: enquiry, loading } = useLiveEnquiry(id)
  const [localStatus, setLocalStatus] = useState<string>(enquiry?.status || 'NEW')

  // Sync localStatus when the enquiry first loads (live or fallback).
  React.useEffect(() => { if (enquiry?.status) setLocalStatus(enquiry.status) }, [enquiry?.status])

  if (loading)   return <PageLoader />
  if (!enquiry)  return <div className="text-center py-20 text-gray-500">Enquiry not found</div>

  const accept = () => { setLocalStatus('ACCEPTED'); toast.success('Enquiry accepted — customer notified') }
  const reject = () => { setLocalStatus('REJECTED'); toast.success('Enquiry rejected') }

  return (
    <div className="space-y-5 pb-10">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-500 hover:text-navy transition">
        <ChevronLeft className="w-4 h-4" /> Back to Enquiries
      </button>

      {/* Header */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-navy">{enquiry.customer_name}</h1>
            <p className="text-sm text-gray-500">{enquiry.service_title} · {enquiry.category_name}</p>
            <p className="text-xs text-gray-400 mt-1">{formatRelative(enquiry.created_at)}</p>
          </div>
          <StatusBadge status={localStatus} />
        </div>
      </div>

      {/* Customer + scope */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-3">
        <h2 className="text-base font-bold text-navy">Customer Request</h2>
        <DetailRow icon={Phone}    label="Contact"       value={`+91 ${enquiry.customer_mobile}`} />
        <DetailRow icon={MapPin}   label="Location"      value={enquiry.location} />
        <DetailRow icon={Home}     label="Property Type" value={enquiry.property_type} />
        <DetailRow icon={Ruler}    label="Scope"         value={enquiry.scope} />
        <DetailRow icon={Calendar} label="Timeline"      value={enquiry.timeline} />
        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Description</p>
          <p className="text-sm text-navy leading-relaxed">{enquiry.description}</p>
        </div>
      </div>

      {/* Actions */}
      {localStatus === 'NEW' && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-3">
          <h2 className="text-base font-bold text-navy">Next Step</h2>
          <div className="flex gap-3">
            <Button full onClick={accept}>
              <CheckCircle className="w-4 h-4" /> Accept Enquiry
            </Button>
            <Button variant="outline" onClick={reject}>
              <XCircle className="w-4 h-4" /> Reject
            </Button>
          </div>
        </div>
      )}

      {localStatus === 'ACCEPTED' && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <Button full onClick={() => router.push(`/vendor-studio/enquiries/${id}/quote`)}>
            <FileText className="w-4 h-4" /> Create &amp; Send Quote
          </Button>
        </div>
      )}

      {localStatus === 'QUOTED' && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 text-center">
          <p className="text-sm text-gray-500">Quote sent — waiting for customer to accept or reject.</p>
        </div>
      )}
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
