import { ApiError } from './http';

export function optionalDecimal(value: unknown, field: string, scale = 2, integerDigits = 10): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const text = String(value).trim();
  const match = new RegExp(`^(\\d{1,${integerDigits}})(?:\\.(\\d{1,${scale}}))?$`).exec(text);
  if (!match) throw new ApiError(400, `${field} must be a non-negative number with up to ${scale} decimal places`);
  return `${match[1]}.${(match[2] ?? '').padEnd(scale, '0')}`;
}
