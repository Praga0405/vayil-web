/* No dedicated /vendor-studio/bank yet; payout setup covers bank details. */
import { redirect } from "next/navigation"
export default function VendorBankRedirect() { redirect("/vendor-studio/payout") }
