import type { ReactNode } from 'react'
import { useDraggable } from '@dnd-kit/core'

interface Props {
  id: string
  data?: Record<string, unknown>
  disabled?: boolean
  className?: string
  onClick?: () => void
  children: ReactNode
}

/** Ziehbares Element (dnd-kit). Tap/Klick löst dank Delay-Aktivierung kein Drag aus → onClick feuert. */
export default function DraggableItem({ id, data, disabled, className, onClick, children }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data, disabled })
  return (
    <div
      ref={setNodeRef}
      className={`${className ?? ''}${isDragging ? ' is-dragging' : ''}`}
      onClick={onClick}
      {...listeners}
      {...attributes}
    >
      {children}
    </div>
  )
}
