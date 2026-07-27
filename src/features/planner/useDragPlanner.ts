import { useRef, useState } from 'react'

export interface DragGhost {
  title: string
  x: number
  y: number
}

const LONG_PRESS_MS = 180
const MOVE_CANCEL_PX = 10
const EDGE_ZONE_PX = 44
const EDGE_SPEED_PX = 9

/**
 * Touch-taugliches Drag & Drop für den Wochenplaner (Pointer Events, keine Lib).
 * - Long-Press aktiviert das Ziehen (unterscheidet Scrollen von Ziehen).
 * - Drop-Ziel via elementFromPoint → nächstes [data-plan-day] / [data-plan-tray].
 * - Auto-Scroll am linken/rechten Rand der Spalten-Leiste.
 */
export function useDragPlanner(onDrop: (taskId: string, dayDate: string | null) => void) {
  const [ghost, setGhost] = useState<DragGhost | null>(null)
  const dropTarget = useRef<Element | null>(null)
  const autoScroll = useRef<number | null>(null)

  function clearHover() {
    document.querySelectorAll('.plan-drop-hover').forEach((n) => n.classList.remove('plan-drop-hover'))
    dropTarget.current = null
  }

  function stopAutoScroll() {
    if (autoScroll.current !== null) {
      cancelAnimationFrame(autoScroll.current)
      autoScroll.current = null
    }
  }

  function edgeScroll(under: Element | null, x: number) {
    stopAutoScroll()
    const strip = under?.closest('.planner-strip') as HTMLElement | null
    if (!strip) return
    const rect = strip.getBoundingClientRect()
    let dir = 0
    if (x < rect.left + EDGE_ZONE_PX) dir = -1
    else if (x > rect.right - EDGE_ZONE_PX) dir = 1
    if (dir === 0) return
    const step = () => {
      strip.scrollLeft += dir * EDGE_SPEED_PX
      autoScroll.current = requestAnimationFrame(step)
    }
    autoScroll.current = requestAnimationFrame(step)
  }

  function onPointerDown(e: React.PointerEvent, taskId: string, title: string) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const startX = e.clientX
    const startY = e.clientY
    const el = e.currentTarget as HTMLElement
    const pointerId = e.pointerId
    let active = false

    const longPress = window.setTimeout(() => {
      active = true
      try {
        el.setPointerCapture(pointerId)
      } catch {
        /* ignore */
      }
      setGhost({ title, x: startX, y: startY })
      if (navigator.vibrate) navigator.vibrate(10)
    }, LONG_PRESS_MS)

    const move = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > MOVE_CANCEL_PX) cancel()
        return
      }
      ev.preventDefault()
      setGhost({ title, x: ev.clientX, y: ev.clientY })
      const under = document.elementFromPoint(ev.clientX, ev.clientY)
      const target = under?.closest('[data-plan-day], [data-plan-tray]') ?? null
      if (target !== dropTarget.current) {
        clearHover()
        if (target) target.classList.add('plan-drop-hover')
        dropTarget.current = target
      }
      edgeScroll(under, ev.clientX)
    }

    const up = () => {
      window.clearTimeout(longPress)
      if (active && dropTarget.current) {
        const day = dropTarget.current.getAttribute('data-plan-day')
        onDrop(taskId, day) // day = ISO-String bei Tag, null bei Tray
      }
      cleanup()
    }

    const cancel = () => {
      window.clearTimeout(longPress)
      cleanup()
    }

    const cleanup = () => {
      stopAutoScroll()
      clearHover()
      setGhost(null)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }

    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  return { ghost, onPointerDown }
}
