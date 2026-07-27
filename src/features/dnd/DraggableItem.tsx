import type { ReactNode } from 'react'
import { useDraggable } from '@dnd-kit/core'

interface Props {
  id: string
  data?: Record<string, unknown>
  disabled?: boolean
  className?: string
  children: ReactNode
}

/** Ziehbares Element (dnd-kit). Tap/Klick auf innere Buttons bleibt dank Delay-Aktivierung erhalten. */
export default function DraggableItem({ id, data, disabled, className, children }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data, disabled })
  return (
    <div
      ref={setNodeRef}
      className={`${className ?? ''}${isDragging ? ' is-dragging' : ''}`}
      {...listeners}
      {...attributes}
    >
      {children}
    </div>
  )
}
