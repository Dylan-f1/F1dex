'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { centerOn, formatViewBox, panView, parseViewBox, zoomLevel, zoomView } from '@/lib/viewport'

const WHEEL_SENSITIVITY = 0.0015
const WHEEL_LINE_HEIGHT_PX = 16
const BUTTON_ZOOM_FACTOR = 1.6
const KEY_PAN_RATIO = 0.12
// Au-dessus de ce niveau, la vue est « zoomée » : le glissement déplace la carte.
const ZOOMED_THRESHOLD = 1.001

// Taille réelle d'un élément (pour garder des tailles en pixels constantes dans le SVG).
export function useElementSize(ref, fallback) {
  const [size, setSize] = useState(fallback)
  useEffect(() => {
    const element = ref.current
    if (!element) return undefined
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width)
      const height = Math.round(entry.contentRect.height)
      setSize((previous) => (previous.width === width && previous.height === height ? previous : { width, height }))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return size
}

// Zoom et déplacement d'un SVG. La vue vit dans `viewRef` et est écrite directement dans l'attribut
// viewBox : un seul propriétaire, et pas de rendu React à chaque déplacement. Seul le niveau de zoom
// est un état React (les tailles en pixels des repères en dépendent).
export function useMapViewport(svgRef, viewBoxText, onManualPan) {
  const base = useMemo(() => parseViewBox(viewBoxText), [viewBoxText])
  const viewRef = useRef(base)
  const [zoom, setZoom] = useState(1)
  const pointers = useRef(new Map())
  const pinch = useRef(null)

  const setView = useCallback(
    (view) => {
      viewRef.current = view
      svgRef.current?.setAttribute('viewBox', formatViewBox(view))
      setZoom(Math.round(zoomLevel(view, base) * 100) / 100)
    },
    [base, svgRef],
  )

  // Coordonnées écran -> repère du tracé (tient compte du cadrage « meet » du SVG).
  const toUser = useCallback(
    (clientX, clientY) => {
      const matrix = svgRef.current?.getScreenCTM()
      if (!matrix) return null
      const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
      return { x: point.x, y: point.y }
    },
    [svgRef],
  )

  const zoomAt = useCallback(
    (factor, anchor) => setView(zoomView(viewRef.current, base, factor, anchor)),
    [base, setView],
  )
  const zoomAtCenter = useCallback(
    (factor) => {
      const view = viewRef.current
      zoomAt(factor, { x: view.x + view.w / 2, y: view.y + view.h / 2 })
    },
    [zoomAt],
  )
  const reset = useCallback(() => setView(base), [base, setView])
  const centerOnPoint = useCallback(
    (x, y) => setView(centerOn(viewRef.current, base, x, y)),
    [base, setView],
  )

  // Molette : écouteur natif non passif, sinon la page défile en même temps (React enregistre onWheel en passif).
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return undefined
    const onWheel = (event) => {
      event.preventDefault()
      const anchor = toUser(event.clientX, event.clientY)
      if (!anchor) return
      const pixels = event.deltaMode === 1 ? event.deltaY * WHEEL_LINE_HEIGHT_PX : event.deltaY
      zoomAt(Math.exp(-pixels * WHEEL_SENSITIVITY), anchor)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [svgRef, toUser, zoomAt])

  const isZoomed = () => zoomLevel(viewRef.current, base) > ZOOMED_THRESHOLD

  const measurePinch = () => {
    const [first, second] = [...pointers.current.values()]
    return {
      distance: Math.hypot(first.x - second.x, first.y - second.y),
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    }
  }

  const onPointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    svgRef.current.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2) pinch.current = measurePinch()
  }

  const onPointerMove = (event) => {
    const previous = pointers.current.get(event.pointerId)
    if (!previous) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const scale = svgRef.current.getScreenCTM()?.a
    if (!scale) return

    if (pointers.current.size === 1 && isZoomed()) {
      onManualPan?.()
      setView(panView(viewRef.current, base, (previous.x - event.clientX) / scale, (previous.y - event.clientY) / scale))
    } else if (pointers.current.size === 2 && pinch.current) {
      const now = measurePinch()
      const anchor = toUser(now.x, now.y)
      if (anchor && pinch.current.distance > 0) {
        const zoomed = zoomView(viewRef.current, base, now.distance / pinch.current.distance, anchor)
        setView(panView(zoomed, base, (pinch.current.x - now.x) / scale, (pinch.current.y - now.y) / scale))
      }
      pinch.current = now
    }
  }

  const onPointerEnd = (event) => {
    pointers.current.delete(event.pointerId)
    pinch.current = null
  }

  const onKeyDown = (event) => {
    const view = viewRef.current
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    if (event.key === '+' || event.key === '=') zoomAtCenter(BUTTON_ZOOM_FACTOR)
    else if (event.key === '-') zoomAtCenter(1 / BUTTON_ZOOM_FACTOR)
    else if (event.key === '0') reset()
    else if (arrows[event.key] && isZoomed()) {
      onManualPan?.()
      const [dx, dy] = arrows[event.key]
      setView(panView(view, base, dx * view.w * KEY_PAN_RATIO, dy * view.h * KEY_PAN_RATIO))
    } else return
    event.preventDefault()
  }

  return {
    base,
    viewRef,
    zoom,
    setView,
    zoomAtCenter,
    reset,
    centerOnPoint,
    buttonZoomFactor: BUTTON_ZOOM_FACTOR,
    // Écran tactile : tant que la vue n'est pas zoomée, le doigt fait défiler la page.
    touchAction: zoom > ZOOMED_THRESHOLD ? 'none' : 'pan-y',
    handlers: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd, onKeyDown },
  }
}
