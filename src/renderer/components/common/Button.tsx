import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { forwardRef } from 'react'
import { cx } from '../../lib/cx'
import { Icon, type IconName } from './Icon'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: ButtonSize
  block?: boolean
  icon?: IconName
  iconRight?: IconName
  children?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', block, icon, iconRight, className, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cx(
        'btn',
        `btn--${variant}`,
        size !== 'md' && `btn--${size}`,
        block && 'btn--block',
        className
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={15} />}
      {children}
      {iconRight && <Icon name={iconRight} size={15} />}
    </button>
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  name: IconName
  label: string
  active?: boolean
  large?: boolean
  size?: number
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { name, label, active, large, size, className, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cx('iconbtn', large && 'iconbtn--lg', active && 'is-active', className)}
      aria-label={label}
      aria-pressed={active}
      title={label}
      {...rest}
    >
      <Icon name={name} size={size ?? (large ? 18 : 17)} />
    </button>
  )
})
