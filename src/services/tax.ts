export interface TaxInput {
  baseAmount: number;
  platformFeePct?: number;
  premiumFeePct?: number;
  tdsPct?: number;
  gstPct?: number;
  premium?: boolean;
  vendorGstRegistered?: boolean;
  rebateActive?: boolean;
}

export function calculateTax(input: TaxInput) {
  const base = Math.round(Number(input.baseAmount || 0));
  const platformPct = input.rebateActive ? 0 : (input.platformFeePct ?? 5) / 100;
  const premiumPct = input.premium ? (input.premiumFeePct ?? 15) / 100 : 0;
  const tdsPct = (input.tdsPct ?? 1) / 100;
  const gstPct = (input.gstPct ?? 18) / 100;

  const platformFee = Math.round(base * platformPct);
  const premiumFee = Math.round(base * premiumPct);
  const gstOnPlatformFee = Math.round(platformFee * gstPct);
  const gstOnProject = input.vendorGstRegistered ? Math.round(base * gstPct) : 0;
  const tdsOnVendor = Math.round(base * tdsPct);
  const vendorNetPayout = Math.round(base - platformFee - tdsOnVendor);
  const customerTotal = Math.round(base + platformFee + premiumFee + gstOnPlatformFee + gstOnProject);

  return { baseAmount: base, platformFee, premiumFee, gstOnPlatformFee, gstOnProject, tdsOnVendor, vendorNetPayout, customerTotal };
}
