type AnyRecord = Record<string, any>

function bodyOf(input: any): any {
  return input?.data && typeof input.data === 'object' ? input.data : input
}

export function apiArray(input: any, keys: string[] = []): any[] {
  const body = bodyOf(input)
  const candidates = [
    ...keys.flatMap(key => [body?.[key], body?.data?.[key], body?.result?.[key]]),
    body?.data,
    body?.result,
    body?.rows,
    body,
  ]
  const arr = candidates.find(Array.isArray)
  return Array.isArray(arr) ? arr : []
}

export function uniqueBy<T>(rows: T[], keyFn: (row: T) => string): T[] {
  const seen = new Set<string>()
  return rows.filter(row => {
    const key = keyFn(row).trim().toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function uniqueMasterRows(rows: any[]): any[] {
  return uniqueBy(rows, row =>
    String(
      row.name ?? row.category_name ?? row.sub_category_name ?? row.language_name ??
      row.tag_name ?? row.city_name ?? row.state_name ?? row.id ?? row.city_id ??
      row.state_id ?? '',
    ),
  )
}

export function optionId(row: AnyRecord): string | number {
  return row.id ?? row.category_id ?? row.subcategory_id ?? row.sub_category_id ??
    row.city_id ?? row.state_id ?? row.tag_id ?? row.language_id ?? row.value ?? ''
}

export function optionLabel(row: AnyRecord): string {
  return String(
    row.name ?? row.category_name ?? row.sub_category_name ?? row.subcategory_name ??
    row.city_name ?? row.state_name ?? row.tag_name ?? row.language_name ?? row.label ?? '',
  )
}

export function optionByValue(rows: AnyRecord[], value: unknown): AnyRecord | undefined {
  const raw = String(value ?? '').trim()
  if (!raw) return undefined
  const lower = raw.toLowerCase()
  return rows.find(row => String(optionId(row)) === raw) ||
    rows.find(row => optionLabel(row).trim().toLowerCase() === lower)
}

export function normalizedOptionId(rows: AnyRecord[], value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const row = optionByValue(rows, raw)
  return row ? String(optionId(row)) : raw
}

export function cityLookupPayload(stateRows: AnyRecord[], value: unknown): Record<string, unknown> {
  const raw = String(value ?? '').trim()
  const row = optionByValue(stateRows, raw)
  const id = row ? optionId(row) : raw
  const label = row ? optionLabel(row) : raw
  return {
    state_id: id,
    city_state_id: id,
    state_name: label,
    city_state: label,
  }
}

export function isActiveMaster(row: AnyRecord): boolean {
  return row.is_active !== 0 && row.is_deleted !== 1 && row.status !== 0 && row.status !== false
}

function urlList(value: any): string[] {
  if (Array.isArray(value)) {
    return value.flat(Infinity)
      .map((item: any) => typeof item === 'string' ? item : item?.url ?? item?.location ?? item?.file_url)
      .filter(Boolean)
      .map(String)
  }
  const text = String(value ?? '').trim()
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return urlList(parsed)
  } catch { /* CSV fallback */ }
  return text.split(',').map(item => item.trim()).filter(Boolean)
}

export function serviceImageUrls(service: AnyRecord): string[] {
  const urls = [
    ...urlList(service.service_image),
    ...urlList(service.images),
    ...urlList(service.image_urls),
    ...urlList(service.photos),
    ...urlList(service.thumbnail),
    ...urlList(service.service_image_url),
    ...urlList(service.cover_image),
  ]
  return uniqueBy(urls, url => String(url))
}

export function serviceImagePayload(urls: string[]): Record<string, unknown> {
  const cleaned = uniqueBy(urls.filter(Boolean).map(String), url => url)
  const first = cleaned[0]
  return {
    images: cleaned,
    thumbnail: first,
    service_image: cleaned.join(','),
    service_image_url: first,
  }
}

export function firstIdValue(value: any): string {
  if (value === undefined || value === null || value === '') return ''
  if (Array.isArray(value)) return value[0] == null ? '' : String(value[0])
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return ''
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed[0] == null ? '' : String(parsed[0])
    } catch { /* plain CSV */ }
    return trimmed.split(',').map(part => part.trim()).filter(Boolean)[0] ?? ''
  }
  return String(value)
}
