import { memo } from 'react'

// Tailles voulues à l'écran, en pixels. `unit` = unités du tracé par pixel (1 / (échelle × zoom)) :
// tout ce qui est dessiné en pixels est multiplié par `unit`, donc garde la même taille à tous les zooms.
const LABEL_PX = 13
const SECTOR_TICK_HALF_PX = 12
const SECTOR_PILL = { halfWidth: 14, halfHeight: 9, skew: 3, fontSize: 12 }

function SectorPill({ label, unit }) {
  const { halfWidth, halfHeight, skew, fontSize } = SECTOR_PILL
  const points = [
    [-halfWidth + skew, -halfHeight],
    [halfWidth + skew, -halfHeight],
    [halfWidth - skew, halfHeight],
    [-halfWidth - skew, halfHeight],
  ]
    .map(([x, y]) => `${x * unit},${y * unit}`)
    .join(' ')
  return (
    <g transform={`translate(${label.x} ${label.y})`}>
      <polygon points={points} className="fill-ink" />
      <text
        fontSize={fontSize * unit}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-bg font-display font-extrabold italic"
      >
        S{label.number}
      </text>
    </g>
  )
}

// Couche fixe du circuit : piste, traits de secteur, numéros de virage, pastilles. Mémorisée : elle ne
// se redessine que si le zoom ou la taille du cadre changent, pas à chaque image de l'animation.
function TrackLayers({ track, sectorMarks, unit }) {
  return (
    <>
      <path
        d={track.path}
        fill="none"
        className="stroke-line [vector-effect:non-scaling-stroke]"
        strokeWidth="11"
        strokeLinejoin="round"
      />
      <path
        d={track.path}
        fill="none"
        className="stroke-ink [vector-effect:non-scaling-stroke]"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      {sectorMarks?.boundaries.map((boundary, index) => (
        <line
          key={index}
          x1={boundary.x}
          y1={boundary.y - SECTOR_TICK_HALF_PX * unit}
          x2={boundary.x}
          y2={boundary.y + SECTOR_TICK_HALF_PX * unit}
          transform={`rotate(${boundary.headingDegrees} ${boundary.x} ${boundary.y})`}
          className="stroke-ink [vector-effect:non-scaling-stroke]"
          strokeWidth="2"
        />
      ))}
      <g aria-hidden="true" className="fill-mute font-display font-bold">
        {track.corners.map((corner, index) => (
          <text
            // Les données peuvent répéter un numéro (Hungaroring : deux virages « 1 »).
            key={`${corner.number}-${index}`}
            x={corner.label.x}
            y={corner.label.y}
            fontSize={LABEL_PX * unit}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {corner.number}
          </text>
        ))}
      </g>
      {sectorMarks?.labels.map((label) => (
        <SectorPill key={label.number} label={label} unit={unit} />
      ))}
    </>
  )
}

export default memo(TrackLayers)
