import { app, ipcMain } from 'electron'
import { readFile } from 'fs/promises'
import { join } from 'path'

/**
 * Dünner Client für die kostenlose Gemini-API (Google AI Studio).
 * Läuft im Hauptprozess, weil der Renderer per CSP kein `https:` erreicht.
 * Der API-Key liegt lokal unter userData/secrets/geminiApiKey.json
 * (über window.api.setSecret gesetzt) und wird nie mitgeloggt.
 */

/** Standardmodell; per Einstellung überschreibbar. `-latest` folgt Googles aktuellem Flash. */
const DEFAULT_MODEL = 'gemini-flash-latest'
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

function endpointFor(model: string): string {
  const m = model.trim().replace(/^models\//, '') || DEFAULT_MODEL
  return `${API_BASE}/${encodeURIComponent(m)}:generateContent`
}

function keyPath(): string {
  return join(app.getPath('userData'), 'secrets', 'geminiApiKey.json')
}

async function readKey(): Promise<string> {
  try {
    return (await readFile(keyPath(), 'utf8')).trim().replace(/^"|"$/g, '')
  } catch {
    return ''
  }
}

export interface LlmRequest {
  system?: string
  prompt: string
  /** Antwort als reines JSON erzwingen. */
  wantJson?: boolean
  temperature?: number
  /** Modellname (z. B. "gemini-2.5-flash"); leer = Standard. */
  model?: string
}

export type LlmResult = { text: string } | { error: string }

async function generate(req: LlmRequest): Promise<LlmResult> {
  const key = await readKey()
  if (!key) return { error: 'Kein Gemini-Schlüssel hinterlegt. In den Einstellungen eintragen.' }

  const body = {
    ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
    contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
    generationConfig: {
      temperature: req.temperature ?? 0.4,
      ...(req.wantJson ? { responseMimeType: 'application/json' } : {})
    }
  }

  const model = (req.model ?? '').trim() || DEFAULT_MODEL
  let res: Response
  try {
    res = await fetch(`${endpointFor(model)}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(75_000)
    })
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      return {
        error: 'Zeitüberschreitung – Gemini hat nicht geantwortet. Modellname und Internet prüfen.'
      }
    }
    return { error: `Keine Verbindung zu Gemini: ${err instanceof Error ? err.message : err}` }
  }

  if (!res.ok) {
    let detail = `${res.status}`
    try {
      const j = (await res.json()) as { error?: { message?: string } }
      if (j.error?.message) detail = j.error.message
    } catch {
      /* ignore */
    }
    if (res.status === 429)
      return { error: 'Gemini-Limit erreicht – kurz warten und erneut versuchen.' }
    if (res.status === 400 && /API key/i.test(detail))
      return { error: 'Gemini-Schlüssel ungültig.' }
    if (
      res.status === 404 ||
      /not found|not supported|is not available|unknown model/i.test(detail)
    ) {
      return {
        error: `Modell „${model}" nicht verfügbar. In den Einstellungen ein anderes eintragen (z. B. gemini-2.5-flash).`
      }
    }
    return { error: `Gemini-Fehler: ${detail}` }
  }

  try {
    const j = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
      promptFeedback?: { blockReason?: string }
    }
    if (j.promptFeedback?.blockReason) {
      return { error: `Von Gemini blockiert (${j.promptFeedback.blockReason}).` }
    }
    const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    if (!text.trim()) return { error: 'Gemini hat nichts zurückgegeben.' }
    return { text }
  } catch (err) {
    return { error: `Antwort nicht lesbar: ${err instanceof Error ? err.message : err}` }
  }
}

export function registerLlm(): void {
  ipcMain.handle('llm:hasKey', async (): Promise<boolean> => (await readKey()).length > 0)
  ipcMain.handle('llm:generate', (_e, req: LlmRequest): Promise<LlmResult> => generate(req))
}
