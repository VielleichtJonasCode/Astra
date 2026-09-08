export interface RecentApp {
  id: string
  ts: number
}

const KEY = 'astra.recentApps'
const MAX = 10

export function noteAppUsed(id: string): void {
  try {
    const cur: RecentApp[] = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    const next = [{ id, ts: Date.now() }, ...cur.filter((a) => a.id !== id)].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

export function getRecentApps(): RecentApp[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

export function clearRecentApps(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
