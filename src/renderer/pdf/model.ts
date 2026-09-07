import type { Rect } from '../lib/geometry'

/**
 * Dokumentmodell. Das Original-PDF (`originalBytes`) bleibt unangetastet;
 * alle Bearbeitungen leben als Operationen im Modell und werden erst beim
 * Export/Sichern von `exportPdf.ts` in echte PDF-Bytes übersetzt.
 */

export type PageId = string
export type AnnotationId = string

export type Rotation = 0 | 90 | 180 | 270

/** Herkunft einer Seite im Ergebnisdokument. */
export type PageSource =
  | { kind: 'original'; index: number }
  | { kind: 'blank'; width: number; height: number }
  | { kind: 'image'; assetId: string; width: number; height: number }
  | { kind: 'external'; docKey: string; index: number }

export interface PageModel {
  id: PageId
  source: PageSource
  /** Zusätzliche Drehung gegenüber der Originalseite. */
  rotation: Rotation
  /** Optionaler Zuschnitt in PDF-Punkten (Ursprung unten-links). */
  cropBox?: Rect
  /** Gleichmäßige Skalierung des Seiteninhalts (1 = unverändert). */
  scale?: number
  /** Explizit gesetzte Zielgröße in Punkten (überschreibt die Originalgröße). */
  resizeTo?: { width: number; height: number }
  /** Unveränderte Basisgröße der Quelle in Punkten (nach Original-Rotation). */
  baseWidth: number
  baseHeight: number
}

export type StandardFont =
  | 'Helvetica'
  | 'Helvetica-Bold'
  | 'Helvetica-Oblique'
  | 'Times-Roman'
  | 'Times-Bold'
  | 'Times-Italic'
  | 'Courier'
  | 'Courier-Bold'
  | 'Unicode'

export interface TextStyle {
  font: StandardFont
  size: number
  color: string
  align: 'left' | 'center' | 'right'
  lineHeight: number
}

export interface BaseAnnotation {
  id: AnnotationId
  pageId: PageId
  /** Position/Ausdehnung im Overlay-Koordinatensystem (oben-links, PDF-Punkte). */
  rect: Rect
  rotation?: number
  opacity?: number
  locked?: boolean
}

export interface TextAnnotation extends BaseAnnotation {
  kind: 'text'
  text: string
  style: TextStyle
  /** Deckendes Rechteck darunter (für "Text bearbeiten" / überschreiben). */
  cover?: { color: string } | null
}

export interface MarkupAnnotation extends BaseAnnotation {
  kind: 'highlight' | 'underline' | 'strikeout'
  color: string
  /** Einzelne Textzeilen-Rechtecke (Quads) im Overlay-System. */
  quads: Rect[]
}

export interface InkAnnotation extends BaseAnnotation {
  kind: 'ink'
  color: string
  width: number
  /** Pfade als Punktlisten, relativ zu `rect` (0..1). */
  paths: { x: number; y: number }[][]
}

export interface ShapeAnnotation extends BaseAnnotation {
  kind: 'rect' | 'ellipse' | 'line' | 'arrow'
  stroke: string
  fill?: string | null
  strokeWidth: number
  /** Für line/arrow: Start und Ende relativ zu `rect` (0..1). */
  from?: { x: number; y: number }
  to?: { x: number; y: number }
}

export interface ImageAnnotation extends BaseAnnotation {
  kind: 'image'
  assetId: string
}

export interface NoteAnnotation extends BaseAnnotation {
  kind: 'note'
  text: string
  color: string
}

export interface StampAnnotation extends BaseAnnotation {
  kind: 'stamp'
  label: string
  color: string
}

export interface SignatureAnnotation extends BaseAnnotation {
  kind: 'signature'
  /** Entweder Strichzeichnung … */
  paths?: { x: number; y: number }[][]
  /** … oder ein Bild-Asset. */
  assetId?: string
  color: string
}

