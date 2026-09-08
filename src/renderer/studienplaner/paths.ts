/** POSIX-Pfad-Join für die Studienplaner-Dateizugriffe (Renderer, kein node:path). */
export function joinPath(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join('/')
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/, '')
}
