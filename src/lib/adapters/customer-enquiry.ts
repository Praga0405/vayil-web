import { isValidQuote } from '@/lib/quote-payment'

export type CustomerEnquiryStatus =
  | 'PENDING'
  | 'QUOTED'
  | 'ONGOING'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'

function statusText(row: any): string {
  return String(row?.status_name ?? row?.status ?? '').trim().toLowerCase()
}

function numericStatus(row: any): number | null {
  const value = Number(row?.status_int ?? row?.status)
  return Number.isFinite(value) ? value : null
}

export function validEnquiryQuotes(row: any): any[] {
  const quotes = row?.quotations ?? row?.quotes ?? []
  return Array.isArray(quotes) ? quotes.filter(isValidQuote) : []
}

/**
 * The mobile enquiry API intentionally returns integer status codes. The web
 * tabs and StatusBadge consume semantic strings, so adapt once at the edge.
 */
export function normalizeCustomerEnquiry(row: any): any {
  const workflowText = String(row?.workflow_status ?? '').trim().toLowerCase()
  const text = workflowText || statusText(row)
  const code = numericStatus(row)
  const orders = Array.isArray(row?.orders) ? row.orders : []
  const allQuotes = Array.isArray(row?.quotations ?? row?.quotes) ? (row.quotations ?? row.quotes) : []
  const quotes = validEnquiryQuotes(row)
  const rejectedQuoteCount = Number(
    row?.rejected_quote_count
      ?? allQuotes.filter((quote: any) =>
        String(quote?.status ?? '').toLowerCase() === 'rejected' || Number(quote?.status_int) === 3,
      ).length,
  )

  let status: CustomerEnquiryStatus
  if (code === 10 || ['completed', 'complete'].includes(text)) status = 'COMPLETED'
  else if (code === 3 || ['rejected', 'reject', 'rejected_quote'].includes(text)) status = 'REJECTED'
  else if (['cancelled', 'canceled'].includes(text)) status = 'CANCELLED'
  else if (orders.length > 0 || code === 9 || ['ongoing', 'in progress', 'active'].includes(text)) status = 'ONGOING'
  else if (quotes.length > 0 || (code === 11 && quotes.length > 0) || ['quoted', 'quote received'].includes(text) && quotes.length > 0) status = 'QUOTED'
  else status = 'PENDING'

  return {
    ...row,
    raw_status: row?.status,
    status,
    valid_quote_count: quotes.length,
    rejected_quote_count: rejectedQuoteCount,
    had_rejected_quote: Boolean(row?.had_rejected_quote) || rejectedQuoteCount > 0,
    re_quote_received: Boolean(row?.re_quote_received) || (rejectedQuoteCount > 0 && quotes.length > 0),
  }
}
