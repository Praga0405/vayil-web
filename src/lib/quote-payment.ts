export type QuotePaymentOption = 'full' | 'minimum' | 'custom'

function positiveNumber(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

export function quoteId(quote: any): number | null {
  return positiveNumber(quote?.quotation_id ?? quote?.id)
}

export function isAcceptedQuote(quote: any): boolean {
  const status = String(quote?.status ?? '').trim().toLowerCase()
  const statusCode = Number(quote?.status_int ?? (/^\d+$/.test(status) ? status : Number.NaN))
  return status === 'accepted' || statusCode === 2 || statusCode === 9
}

export function isValidQuote(quote: any): boolean {
  if (!quoteId(quote) || !positiveNumber(quote?.amount)) return false
  const status = String(quote?.status ?? '').trim().toLowerCase()
  const statusCode = Number(quote?.status_int ?? (/^\d+$/.test(status) ? status : Number.NaN))
  return statusCode !== 3 && !['rejected', 'cancelled', 'deleted', 'inactive'].includes(status)
}

/** Accepted quote wins; otherwise show the newest active quote. */
export function selectCurrentQuote(quotes: unknown): any | null {
  if (!Array.isArray(quotes)) return null
  const active = quotes.filter(isValidQuote)
  return active.find(isAcceptedQuote) ?? active[0] ?? null
}

/** Quote amount is the project base. `total` may already include fees. */
export function quoteBaseAmount(quote: any): number {
  return positiveNumber(quote?.amount) ?? 0
}

export function minimumQuoteAmount(quote: any): number {
  const total = quoteBaseAmount(quote)
  if (!total) return 0
  const advance = positiveNumber(quote?.advance_amount)
  return advance && advance <= total ? advance : Math.round(total * 0.25)
}

export function paymentFeeSettings(settings: any): { platformFeePct: number; gstPct: number; tdsPct: number } {
  return {
    platformFeePct: Number(settings?.platform_fee_pct ?? settings?.platform_fee_percentage ?? 5),
    gstPct: Number(settings?.gst_pct ?? settings?.gst_percentage ?? 18),
    tdsPct: Number(settings?.tds_pct ?? settings?.tds_percentage ?? 0),
  }
}
