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
 *
 * Dimensions (min/max resolution) are intentionally NOT enforced — the
 * camera roll on a low-end phone or a screenshot crop should both be
 * allowed. Avatars are rendered at fixed CSS sizes so a small upload
 * just renders crisply at that size; a huge upload is rate-capped by
 * the byte limit above.
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

    // 3. All good — upload. Resolution is intentionally NOT validated;
    //    avatars render at fixed CSS sizes so any usable image works.
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

// Re-export the rule constants so the rest of the app + mobile docs can
// reference exact values.
export const PROFILE_IMAGE_RULES = {
  acceptedTypes: ACCEPTED_TYPES,
  maxBytes:      MAX_BYTES,
} as const
