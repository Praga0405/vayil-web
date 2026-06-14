/* KYC is folded into setup in the studio. */
import { redirect } from "next/navigation"
export default function VendorKycRedirect() { redirect("/vendor-studio/setup") }
