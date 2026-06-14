/* No dedicated /vendor-studio/notifications yet; falls back to dashboard. */
import { redirect } from "next/navigation"
export default function VendorNotificationsRedirect() { redirect("/vendor-studio/dashboard") }
