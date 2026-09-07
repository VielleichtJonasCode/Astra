import { nanoid } from 'nanoid'
import type { Annotation, TextStyle } from '../pdf/model'
import { DEFAULT_TEXT_STYLE } from '../pdf/model'
import type { Rect } from '../lib/geometry'
import type { ToolId } from '../store/uiStore'

export interface ToolContext {
  pageId: string
  color: string
  strokeWidth: number
}

/** Erzeugt eine neue Annotation aus Werkzeug + gezeichnetem Rechteck. */
export function createAnnotationFromRect(
  tool: ToolId,
  rect: Rect,
  ctx: ToolContext
): Annotation | null {
  const base = { id: nanoid(10), pageId: ctx.pageId, rect }

  switch (tool) {
    case 'text':
      return {
        ...base,
        kind: 'text',
        text: '',
        style: { ...DEFAULT_TEXT_STYLE, color: '#1c1c1e' } as TextStyle,
        cover: null,
        rect: { ...rect, width: Math.max(rect.width, 160), height: Math.max(rect.height, 26) }
      }
    case 'highlight':
      return { ...base, kind: 'highlight', color: ctx.color, quads: [rect], opacity: 0.4 }
    case 'underline':
      return { ...base, kind: 'underline', color: ctx.color, quads: [rect] }
    case 'strikeout':
      return { ...base, kind: 'strikeout', color: ctx.color, quads: [rect] }
    case 'shape-rect':
      return {
        ...base,
        kind: 'rect',
        stroke: ctx.color,
        fill: null,
        strokeWidth: ctx.strokeWidth
      }
    case 'shape-ellipse':
      return {
        ...base,
        kind: 'ellipse',
        stroke: ctx.color,
        fill: null,
        strokeWidth: ctx.strokeWidth
      }
    case 'shape-line':
      return {
        ...base,
        kind: 'line',
        stroke: ctx.color,
        strokeWidth: ctx.strokeWidth,
        from: { x: 0, y: 0 },
        to: { x: 1, y: 1 }
      }
    case 'shape-arrow':
      return {
        ...base,
        kind: 'arrow',
        stroke: ctx.color,
        strokeWidth: ctx.strokeWidth,
        from: { x: 0, y: 0 },
        to: { x: 1, y: 1 }
      }
    case 'note':
      return {
        ...base,
        kind: 'note',
        text: '',
        color: ctx.color,
        rect: { x: rect.x, y: rect.y, width: 22, height: 22 }
      }
    case 'stamp':
      return {
        ...base,
        kind: 'stamp',
        label: 'GENEHMIGT',
        color: '#ff453a',
        rect: { ...rect, width: Math.max(rect.width, 150), height: Math.max(rect.height, 44) }
      }
    default:
      return null
  }
}

export function createInk(
  pageId: string,
  bbox: Rect,
  paths: { x: number; y: number }[][],
  color: string,
  width: number
): Annotation {
  return { id: nanoid(10), pageId, rect: bbox, kind: 'ink', color, width, paths }
}

export function createImageAnnotation(
  pageId: string,
  rect: Rect,
  assetId: string
): Annotation {
  return { id: nanoid(10), pageId, rect, kind: 'image', assetId }
}
