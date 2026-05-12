'use client'
import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { customerApi } from '@/lib/api/client'
import {
  PageLoader, EmptyState, RatingStars, Button, Modal, Textarea, FileUpload, Amount
} from '@/components/ui'
import { formatCurrency } from '@/lib/utils'
import { MapPin, Phone, Star, Shield, ChevronLeft, Send, Image as ImgIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import { useUserAuth } from '@/stores/auth'

export default function VendorProfilePage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()
  const { token } = useUserAuth()
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => { setHydrated(true) }, [])

  const [vendor,   setVendor]   = useState<any>(null)
  const [services, setServices] = useState<any[]>([])
  const [reviews,  setReviews]  = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [enquiryOpen, setEnquiryOpen] = useState(false)
  const [selectedService, setSelectedService] = useState<any>(null)
  const [enquiryForm, setEnquiryForm] = useState({ description: '', location: '', images: [] as File[] })
  const [submitting, setSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState<'services'|'portfolio'|'reviews'>('services')

  useEffect(() => {
    Promise.all([
      customerApi.getVendorInfo(Number(id)),
      customerApi.listReviews(Number(id)),
    ]).then(([vr, rr]) => {
      const v = vr.data?.data || vr.data?.result || {}
      setVendor(v)
      setServices(v.services || [])
      const rev = rr.data?.data || rr.data?.result || []
      setReviews(Array.isArray(rev) ? rev : [])
    }).finally(() => setLoading(false))
  }, [id])

  const openEnquiry = (service?: any) => {
    if (!hydrated) return
    if (!token) { router.replace('/customer/login'); return }
    setSelectedService(service || null)
    setEnquiryOpen(true)
  }

  const submitEnquiry = async () => {
    if (!enquiryForm.description.trim()) { toast.error('Describe what you need'); return }
    setSubmitting(true)
    try {
      let imageUrls: string[] = []
      if (enquiryForm.images.length > 0) {
        const fd = new FormData()
        enquiryForm.images.forEach(f => fd.append('files', f))
        const ur = await customerApi.uploadFiles(fd)
        imageUrls = ur.data?.data || ur.data?.files || []
      }
      await customerApi.sendEnquiry({
        vendor_id:   Number(id),
        service_id:  selectedService?.id || selectedService?.service_id || '',
        description: enquiryForm.description,
        location:    enquiryForm.location,
        images:      imageUrls,
      })
      toast.success('Enquiry sent! You\'ll hear back soon.')
      setEnquiryOpen(false)
      setEnquiryForm({ description: '', location: '', images: [] })
      router.push('/customer/enquiries')
    } catch {
      toast.error('Failed to send enquiry')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <PageLoader />
  if (!vendor) return <EmptyState icon={Shield} title="Vendor not found" />

  const avgRating = reviews.length ? reviews.reduce((a, r) => a + (r.rating || 0), 0) / reviews.length : 0
  const portfolio = vendor.portfolio || []

  return (
    <div className="animate-fade-in space-y-5 pb-24">
      {/* Back */}
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-navy transition">
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      {/* Hero */}
      <div className="card">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-2xl bg-navy-50 overflow-hidden shrink-0 flex items-center justify-center">
            {vendor.logo || vendor.profile_image ? (
              <img src={vendor.logo || vendor.profile_image} alt={vendor.company_name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-bold text-navy">
                {(vendor.company_name || vendor.name || 'V')[0]}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="heading-md truncate">{vendor.company_name || vendor.name}</h1>
            <p className="text-sm text-[var(--text-secondary)] flex items-center gap-1 mt-0.5">
              <MapPin className="w-3.5 h-3.5" /> {vendor.city || 'Location not set'}
            </p>
            {avgRating > 0 && (
              <div className="flex items-center gap-2 mt-1">
                <RatingStars value={avgRating} />
                <span className="text-xs text-[var(--text-muted)]">({reviews.length} reviews)</span>
              </div>
            )}
          </div>
          {vendor.kyc_status === 'verified' && (
            <div className="flex items-center gap-1 badge badge-success shrink-0">
              <Shield className="w-3 h-3" /> Verified
            </div>
          )}
        </div>

        {vendor.description && (
          <p className="text-sm text-[var(--text-secondary)] mt-4 leading-relaxed">{vendor.description}</p>
        )}

        <Button full className="mt-4" onClick={() => openEnquiry()}>
          <Send className="w-4 h-4" /> Send Enquiry
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-white rounded-2xl p-1 border border-[var(--border)]">
        {(['services','portfolio','reviews'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all capitalize ${
              activeTab === t ? 'bg-navy text-white' : 'text-[var(--text-secondary)] hover:text-navy'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Services tab */}
      {activeTab === 'services' && (
        <div className="space-y-3">
          {services.length === 0 ? (
            <EmptyState icon={Shield} title="No services listed yet" />
          ) : services.map((s: any) => (
            <div key={s.id || s.service_id} className="card flex items-center gap-4">
              <div className="w-14 h-14 bg-navy-50 rounded-xl overflow-hidden shrink-0">
                {s.images?.[0] ? (
                  <img src={s.images[0]} className="w-full h-full object-cover" alt={s.title} />
                ) : <div className="w-full h-full flex items-center justify-center text-2xl">🔧</div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-navy text-sm">{s.title || s.service_name}</p>
                {s.price && (
                  <p className="text-xs text-orange font-semibold mt-0.5">
                    {formatCurrency(s.price)}
                    {s.price_type && s.price_type !== 'fixed' && ` / ${s.price_type.replace('per_','').replace('_',' ')}`}
                  </p>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={() => openEnquiry(s)}>Enquire</Button>
            </div>
          ))}
        </div>
      )}

      {/* Portfolio tab */}
      {activeTab === 'portfolio' && (
        portfolio.length === 0 ? (
          <EmptyState icon={ImgIcon} title="No portfolio items" />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {portfolio.map((p: any, i: number) => (
              <div key={i} className="aspect-square rounded-2xl overflow-hidden bg-gray-100">
                {p.images?.[0] ? (
                  <img src={p.images[0]} className="w-full h-full object-cover" alt={p.title} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl">🏗️</div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* Reviews tab */}
      {activeTab === 'reviews' && (
        reviews.length === 0 ? (
          <EmptyState icon={Star} title="No reviews yet" />
        ) : (
          <div className="space-y-3">
            {reviews.map((r: any) => (
              <div key={r.id} className="card">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                    <span className="text-orange-600 font-bold text-sm">{(r.customer_name || 'C')[0]}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-navy">{r.customer_name || 'Customer'}</p>
                    <RatingStars value={r.rating} />
                  </div>
                </div>
                {r.comment && <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{r.comment}</p>}
              </div>
            ))}
          </div>
        )
      )}

      {/* Enquiry Modal */}
      <Modal open={enquiryOpen} onClose={() => setEnquiryOpen(false)} title="Send Enquiry">
        <div className="space-y-4">
          {selectedService && (
            <div className="bg-navy-50 rounded-xl p-3 text-sm font-semibold text-navy">
              Service: {selectedService.title || selectedService.service_name}
            </div>
          )}
          <Textarea
            label="Describe what you need"
            placeholder="E.g. I need a carpenter for kitchen cabinet repair, approximately 3 cabinets..."
            rows={4}
            value={enquiryForm.description}
            onChange={e => setEnquiryForm(f => ({ ...f, description: e.target.value }))}
          />
          <input className="input" placeholder="Your location / address (optional)"
            value={enquiryForm.location}
            onChange={e => setEnquiryForm(f => ({ ...f, location: e.target.value }))} />
          <FileUpload
            label="Attach photos (optional)"
            multiple
            onChange={files => setEnquiryForm(f => ({ ...f, images: Array.from(files) }))}
          />
          <Button full loading={submitting} onClick={submitEnquiry}>
            <Send className="w-4 h-4" /> Send Enquiry
          </Button>
        </div>
      </Modal>
    </div>
  )
}
