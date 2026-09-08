import { type Adjust, type Anno, filterString } from './model'

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif'

/** Radius der Nummern-Sprechblasen in Bild-Pixeln (auch im Overlay verwendet). */
export const STEP_RADIUS = 17

function newCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      lines.push('')
      continue
    }
    let line = ''
    for (const word of paragraph.split(/(\s+)/)) {
      const test = line + word
      if (ctx.measureText(test).width > maxWidth && line !== '') {
        lines.push(line.trimEnd())
        line = word.trimStart()
      } else {
        line = test
      }
    }
    lines.push(line.trimEnd())
  }
  return lines
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number
): void {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const len = Math.max(12, width * 3.4)
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - len * Math.cos(angle - Math.PI / 7), y2 - len * Math.sin(angle - Math.PI / 7))
  ctx.lineTo(x2 - len * Math.cos(angle + Math.PI / 7), y2 - len * Math.sin(angle + Math.PI / 7))
  ctx.closePath()
  ctx.fill()
}

function pixelateRegion(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
  block: number
): void {
  if (w < 1 || h < 1) return
  const bw = Math.max(1, Math.round(w / Math.max(2, block)))
  const bh = Math.max(1, Math.round(h / Math.max(2, block)))
  const tmp = newCanvas(bw, bh)
  const tctx = tmp.getContext('2d')
  if (!tctx) return
  tctx.imageSmoothingEnabled = false
  tctx.drawImage(src, x, y, w, h, 0, 0, bw, bh)
  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(tmp, 0, 0, bw, bh, x, y, w, h)
  ctx.restore()
}

function blurRegion(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
): void {
  if (w < 1 || h < 1) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.filter = `blur(${Math.max(1, radius)}px)`
  ctx.drawImage(src, 0, 0)
  ctx.restore()
}

function ellipsePath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  ctx.beginPath()
  ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2)
}

/**
 * Zeichnet das Grundbild mit Anpassungen und allen Annotationen in ein
 * frisches Canvas. Basis fürs Live-Rendering und den Export.
 */
export function composite(
  base: HTMLCanvasElement,
  annos: Anno[],
  adjust: Adjust
): HTMLCanvasElement {
  const out = newCanvas(base.width, base.height)
  const ctx = out.getContext('2d')
  if (!ctx) return out

  ctx.filter = filterString(adjust)
  ctx.drawImage(base, 0, 0)
  ctx.filter = 'none'

  // Sampling-Quelle für Verpixeln/Weichzeichnen: der bereits gefilterte Zustand.
  const sampleSrc = newCanvas(out.width, out.height)
  sampleSrc.getContext('2d')?.drawImage(out, 0, 0)

  for (const a of annos) {
    ctx.save()
    switch (a.type) {
      case 'redact': {
        ctx.fillStyle = a.color
        ctx.fillRect(a.x, a.y, a.w, a.h)
        break
      }
      case 'highlight': {
        ctx.globalAlpha = 0.35
        ctx.fillStyle = a.color
        ctx.fillRect(a.x, a.y, a.w, a.h)
        break
      }
      case 'pixelate': {
        pixelateRegion(ctx, sampleSrc, a.x, a.y, a.w, a.h, a.strength || 14)
        break
      }
      case 'blur': {
        blurRegion(ctx, sampleSrc, a.x, a.y, a.w, a.h, a.strength || 10)
        break
      }
      case 'rect': {
        if (a.fill) {
          ctx.fillStyle = a.color
          ctx.fillRect(a.x, a.y, a.w, a.h)
        } else {
          ctx.strokeStyle = a.color
          ctx.lineWidth = a.strokeWidth
          ctx.strokeRect(a.x, a.y, a.w, a.h)
        }
        break
      }
      case 'ellipse': {
        ellipsePath(ctx, a.x, a.y, a.w, a.h)
        if (a.fill) {
          ctx.fillStyle = a.color
          ctx.fill()
        } else {
          ctx.strokeStyle = a.color
          ctx.lineWidth = a.strokeWidth
          ctx.stroke()
        }
        break
      }
      case 'line':
      case 'arrow': {
        ctx.strokeStyle = a.color
        ctx.fillStyle = a.color
        ctx.lineWidth = a.strokeWidth
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(a.x1, a.y1)
        ctx.lineTo(a.x2, a.y2)
        ctx.stroke()
        if (a.type === 'arrow') drawArrowHead(ctx, a.x1, a.y1, a.x2, a.y2, a.strokeWidth)
        break
      }
      case 'draw': {
        ctx.strokeStyle = a.color
        ctx.lineWidth = a.strokeWidth
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        for (let i = 0; i < a.points.length; i += 2) {
          const px = a.points[i]
          const py = a.points[i + 1]
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.stroke()
        break
      }
      case 'text': {
        const fs = a.fontSize
        ctx.font = `${a.bold ? '600 ' : ''}${fs}px ${FONT_STACK}`
        ctx.textBaseline = 'top'
        const lineH = fs * 1.32
        const lines = wrapText(ctx, a.text || '', a.w)
        if (a.bg) {
          ctx.fillStyle = a.bg
          ctx.fillRect(a.x - 4, a.y - 3, a.w + 8, lines.length * lineH + 6)
        }
        ctx.fillStyle = a.color
        ctx.textAlign = a.align
        const tx = a.align === 'center' ? a.x + a.w / 2 : a.align === 'right' ? a.x + a.w : a.x
        lines.forEach((ln, i) => ctx.fillText(ln, tx, a.y + i * lineH))
        break
      }
      case 'step': {
        const r = STEP_RADIUS
        ctx.fillStyle = a.color
        ctx.beginPath()
        ctx.arc(a.x, a.y, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.font = `700 ${Math.round(r * 1.1)}px ${FONT_STACK}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(a.n), a.x, a.y + 1)
        break
      }
    }
    ctx.restore()
  }
  return out
}
