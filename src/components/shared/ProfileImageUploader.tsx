/**
 * ProfileImageUploader — v4.5.28
 *
 * The camera-overlay button you see on customer / vendor profile cards.
 * Clicking it opens the native file picker, validates the selection
 * (type + size + minimum resolution), uploads via /upload_files, then
 * calls onUploaded(url) with the resulting S3 URL so the caller can
 * persist it on the profile.
 *
 * Validation rules — kept identical to what the mobile-team Flutter app
 * is expected to enforce (see docs/API_MOBILE_LEGACY.md → "Profile image
 * constraints" section). The backend's /upload_files multer limit
 * (15MB) catches uploads that bypass the client; this component's job
 * is to give the user a specific, actionable error BEFORE we burn a
 * round-trip.
 *
 *   accepted types : image/jpeg, image/png, image/webp
 *   max file size  : 5 MB
 *   min dimensions : 256 × 256 px   (no pixelated thumbnails)
 *   max dimensions : 4096 × 4096 px (no absurdly large originals)
 *
 * Usage:
 *   <ProfileImageUploader
 *     currentUrl={user?.profile_image}
 *     name={user?.name}
 *     uploadFn={customerApi.uploadFiles}
 *     onUploaded={(url) => savePatch({ profile_image: url })}
 *   />
 */
'use client'
import React, { useRef, useState } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Avatar } from '@/components/ui'
import { normalizeUploadedUrls } from '@/lib/api/client'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const MAX_BYTES      = 5 * 1024 * 1024
const MIN_DIMENSION  = 256
const MAX_DIMENSION  = 4096

type UploadFn = (formData: FormData) => Promise<{ data: any }>

export function ProfileImageUploader({
  currentUrl,
  name,
  size = 24,
  uploadFn,
  onUploaded,
  fieldName = 'file',
}: {
  currentUrl?: string | null
  name?: string
  size?: number
  uploadFn: UploadFn
  onUploaded: (url: string) => void | Promise<void>
  /** Multipart field name the backend reads. Defaults to "file"; legacy
   *  Flutter form-data uses "files". Most handlers accept any field via
   *  multer.any() so the default is safe. */
  fieldName?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  // Local override so the new avatar shows immediately on success without
  // waiting for the parent component to re-fetch the auth user.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const pickFile = () => {
    if (busy) return
    inputRef.current?.click()
  }

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Always reset the input value so picking the SAME file twice still
    // fires onChange. (Chromium dedupes by File object identity otherwise.)
    e.target.value = ''
    if (!file) return

    // 1. Type check
    if (!ACCEPTED_TYPES.includes(file.type as any)) {
      toast.error(`Unsupported image type. Use JPG, PNG, or WebP. (Got "${file.type || 'unknown'}".)`)
      return
    }

    // 2. Size check — strict 5 MB cap
    if (file.size > MAX_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1)
      toast.error(`Image is too large — ${mb} MB. Maximum is 5 MB.`)
      return
    }

    // 3. Resolution check — load into <Image> to read intrinsic dimensions.
    let dims: { width: number; height: number }
    try {
      dims = await readImageDimensions(file)
    } catch {
      toast.error('Could not read this image. The file may be corrupted.')
      return
    }
    if (dims.width < MIN_DIMENSION || dims.height < MIN_DIMENSION) {
      toast.error(
        `Image is too small — ${dims.width}×${dims.height}. Minimum is ${MIN_DIMENSION}×${MIN_DIMENSION} px.`,
      )
      return
    }
    if (dims.width > MAX_DIMENSION || dims.height > MAX_DIMENSION) {
      toast.error(
        `Image is too large — ${dims.width}×${dims.height}. Maximum is ${MAX_DIMENSION}×${MAX_DIMENSION} px.`,
      )
      return
    }

    // 4. All good — upload.
    setBusy(true)
    const t = toast.loading('Uploading profile photo…')
    try {
      const fd = new FormData()
      fd.append(fieldName, file)
      // Many legacy handlers read "files" too — append both so either
      // field-name convention works without a second backend tweak.
      if (fieldName !== 'files') fd.append('files', file)
      // `kind=profile` opts this upload into the stricter server-side
      // validation in backend/src/utils/imageValidation.ts. Without it
      // the same handler accepts arbitrary images (used by service-gallery
      // uploads which have looser rules). Mobile must send the same field.
      fd.append('kind', 'profile')

      const res = await uploadFn(fd)
      const urls = normalizeUploadedUrls(res.data)
      const url = urls[0]
      if (!url) throw new Error('Server returned no image URL')

      setPreviewUrl(url)
      await onUploaded(url)
      toast.success('Profile photo updated!', { id: t })
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Upload failed'
      toast.error(`Upload failed — ${msg}`, { id: t })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative">
      <Avatar name={name} src={previewUrl || currentUrl || undefined} size={size} />
      <button
        type="button"
        onClick={pickFile}
        disabled={busy}
        aria-label="Change profile photo"
        className="absolute bottom-1 right-1 w-8 h-8 rounded-full bg-orange ring-4 ring-white flex items-center justify-center hover:bg-orange-600 transition disabled:opacity-60"
      >
        {busy
          ? <Loader2 className="w-4 h-4 text-white animate-spin" />
          : <Camera   className="w-4 h-4 text-white" />}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        onChange={onFileChange}
        className="hidden"
      />
    </div>
  )
}

/** Promise wrapper around HTMLImageElement so we can read intrinsic
 *  width/height of the file the user just picked. */
function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      const dims = { width: img.naturalWidth, height: img.naturalHeight }
      URL.revokeObjectURL(url)
      resolve(dims)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('not an image'))
    }
    img.src = url
  })
}

// Re-export the rule constants so the rest of the app + mobile docs can
// reference exact values.
export const PROFILE_IMAGE_RULES = {
  acceptedTypes: ACCEPTED_TYPES,
  maxBytes:      MAX_BYTES,
  minDimension:  MIN_DIMENSION,
  maxDimension:  MAX_DIMENSION,
} as const
