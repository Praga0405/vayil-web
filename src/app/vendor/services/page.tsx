/* "Services" in old sidebar = "Listings" in vendor-studio. */
import { redirect } from "next/navigation"
export default function VendorServicesRedirect() { redirect("/vendor-studio/listing") }
