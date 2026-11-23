'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { formatLapTime } from '@/lib/format'
import { bestLapOf, positionAt, sectorIndexAt } from '@/lib/replay'
import { zoomLevel } from '@/lib/viewport'
import { PlaybackBar, ReplayPickers, SectorTimes, ZoomBar } from './ReplayControls'
import TrackLayers from './TrackLayers'
import { useLapReplay } from './use-lap-replay'
import { useElementSize, useMapViewport } from './use-map-viewport'

// Taille du cadre avant mesure : identique côté serveur et au premier rendu client (pas de décalage).
const DEFAULT_FRAME = { width: 380, height: 300 }
const FOLLOW_ZOOM = 4
const DEFAULT_SPEED = 2
const CAR_RADIUS_PX = 6
const CAR_LABEL_PX = 12

// Le panneau de chargement a la même hauteur que le panneau réel : rien ne bouge à l'arrivée du tracé.
const PANEL = 'flex flex-col gap-2.5 bg-panel px-4 pt-2 pb-4'
const PANEL_HEIGHT_CLASS = 'min-h-[620px]'

export function TrackMapFallback() {
  return <div aria-hidden="true" className={`${PANEL} ${PANEL_HEIGHT_CLASS}`} />
}

function StatusMessage({ status, onRetry }) {
  if (status === 'ready' || status === 'idle') return null
  const messages = {
    loading: 'Chargement du tour depuis OpenF1…',
    empty: 'OpenF1 n’a pas de positions pour ce tour.',
    error: 'Impossible de charger ce tour.',
  }
  return (
    <p
      role="status"
      className="pointer-events-none absolute inset-x-0 bottom-2 flex items-center justify-center gap-3 text-[14px] text-mute"
    >
      <span className="bg-panel/90 px-2 py-1">{messages[status]}</span>
      {status === 'error' && (
        <button
          type="button"
          onClick={onRetry}
          className="pointer-events-auto border border-line bg-bg px-2.5 py-1 text-ink focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-fastest"
        >
          Réessayer
        </button>
      )}
    </p>
  )
}

