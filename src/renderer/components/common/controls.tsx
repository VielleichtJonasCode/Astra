import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { cx } from '../../lib/cx'
import { clamp } from '../../lib/geometry'
import { Icon, type IconName } from './Icon'

/* ---------- Segmented ---------- */

export interface SegmentedOption<T extends string> {
  value: T
  label?: string
  icon?: IconName
  title?: string
}

export function Segmented<T extends string>({
  options,
  value,
  onChange
}: {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
}): JSX.Element {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={opt.value === value}
          title={opt.title ?? opt.label}
          className={cx('segmented__item', opt.value === value && 'is-active')}
          onClick={() => onChange(opt.value)}
        >
          {opt.icon && <Icon name={opt.icon} size={14} />}
          {opt.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- Slider ---------- */

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}): JSX.Element {
  return (
    <input
      type="range"
      className="slider"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}

/* ---------- TextInput ---------- */

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  return <input {...props} className={cx('input', props.className)} />
}

export function TextArea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>
): JSX.Element {
  return <textarea {...props} className={cx('input', props.className)} />
}

/* ---------- NumberInput ---------- */

export function NumberInput({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  suffix,
  width = 72
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
  width?: number
}): JSX.Element {
  const commit = (n: number): void => onChange(clamp(Number.isFinite(n) ? n : min, min, max))
  return (
    <div className="numfield" style={{ width }}>
      <input
        className="input"
        type="text"
        inputMode="decimal"
        value={suffix ? `${value}${suffix}` : String(value)}
        onChange={(e) => {
          const raw = e.target.value.replace(suffix ?? '', '').replace(',', '.')
          const n = parseFloat(raw)
          if (!Number.isNaN(n)) commit(n)
        }}
        onBlur={(e) => {
          const n = parseFloat(e.target.value.replace(suffix ?? '', '').replace(',', '.'))
          commit(Number.isNaN(n) ? min : n)
        }}
      />
      <div className="numfield__steppers">
        <button type="button" tabIndex={-1} onClick={() => commit(value + step)}>
          <Icon name="chevron-up" size={11} />
        </button>
        <button type="button" tabIndex={-1} onClick={() => commit(value - step)}>
          <Icon name="chevron-down" size={11} />
        </button>
      </div>
    </div>
  )
}

/* ---------- Select ---------- */

export interface SelectOption {
  value: string
  label: string
}

export function Select({
  options,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { options: SelectOption[] }): JSX.Element {
  return (
    <div className="select">
      <select {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="select__chev">
        <Icon name="chevron-down" size={13} />
      </span>
    </div>
  )
}

/* ---------- Toggle ---------- */

export function Toggle({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
}): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={cx('toggle', checked && 'is-on')}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__knob" />
    </button>
  )
}

/* ---------- Checkbox ---------- */

export function Checkbox({
  checked,
  onChange,
  children
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      className={cx('checkbox', checked && 'is-checked')}
      onClick={() => onChange(!checked)}
    >
      <span className="checkbox__box">{checked && <Icon name="check" size={12} />}</span>
      <span>{children}</span>
    </button>
  )
}
