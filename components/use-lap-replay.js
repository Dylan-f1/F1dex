'use client'

import { useEffect, useState } from 'react'
import { toSvgSpace } from '@/lib/track'

// Tours déjà chargés (clé : session/pilote/tour) : revenir sur un tour est instantané.
const loadedLaps = new Map()

function toPoints(samples, rotation) {
  return samples.map(([time, x, y]) => {
    const point = toSvgSpace(x, y, rotation)
    return [time, point.x, point.y]
  })
}

// Charge les positions d'un tour depuis /api/replay. Renvoie { status, replay, retry } :
// status = 'idle' | 'loading' | 'ready' | 'empty' | 'error'. Une réponse arrivée trop tard (l'utilisateur
// a déjà changé de pilote ou de tour) est ignorée grâce à l'AbortController.
export function useLapReplay({ sessionKey, driverNumber, lapNumber, rotation }) {
  const key = driverNumber != null && lapNumber != null ? `${sessionKey}/${driverNumber}/${lapNumber}` : null
  const [result, setResult] = useState({ key: null, status: 'idle', replay: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!key || loadedLaps.has(key)) return undefined

    const controller = new AbortController()
    fetch(`/api/replay/${key}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) return setResult({ key, status: 'empty', replay: null })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        const replay = { ...data, points: toPoints(data.samples, rotation) }
        loadedLaps.set(key, replay)
        setResult({ key, status: 'ready', replay })
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setResult({ key, status: 'error', replay: null })
      })
    return () => controller.abort()
  }, [key, rotation, attempt])

  // Tant que la réponse affichée n'est pas celle du tour demandé, on est en chargement.
  const cached = key ? loadedLaps.get(key) : undefined
  let current = { status: key ? 'loading' : 'idle', replay: null }
  if (cached) current = { status: 'ready', replay: cached }
  else if (result.key === key) current = result
  const retry = () => {
    setResult({ key, status: 'loading', replay: null })
    setAttempt((count) => count + 1)
  }
  return { ...current, retry }
}
