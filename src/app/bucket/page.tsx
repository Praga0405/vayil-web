'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PublicHeader from '@/components/shared/PublicHeader'
import { Button, EmptyState } from '@/components/ui'
import { bucketStore, type BucketItem } from '@/lib/mockData'
import { formatCurrency } from '@/lib/utils'
import { ShoppingBag, X, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'

export default function BucketPage() {
  const router = useRouter()
  const [items, setItems] = useState<BucketItem[]>([])

  useEffect(() => {
    const sync = () => setItems(bucketStore.get())
    sync()
    window.addEventListener('vayil:bucket-change', sync)
    return () => window.removeEventListener('vayil:bucket-change', sync)
  }, [])

  const remove = (it: BucketItem) => bucketStore.remove(it.service_id, it.vendor_id)
  const clear  = () => { bucketStore.clear(); toast.success('Bucket cleared') }

  const grouped = items.reduce<Record<number, BucketItem[]>>((acc, it) => {
    (acc[it.vendor_id] ||= []).push(it); return acc
  }, {})

  const submitAll = () => {
    if (items.length === 0) return
    // For each vendor group, route to their profile pre-opening enquiry modal.
    // Lightweight v1: send to first vendor.
    const firstVendor = Object.keys(grouped)[0]
    router.push(`/vendors/${firstVendor}?action=enquire`)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PublicHeader />
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-navy">My Bucket</h1>
            <p className="text-sm text-gray-500">{items.length} service{items.length !== 1 ? 's' : ''} selected</p>
          </div>
          {items.length > 0 && (
            <button onClick={clear} className="text-sm text-red-500 font-semibold hover:underline">Clear all</button>
          )}
        </div>

        {items.length === 0 ? (
          <EmptyState icon={ShoppingBag} title="Your bucket is empty"
            description="Browse services and add them to your bucket to send a single enquiry."
            action={<Link href="/search" className="bg-orange text-white px-4 py-2 rounded-xl text-sm font-semibold">Browse Services</Link>} />
        ) : (
          <>
            {Object.entries(grouped).map(([vendorId, vItems]) => (
              <div key={vendorId} className="bg-white border border-gray-100 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-navy">{vItems[0].vendor_name}</p>
                  <Link href={`/vendors/${vendorId}`} className="text-xs text-orange font-semibold flex items-center gap-1">
                    View vendor <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
                {vItems.map(it => (
                  <div key={`${it.vendor_id}-${it.service_id}`} className="flex items-center gap-3 py-2 border-t border-gray-100">
                    <div className="w-14 h-14 rounded-xl bg-gray-100 overflow-hidden shrink-0">
                      {it.image && <img src={it.image} alt={it.service_title} className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-navy truncate">{it.service_title}</p>
                      <p className="text-xs text-gray-500">{it.category}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-navy">{formatCurrency(it.starting_price)}</p>
                      <p className="text-[10px] text-gray-400">Starting</p>
                    </div>
                    <button onClick={() => remove(it)} className="text-gray-400 hover:text-red-500 transition">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ))}

            <div className="bg-white border border-gray-100 rounded-2xl p-5 sticky bottom-4">
              <Button full onClick={submitAll}>
                Send Enquiry to {Object.keys(grouped).length} vendor{Object.keys(grouped).length !== 1 ? 's' : ''}
              </Button>
              <p className="text-center text-xs text-gray-400 mt-2">Each vendor will receive a separate enquiry with the services you selected for them.</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
