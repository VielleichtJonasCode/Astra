/**
 * Winziger Ereignisbus zwischen Sidebar/Toolbar und dem Viewer,
 * ohne die Komponenten direkt zu koppeln.
 */
type ScrollHandler = (pageIndex1: number) => void

let handler: ScrollHandler | null = null

export function registerViewerScroll(fn: ScrollHandler | null): void {
  handler = fn
}

export function scrollViewerToPage(pageIndex1: number): void {
  handler?.(pageIndex1)
}
