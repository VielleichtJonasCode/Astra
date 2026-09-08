/** Astra-Bildmarke: kosmische Scheibe mit Dokument und Gold-Ring. Skaliert per `size`. */
export function AstraMark({ size = 44 }: { size?: number }): JSX.Element {
  const id = 'am' + size
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#241a52" />
          <stop offset="1" stopColor="#0a63e6" />
        </linearGradient>
        <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffe9a8" />
          <stop offset="1" stopColor="#f0a52e" />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <circle cx="32" cy="32" r="30" />
        </clipPath>
      </defs>
      <circle cx="32" cy="32" r="30" fill={`url(#${id}-bg)`} />
      <g clipPath={`url(#${id}-clip)`}>
        <ellipse
          cx="32"
          cy="33"
          rx="30"
          ry="9.5"
          fill="none"
          stroke={`url(#${id}-ring)`}
          strokeWidth="2.4"
          transform="rotate(-18 32 33)"
          opacity="0.55"
        />
        <g transform="translate(32 33)">
          <path d="M-10 -14 H6 L11 -9 V14 H-10 Z" fill="#fff" />
          <path d="M6 -14 L11 -9 H6 Z" fill="#cfd6e8" />
          <rect x="-6" y="-7" width="13" height="2.1" rx="1" fill="#9fb0d8" />
          <rect x="-6" y="-2" width="13" height="2.1" rx="1" fill="#9fb0d8" />
          <rect x="-6" y="3" width="9" height="2.1" rx="1" fill="#9fb0d8" />
        </g>
        <path
          d="M2 40 A30 9.5 0 0 0 60 26"
          fill="none"
          stroke={`url(#${id}-ring)`}
          strokeWidth="2.4"
          transform="rotate(-18 32 33)"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}
