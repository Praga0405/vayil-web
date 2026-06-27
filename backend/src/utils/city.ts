type CityRow = Record<string, any>;

function normalizeDisplayName(value: any): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function rowId(row: CityRow): number {
  const n = Number(row.city_id ?? row.id);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

/**
 * Mobile dropdowns key/display cities by city_name. If the city master table
 * contains duplicate rows, return one stable row per normalized display name.
 */
export function uniqueCityRows<T extends CityRow>(rows: T[]): T[] {
  const seen = new Map<string, T>();

  for (const row of rows || []) {
    const cityName = normalizeDisplayName(row.city_name ?? row.name);
    if (!cityName) continue;

    const key = cityName.toLowerCase();
    const normalized = {
      ...row,
      city_name: cityName,
      city_state: normalizeDisplayName(row.city_state),
    } as T;

    const current = seen.get(key);
    if (!current || rowId(normalized) < rowId(current)) {
      seen.set(key, normalized);
    }
  }

  return Array.from(seen.values());
}
