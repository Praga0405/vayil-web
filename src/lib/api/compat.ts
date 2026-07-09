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
    String(row.name ?? row.category_name ?? row.sub_category_name ?? row.language_name ?? row.tag_name ?? row.id ?? ''),
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

export function isActiveMaster(row: AnyRecord): boolean {
  return row.is_active !== 0 && row.is_deleted !== 1 && row.status !== 0 && row.status !== false
}

export function serviceImageUrls(service: AnyRecord): string[] {
  const raw = service.images ?? service.image_urls ?? service.photos
  const list = Array.isArray(raw) ? raw : []
  const urls = list
    .map((item: any) => typeof item === 'string' ? item : item?.url ?? item?.location ?? item?.file_url)
    .filter(Boolean)
  const primary = service.thumbnail ?? service.service_image ?? service.service_image_url ?? service.cover_image
  return primary ? [String(primary), ...urls.filter(url => url !== primary)] : urls
}

export function serviceImagePayload(urls: string[]): Record<string, unknown> {
  const first = urls.find(Boolean)
  return {
    images: urls,
    thumbnail: first,
    service_image: first,
    service_image_url: first,
  }
}
