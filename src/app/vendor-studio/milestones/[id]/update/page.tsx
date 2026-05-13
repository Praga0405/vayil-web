'use client'
/**
 * Vendor milestone update — POST /vendor/milestones/:id/updates
 *
 * Vendors hit this page from the job detail screen to post a progress
 * update with a comment and optional images. The customer sees these
 * on the corresponding project page.
 */
import React, { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button, Textarea } from '@/components/ui'
import { ChevronLeft, ImagePlus, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { vendorApi, normalizeUploadedUrls } from '@/lib/api/client'

export default function MilestoneUpdatePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [comment, setComment] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!id) return
    if (!comment.trim() && files.length === 0) {
      toast.error('Add a comment or at least one image')
      return
    }
    setSubmitting(true); setError(null)
    try {
      let image_urls: string[] = []
      if (files.length > 0) {
        const fd = new FormData()
        for (const f of files) fd.append('files', f)
        const upRes = await vendorApi.uploadFiles(fd)
        image_urls = normalizeUploadedUrls(upRes)
      }
      await vendorApi.postMilestoneUpdate(id, {
        comment: comment.trim() || undefined,
        image_urls: image_urls.length ? image_urls : undefined,
      })
      toast.success('Update posted — customer will be notified')
      router.back()
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to post update')
    } finally { setSubmitting(false) }
  }

  return (
    <div className="space-y-5 pb-10 max-w-md">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-500 hover:text-navy transition">
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h1 className="text-xl font-bold text-navy">Post milestone update</h1>
        <p className="text-sm text-gray-500 mt-1">Share progress with photos and a short comment so the customer sees what's happening.</p>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
        <Textarea label="Comment" rows={3}
          value={comment} onChange={e => setComment(e.target.value)}
          placeholder="e.g. Tiling 60% done, kitchen wall almost finished" />

        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Photos</p>
          <label className="flex items-center gap-2 border-2 border-dashed border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-500 cursor-pointer hover:border-orange/40 hover:text-navy transition">
            <ImagePlus className="w-4 h-4" />
            {files.length === 0 ? 'Tap to add photos' : `${files.length} file(s) selected`}
            <input type="file" multiple accept="image/*"
              onChange={e => setFiles(Array.from(e.target.files || []))}
              className="hidden" />
          </label>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">{error}</div>
        )}

        <Button full loading={submitting} onClick={submit}>
          <Send className="w-4 h-4" /> {error ? 'Retry' : 'Post update'}
        </Button>
      </div>
    </div>
  )
}
