/* v4.5.29 — /vendor/* consolidation. The studio chrome lives under
 * /vendor-studio/*; this route just forwards. Server-side redirect so
 * the old VendorLayout sidebar never renders. */
import { redirect } from 'next/navigation'
export default function VendorProfileRedirect() { redirect('/vendor-studio/profile') }
