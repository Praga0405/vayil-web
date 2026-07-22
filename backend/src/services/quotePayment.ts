import { ApiError } from '../utils/http';

export type QuotePaymentOption = 'full' | 'minimum' | 'custom';

export interface QuotePaymentSelection {
  quoteAmount: number;
  advanceAmount?: number | string | null;
  paymentOption?: QuotePaymentOption;
  requestedBaseAmount?: number;
}

function asPositiveAmount(value: unknown): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

/** Mobile and web deployments have used both text and integer quote statuses. */
export function isAcceptedQuoteStatus(status: unknown, statusInt?: unknown): boolean {
  const text = String(status ?? '').trim().toLowerCase();
  if (text === 'accepted') return true;

  const code = Number(statusInt ?? (/^\d+$/.test(text) ? text : Number.NaN));
  return code === 2 || code === 9;
}

export function minimumQuotePayment(quoteAmount: number, advanceAmount?: unknown): number {
  const total = asPositiveAmount(quoteAmount);
  if (!total) throw new ApiError(400, 'Quote amount must be greater than zero');

  const configuredAdvance = asPositiveAmount(advanceAmount);
  if (configuredAdvance && configuredAdvance <= total) return configuredAdvance;
  return Math.round(total * 0.25);
}

/**
 * Resolve the base amount selected by the customer. Razorpay fees are applied
 * after this function, so quote.total (which may already include fees) must
 * never be used as the base.
 */
export function resolveQuotePaymentBase(selection: QuotePaymentSelection): number {
  const quoteAmount = asPositiveAmount(selection.quoteAmount);
  if (!quoteAmount) throw new ApiError(400, 'Quote amount must be greater than zero');

  const option = selection.paymentOption ?? 'full';
  const requested = asPositiveAmount(selection.requestedBaseAmount);
  const minimum = minimumQuotePayment(quoteAmount, selection.advanceAmount);

  if (option === 'full') {
    if (requested && Math.abs(requested - quoteAmount) > 1) {
      throw new ApiError(400, `Full payment base must be ${quoteAmount}`);
    }
    return quoteAmount;
  }

  if (option === 'minimum') {
    if (requested && Math.abs(requested - minimum) > 1) {
      throw new ApiError(400, `Minimum payment base must be ${minimum}`);
    }
    return minimum;
  }

  if (!requested) throw new ApiError(400, 'base_amount required for custom quote payment');
  if (requested < minimum || requested > quoteAmount) {
    throw new ApiError(400, `Custom payment base must be between ${minimum} and ${quoteAmount}`);
  }
  return requested;
}
