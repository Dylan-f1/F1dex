import { cleanLaps, findFastestPoint } from '@/lib/lap-duel'
import { formatLapTime } from '@/lib/format'

const CHART_WIDTH = 400
const CHART_HEIGHT = 240
const MARGIN = { left: 56, right: 10, top: 12, bottom: 26 }
const Y_TICK_COUNT = 4
const X_TICK_STEP_LAPS = 10
const FIRST_CHARTED_LAP = 2
const LINE_WIDTH = 2.4

// Une ligne se coupe quand un tour est exclu (arrêt, premier tour) : pas de trait trompeur.
function buildLinePath(laps, toX, toY) {
  let path = ''
  let previousLap = -Infinity
  for (const { lap, seconds } of laps) {
    const command = lap === previousLap + 1 ? 'L' : 'M'
    path += `${command}${toX(lap).toFixed(1)} ${toY(seconds).toFixed(1)}`
    previousLap = lap
  }
  return path
}

export default function LapChart({ first, second, range, totalLaps, fastestLap }) {
  const plotWidth = CHART_WIDTH - MARGIN.left - MARGIN.right
  const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom
  const toX = (lap) => MARGIN.left + ((lap - FIRST_CHARTED_LAP) / (totalLaps - FIRST_CHARTED_LAP)) * plotWidth
  const toY = (seconds) =>
    MARGIN.top + (1 - (Math.min(seconds, range.max) - range.min) / (range.max - range.min)) * plotHeight

  const yTicks = Array.from({ length: Y_TICK_COUNT }, (_, index) => {
    const seconds = range.min + ((range.max - range.min) * index) / (Y_TICK_COUNT - 1)
    return { seconds, y: toY(seconds) }
  })
  const xTicks = []
  for (let lap = X_TICK_STEP_LAPS; lap <= totalLaps; lap += X_TICK_STEP_LAPS) xTicks.push(lap)

  const firstLaps = cleanLaps(first)
  const secondLaps = cleanLaps(second)
  const sameColour = first.colour === second.colour
  const fastestPoint = findFastestPoint(first, second, fastestLap)

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      role="img"
      aria-label={`Temps au tour de ${first.code} et ${second.code}`}
      className="block h-auto w-full"
    >
      {yTicks.map(({ seconds, y }) => (
        <g key={seconds}>
          <line x1={MARGIN.left} x2={CHART_WIDTH - MARGIN.right} y1={y} y2={y} className="stroke-line" />
          <text x={MARGIN.left - 8} y={y + 4} textAnchor="end" className="fill-mute text-[12px]">
            {formatLapTime(seconds).slice(0, 6)}
          </text>
        </g>
      ))}
      {xTicks.map((lap) => (
        <text key={lap} x={toX(lap)} y={CHART_HEIGHT - 8} textAnchor="middle" className="fill-mute text-[12px]">
          {lap}
        </text>
      ))}
      <path
        d={buildLinePath(firstLaps, toX, toY)}
        fill="none"
        stroke={`#${first.colour}`}
        strokeWidth={LINE_WIDTH}
        strokeLinejoin="round"
      />
      <path
        d={buildLinePath(secondLaps, toX, toY)}
        fill="none"
        stroke={`#${second.colour}`}
        strokeWidth={LINE_WIDTH}
        strokeLinejoin="round"
        strokeDasharray={sameColour ? '6 4' : undefined}
      />
      {fastestPoint && (
        <circle cx={toX(fastestPoint.lap)} cy={toY(fastestPoint.seconds)} r="5.5" className="fill-fastest stroke-white">
          <title>{`Meilleur tour de la course, ${formatLapTime(fastestLap.seconds)}`}</title>
        </circle>
      )}
    </svg>
  )
}
