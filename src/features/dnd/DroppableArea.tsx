import type { ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'

interface Props {
  id: string
  className?: string
  children: ReactNode
}

/** Ablagebereich (dnd-kit). Bekommt beim Überziehen die Klasse `plan-drop-hover`. */
export default function DroppableArea({ id, className, children }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={`${className ?? ''}${isOver ? ' plan-drop-hover' : ''}`}>
      {children}
    </div>
  )
}
