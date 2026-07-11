type LegacyPaymentTotalsInput = {
  planBaseAmount: unknown;
  quotationAmount: unknown;
  materialFinalAmount: unknown;
  platformFeePercentage: unknown;
  taxOption: unknown;
};

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function taxOptions(value: unknown): any[] {
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray((parsed as any)?.tax_options) ? (parsed as any).tax_options : [];
  } catch {
    return [];
  }
}

export function legacyGstPercentage(value: unknown): number {
  return taxOptions(value)
    .filter((option) => ['sgst', 'cgst'].includes(String(option?.tax_name ?? '').trim().toLowerCase()))
    .reduce((total, option) => total + numberValue(option?.tax_percentage), 0);
}

export function calculateLegacyPaymentTotals(input: LegacyPaymentTotalsInput) {
  const planBaseFromRows = numberValue(input.planBaseAmount);
  const quotationBase = numberValue(input.quotationAmount);
  const planBaseAmount = planBaseFromRows > 0 ? planBaseFromRows : quotationBase;
  const materialFinalAmount = numberValue(input.materialFinalAmount);
  const platformPercentage = numberValue(input.platformFeePercentage);
  const gstPercentage = legacyGstPercentage(input.taxOption);

  const platformCost = money((planBaseAmount * platformPercentage) / 100);
  const taxCost = money(((planBaseAmount + platformCost) * gstPercentage) / 100);
  const totalPlanAmount = money(planBaseAmount + platformCost + taxCost);
  const totalAmount = money(totalPlanAmount + materialFinalAmount);

  return {
    planBaseAmount: money(planBaseAmount),
    platformCost,
    taxCost,
    totalPlanAmount,
    totalMaterialAmount: money(materialFinalAmount),
    totalAmount,
  };
}
