import { cx } from '../lib/cx'
import './correctrate.css'

/** Farbe je Trefferquote: grün (hoch) → gelb → orange → rot (niedrig). */
export function rateColor(pct: number): string {
  const p = Math.max(0, Math.min(1, pct))
  return `hsl(${Math.round(p * 128)} 68% ${44 + p * 6}%)`
}

/**
 * Trefferquote als Balken (farbiger „richtig"-Teil, blasser „falsch"-Teil) mit
 * EINEM Prozentwert – Farbe wird umso röter, je schlechter die Quote.
 */
export function CorrectRateBar({
  correct,
  total,
  size = 'md',
  label
}: {
  correct: number
  total: number
  size?: 'sm' | 'md'
  label?: string
}): JSX.Element | null {
  if (!(total > 0)) return null
  const right = Math.max(0, Math.min(1, correct / total))
  const pct = Math.round(right * 100)
  const col = rateColor(right)

  return (
    <div className={cx('crate', `crate--${size}`)}>
      <div className="crate__head">
        {label && <span className="crate__label">{label}</span>}
        <span className="crate__val" style={{ color: col }}>
          {pct}% richtig
        </span>
        <span className="crate__frac">
          {correct}/{total}
        </span>
      </div>
      <div className="crate__bar" role="img" aria-label={`${pct} Prozent richtig`}>
        <i className="crate__seg" style={{ width: `${pct}%`, background: col }} />
      </div>
    </div>
  )
}
