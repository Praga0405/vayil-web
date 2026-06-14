/* "Projects" in old sidebar = "Jobs" in vendor-studio. */
import { redirect } from "next/navigation"
export default function VendorProjectsRedirect() { redirect("/vendor-studio/jobs") }
