import type { SVGProps } from 'react'

/** Gemeinsame Basis: dünne Linien-Icons, erben die Textfarbe (currentColor). */
function Icon({ children, size = 20, ...rest }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const PlusIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const GearIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Icon>
)

export const ChevronLeftIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Icon {...p}>
    <path d="M15 18l-6-6 6-6" />
  </Icon>
)

export const ChevronRightIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Icon {...p}>
    <path d="M9 18l6-6-6-6" />
  </Icon>
)

export const CloseIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Icon {...p}>
    <path d="M18 6L6 18M6 6l12 12" />
  </Icon>
)

export const TrashIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Icon {...p}>
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
  </Icon>
)

export const ExportIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Icon {...p}>
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M12 2v14M8 6l4-4 4 4" />
  </Icon>
)

export const CheckIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Icon {...p}>
    <path d="M20 6L9 17l-5-5" />
  </Icon>
)

export const CalendarIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </Icon>
)

export const ChartIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Icon {...p}>
    <path d="M3 3v18h18M8 17v-5M13 17V7M18 17v-9" />
  </Icon>
)
