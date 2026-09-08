import { cx } from '../../lib/cx'
import { SWATCHES } from '../../lib/color'
import { Popover } from './Popover'
import { TextInput } from './controls'

export function ColorWell({
  value,
  onChange,
  swatches = SWATCHES
}: {
  value: string
  onChange: (hex: string) => void
  swatches?: string[]
}): JSX.Element {
  return (
    <Popover
      placement="bottom-end"
      trigger={
        <button
          type="button"
          className="colorwell"
          style={{ background: value }}
          aria-label="Farbe"
        />
      }
    >
      <div style={{ width: 176 }}>
        <div className="swatchgrid">
          {swatches.map((s) => (
            <button
              key={s}
              type="button"
              className={cx('swatch', s.toLowerCase() === value.toLowerCase() && 'is-active')}
              style={{ background: s }}
              onClick={() => onChange(s)}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: 4 }}>
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{
              width: 26,
              height: 26,
              padding: 0,
              border: 'none',
              background: 'none'
            }}
          />
          <TextInput
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
          />
        </div>
      </div>
    </Popover>
  )
}
