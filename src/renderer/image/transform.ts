function newCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

export type RotateDir = 'cw' | 'ccw' | '180'

export function rotateCanvas(src: HTMLCanvasElement, dir: RotateDir): HTMLCanvasElement {
  const swap = dir === 'cw' || dir === 'ccw'
  const out = newCanvas(swap ? src.height : src.width, swap ? src.width : src.height)
  const ctx = out.getContext('2d')
  if (!ctx) return src
  if (dir === 'cw') {
    ctx.translate(out.width, 0)
    ctx.rotate(Math.PI / 2)
  } else if (dir === 'ccw') {
    ctx.translate(0, out.height)
    ctx.rotate(-Math.PI / 2)
  } else {
    ctx.translate(out.width, out.height)
    ctx.rotate(Math.PI)
  }
  ctx.drawImage(src, 0, 0)
  return out
}

export function flipCanvas(src: HTMLCanvasElement, axis: 'h' | 'v'): HTMLCanvasElement {
  const out = newCanvas(src.width, src.height)
  const ctx = out.getContext('2d')
  if (!ctx) return src
  if (axis === 'h') {
    ctx.translate(out.width, 0)
    ctx.scale(-1, 1)
  } else {
    ctx.translate(0, out.height)
    ctx.scale(1, -1)
  }
  ctx.drawImage(src, 0, 0)
  return out
}

export function cropCanvas(
  src: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number
): HTMLCanvasElement {
  const cx = Math.max(0, Math.min(src.width - 1, Math.round(x)))
  const cy = Math.max(0, Math.min(src.height - 1, Math.round(y)))
  const cw = Math.max(1, Math.min(src.width - cx, Math.round(w)))
  const ch = Math.max(1, Math.min(src.height - cy, Math.round(h)))
  const out = newCanvas(cw, ch)
  out.getContext('2d')?.drawImage(src, cx, cy, cw, ch, 0, 0, cw, ch)
  return out
}

export function resizeCanvas(src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const out = newCanvas(w, h)
  const ctx = out.getContext('2d')
  if (!ctx) return src
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, out.width, out.height)
  return out
}

/** Grundbild aus dekodierten Bytes. Nutzt die EXIF-Ausrichtung, wenn vorhanden. */
export async function canvasFromBytes(bytes: Uint8Array, mime: string): Promise<HTMLCanvasElement> {
  const blob = new Blob([bytes.slice().buffer], { type: mime || 'image/png' })
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' })
  } catch {
    bmp = await createImageBitmap(blob)
  }
  const out = newCanvas(bmp.width, bmp.height)
  out.getContext('2d')?.drawImage(bmp, 0, 0)
  bmp.close()
  return out
}

export function canvasToBytes(
  canvas: HTMLCanvasElement,
  mime: string,
  quality: number
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('Bild konnte nicht kodiert werden'))
        blob.arrayBuffer().then((ab) => resolve(new Uint8Array(ab)))
      },
      mime,
      quality
    )
  })
}