export default function TrackMap({ track, circuit, sectorMarks, fastestLap, drivers = [], sessionKey }) {
  const svgRef = useRef(null)
  const [following, setFollowing] = useState(false)
  const followRef = useRef(false)
  const stopFollowing = useCallback(() => {
    followRef.current = false
    setFollowing(false)
  }, [])
  // Un déplacement à la main (glisser, flèches) coupe le suivi de la voiture.
  const viewport = useMapViewport(svgRef, track.viewBox, stopFollowing)
  const { base, viewRef, zoom, setView, centerOnPoint } = viewport
  const frame = useElementSize(svgRef, DEFAULT_FRAME)
  const unit = 1 / (Math.min(frame.width / base.w, frame.height / base.h) * zoom)

  // --- Sélection : pilote par défaut = auteur du meilleur tour de la course, tour par défaut = son meilleur.
  const replayDrivers = drivers.filter((driver) => driver.laps.length > 0)
  const hasReplay = replayDrivers.length > 0
  const [driverNumber, setDriverNumber] = useState(() =>
    replayDrivers.some((driver) => driver.number === fastestLap?.number) ? fastestLap.number : replayDrivers[0]?.number,
  )
  const driver = replayDrivers.find((candidate) => candidate.number === driverNumber) ?? replayDrivers[0]
  const [lapChoice, setLapChoice] = useState(() => (fastestLap?.lap ?? null))
  const bestLap = driver ? bestLapOf(driver.laps) : null
  const lapNumber = driver?.laps.some((lap) => lap.lap === lapChoice) ? lapChoice : bestLap?.lap

  const { status, replay, retry } = useLapReplay({
    sessionKey,
    driverNumber: hasReplay ? driver.number : null,
    lapNumber: hasReplay ? lapNumber : null,
    rotation: track.rotation,
  })
  const durationMs = replay ? replay.seconds * 1000 : (driver?.laps.find((lap) => lap.lap === lapNumber)?.seconds ?? 0) * 1000

  // --- Lecture : tout ce qui change à chaque image passe par des refs, pas par l'état React.
  const [playing, setPlaying] = useState(false)
  const [finished, setFinished] = useState(false)
  const [speed, setSpeed] = useState(DEFAULT_SPEED)
  const timeRef = useRef(0)
  const carRef = useRef(null)
  const clockRef = useRef(null)
  const sliderRef = useRef(null)
  const sectorCellRefs = useRef([])

  const paint = useCallback(
    (ms) => {
      const position = replay ? positionAt(replay.points, ms) : null
      if (carRef.current) {
        carRef.current.setAttribute('visibility', position ? 'visible' : 'hidden')
        if (position) carRef.current.setAttribute('transform', `translate(${position.x} ${position.y})`)
      }
      if (clockRef.current) clockRef.current.textContent = formatLapTime(ms / 1000)
      if (sliderRef.current) sliderRef.current.value = String(Math.round(ms))
      const active = replay ? sectorIndexAt(replay.sectors, ms) : null
      sectorCellRefs.current.forEach((cell, index) => cell && (cell.dataset.active = String(index === active)))
      if (position && followRef.current) centerOnPoint(position.x, position.y)
    },
    [replay, centerOnPoint],
  )

  // Nouveau tour chargé : retour au début.
  useEffect(() => {
    timeRef.current = 0
    paint(0)
  }, [paint])

  // Boucle d'animation : le temps avance au rythme réel × la vitesse choisie.
  useEffect(() => {
    if (!playing || !replay) return undefined
    let last = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      timeRef.current = Math.min(durationMs, timeRef.current + (now - last) * speed)
      last = now
      paint(timeRef.current)
      if (timeRef.current >= durationMs) {
        setPlaying(false)
        setFinished(true)
        return
      }
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing, replay, speed, durationMs, paint])

  const resetPlayback = () => {
    setPlaying(false)
    setFinished(false)
    timeRef.current = 0
  }
  const onDriverChange = (number) => {
    const next = replayDrivers.find((candidate) => candidate.number === number)
    resetPlayback()
    setDriverNumber(number)
    setLapChoice(bestLapOf(next.laps)?.lap ?? null)
  }
  const onLapChange = (lap) => {
    resetPlayback()
    setLapChoice(lap)
  }
  const onPlayToggle = () => {
    if (playing) return setPlaying(false)
    if (finished || timeRef.current >= durationMs) {
      timeRef.current = 0
      setFinished(false)
    }
    setPlaying(true)
  }
  const onSeek = (ms) => {
    timeRef.current = ms
    setFinished(false)
    paint(ms)
  }
  const onFollowToggle = () => {
    const next = !followRef.current
    followRef.current = next
    setFollowing(next)
    if (!next) return
    const position = replay ? positionAt(replay.points, timeRef.current) : null
    if (position && zoomLevel(viewRef.current, base) < FOLLOW_ZOOM) {
      setView({ ...viewRef.current, w: base.w / FOLLOW_ZOOM, h: base.h / FOLLOW_ZOOM })
    }
    paint(timeRef.current)
  }
  const onReset = () => {
    stopFollowing()
    viewport.reset()
  }

  const playLabel = playing ? 'Pause' : finished ? 'Rejouer' : 'Lecture'
  const driverColour = driver ? `#${driver.colour}` : undefined

  return (
    <figure className={`${PANEL} ${hasReplay ? PANEL_HEIGHT_CLASS : ''}`}>
      <figcaption className="text-[13px] text-mute">
        Tracé{track.corners.length > 0 ? `, ${track.corners.length} virages` : ''}
        {hasReplay && ', lecteur de tour'}
      </figcaption>

      {hasReplay && (
        <ReplayPickers
          drivers={replayDrivers}
          driver={driver}
          lapNumber={lapNumber}
          bestLap={bestLap}
          onDriverChange={onDriverChange}
          onLapChange={onLapChange}
        />
      )}

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={track.viewBox}
          role="group"
          aria-label={`Carte du circuit de ${circuit}${sectorMarks ? ', trois secteurs' : ''}. Zoom : plus et moins, déplacement : flèches, zéro pour tout voir.`}
          tabIndex={0}
          style={{ touchAction: viewport.touchAction }}
          className="h-[300px] w-full cursor-grab select-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-fastest active:cursor-grabbing"
          {...viewport.handlers}
        >
          <TrackLayers track={track} sectorMarks={sectorMarks} unit={unit} />
          {hasReplay && (
            <g ref={carRef} visibility="hidden" aria-hidden="true">
              <circle
                r={CAR_RADIUS_PX * unit}
                fill={driverColour}
                className="stroke-ink [vector-effect:non-scaling-stroke]"
                strokeWidth="2"
              />
              <text
                x={(CAR_RADIUS_PX + 5) * unit}
                y={-(CAR_RADIUS_PX + 3) * unit}
                fontSize={CAR_LABEL_PX * unit}
                paintOrder="stroke"
                strokeWidth="3"
                className="fill-ink stroke-bg font-display font-extrabold [vector-effect:non-scaling-stroke]"
              >
                {driver.code}
              </text>
            </g>
          )}
        </svg>
        <StatusMessage status={status} onRetry={retry} />
      </div>

      <ZoomBar
        zoom={zoom}
        isFollowing={following}
        canFollow={hasReplay}
        onZoomIn={() => viewport.zoomAtCenter(viewport.buttonZoomFactor)}
        onZoomOut={() => viewport.zoomAtCenter(1 / viewport.buttonZoomFactor)}
        onReset={onReset}
        onFollowToggle={onFollowToggle}
      />

      {hasReplay && (
        <>
          <PlaybackBar
            durationMs={durationMs}
            playLabel={playLabel}
            isReady={status === 'ready'}
            speed={speed}
            onPlayToggle={onPlayToggle}
            onSpeedChange={setSpeed}
            onSeek={onSeek}
            clockRef={clockRef}
            sliderRef={sliderRef}
          />
          <SectorTimes sectors={replay?.sectors ?? null} cellRefs={sectorCellRefs} />
        </>
      )}
    </figure>
  )
}
