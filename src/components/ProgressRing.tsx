interface Props {
  percent: number
  size?: number
  stroke?: number
  /** Optionaler Text in der Mitte; Standard = gerundete Prozentzahl. */
  label?: string
  color?: string
}

/** SVG-Fortschrittsring. Genutzt für Tages-Fortschritt und Ziel-Fortschritt. */
export default function ProgressRing({ percent, size = 44, stroke = 4, label, color }: Props) {
  const clamped = Math.max(0, Math.min(100, percent))
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - clamped / 100)
  const center = size / 2

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="var(--color-surface-alt)"
        strokeWidth={stroke}
      />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color ?? 'var(--color-primary)'}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${center} ${center})`}
        style={{ transition: 'stroke-dashoffset 0.4s ease' }}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fontSize={size * 0.26}
        fontWeight={700}
        fill="var(--color-text)"
      >
        {label ?? `${Math.round(clamped)}%`}
      </text>
    </svg>
  )
}
