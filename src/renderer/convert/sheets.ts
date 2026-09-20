import * as ExcelJS from 'exceljs'
import { bytesToArrayBuffer } from '../lib/bytes'
import { guessAndParse, normalize, type Grid } from '../table/format'
import { esc } from './docs'

/** Zellwert als Anzeigetext (Formel-Ergebnis, Hyperlink-Text, Rich-Text …). */
function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('')
    if ('error' in v) return v.error
    if ('result' in v) return v.result === undefined ? '' : cellText(v.result)
    if ('text' in v) return v.text
    return ''
  }
  return String(v)
}

/** Erstes Tabellenblatt einer XLSX-Datei als Zellen-Gitter (Werte als Text). */
export async function xlsxToGrid(bytes: Uint8Array): Promise<Grid> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytesToArrayBuffer(bytes))
  const sheet = wb.worksheets[0]
  if (!sheet) return [['']]
  const rows: string[][] = []
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const cells: string[] = []
    row.eachCell({ includeEmpty: true }, (cell) => {
      cells.push(cellText(cell.value))
    })
    rows.push(cells)
  })
  return normalize(rows.length ? rows : [['']])
}

/** Zellen-Gitter → XLSX-Datei (ein Tabellenblatt). */
export async function gridToXlsx(grid: Grid, sheetName = 'Tabelle1'): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  const sheet = wb.addWorksheet(sheetName)
  for (const row of normalize(grid)) sheet.addRow(row)
  const buf = await wb.xlsx.writeBuffer()
  return new Uint8Array(buf)
}

/** CSV-Text → XLSX-Datei. */
export function csvToXlsx(text: string): Promise<Uint8Array> {
  return gridToXlsx(guessAndParse(text))
}

/** Zellen-Gitter als schlichte HTML-Tabelle (für den PDF-Export). */
export function gridToHtml(grid: Grid, title: string): string {
  const g = normalize(grid)
  const rows = g.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('\n')
  return `<h1>${esc(title)}</h1><table>${rows}</table>`
}
