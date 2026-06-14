import { redirect } from "next/navigation"
export default function VendorProjectRedirect({ params }: { params: { id: string } }) {
  redirect(`/vendor-studio/jobs/${params.id}`)
}
