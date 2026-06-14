import { redirect } from "next/navigation"
export default function VendorEnquiryRedirect({ params }: { params: { id: string } }) {
  redirect(`/vendor-studio/enquiries/${params.id}`)
}