export type Annotation =
  | TextAnnotation
  | MarkupAnnotation
  | InkAnnotation
  | ShapeAnnotation
  | ImageAnnotation
  | NoteAnnotation
  | StampAnnotation
  | SignatureAnnotation

export type AnnotationKind = Annotation['kind']

/** Redaktion: Bereich wird beim Export echt aus dem PDF entfernt (MuPDF). */
export interface Redaction {
  id: string
  pageId: PageId
  rect: Rect
  fill: string
}

export interface DocMetadata {
  title: string
  author: string
  subject: string
  keywords: string
  creator: string
}

export type OverlayCorner =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

export interface WatermarkConfig {
  kind: 'text' | 'image'
  text: string
  assetId?: string
  color: string
  opacity: number
  /** Grad, gegen den Uhrzeigersinn. */
  rotation: number
  fontSize: number
  layout: 'center' | 'diagonal' | 'tiled'
  /** 1-basierte Seiten; leer = alle. */
  pages: number[]
}

export interface PageNumberConfig {
  /** Vorlage mit Platzhaltern {n} {N} {prefix}. */
  template: string
  prefix: string
  start: number
  corner: OverlayCorner
  fontSize: number
  color: string
  margin: number
  pages: number[]
}

export interface HeaderFooterConfig {
  header: { left: string; center: string; right: string }
  footer: { left: string; center: string; right: string }
  fontSize: number
  color: string
  margin: number
  pages: number[]
}

export interface DocOverlays {
  watermark?: WatermarkConfig | null
  pageNumbers?: PageNumberConfig | null
  headerFooter?: HeaderFooterConfig | null
}

export interface DocEncryption {
  userPassword?: string
  ownerPassword?: string
}

/** Binär-Assets (eingefügte Bilder, Unterschrift-Bilder, externe PDFs). */
export interface Asset {
  id: string
  type: 'image' | 'pdf'
  mime: string
  bytes: Uint8Array
}

export interface PdfDoc {
  key: string
  name: string
  path: string | null
  originalBytes: Uint8Array
  pages: PageModel[]
  annotations: Record<PageId, Annotation[]>
  redactions: Record<PageId, Redaction[]>
  assets: Record<string, Asset>
  metadata: DocMetadata
  encryption: DocEncryption | null
  /** Globale Overlays (Wasserzeichen, Seitenzahlen, Kopf-/Fußzeile). */
  overlays: DocOverlays
  /** Für die Ausgabe angeforderte, nachgelagerte MuPDF-Schritte. */
  postProcess: {
    compress?: { imageDpi: number; quality: number } | null
    flattenForms?: boolean
    flattenAnnotations?: boolean
  }
  dirty: boolean
  /** Erhöht sich bei jeder strukturellen Änderung – triggert Neurendern. */
  revision: number
}

export const DEFAULT_METADATA: DocMetadata = {
  title: '',
  author: '',
  subject: '',
  keywords: '',
  creator: 'PDF Studio'
}

export const DEFAULT_TEXT_STYLE: TextStyle = {
  font: 'Helvetica',
  size: 14,
  color: '#1c1c1e',
  align: 'left',
  lineHeight: 1.3
}

export const PAGE_FORMATS: Record<string, { width: number; height: number }> = {
  A3: { width: 841.89, height: 1190.55 },
  A4: { width: 595.28, height: 841.89 },
  A5: { width: 419.53, height: 595.28 },
  Letter: { width: 612, height: 792 },
  Legal: { width: 612, height: 1008 },
  Tabloid: { width: 792, height: 1224 }
}

export function pageDisplaySize(page: PageModel): { width: number; height: number } {
  const base = page.resizeTo ?? { width: page.baseWidth, height: page.baseHeight }
  const scaled = {
    width: base.width * (page.scale ?? 1),
    height: base.height * (page.scale ?? 1)
  }
  const box = page.cropBox
    ? { width: page.cropBox.width, height: page.cropBox.height }
    : scaled
  const rotated = page.rotation === 90 || page.rotation === 270
  return rotated ? { width: box.height, height: box.width } : box
}
