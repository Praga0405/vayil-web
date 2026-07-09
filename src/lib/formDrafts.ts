const DAY_MS = 24 * 60 * 60 * 1000

type DraftEnvelope<T> = {
  savedAt: number
  value: T
}

export function loadDraft<T>(key: string, ttlMs = DAY_MS): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DraftEnvelope<T>
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > ttlMs) {
      window.localStorage.removeItem(key)
      return null
    }
    return parsed.value
  } catch {
    return null
  }
}

export function saveDraft<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value }))
  } catch {
    // Ignore private-mode/quota failures; the form remains usable.
  }
}

export function clearDraft(key: string): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(key) } catch {}
}
