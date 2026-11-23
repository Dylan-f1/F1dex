'use client'

import { useState } from 'react'
import {
  bestLapSeconds,
  buildChartRange,
  cleanLaps,
  compareDrivers,
  findFastestPoint,
} from '@/lib/lap-duel'
import { formatDecimal, formatLapTime } from '@/lib/format'
import LapChart from './LapChart'

const SELECT_CLASS =
  'min-w-0 flex-1 border border-line bg-bg px-2.5 py-2 text-[15px] text-ink focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-fastest'

function DriverSelect({ label, value, drivers, onChange }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className={SELECT_CLASS}
    >
      {drivers.map((driver) => (
        <option key={driver.number} value={driver.number}>
          {driver.code} {driver.lastName}
        </option>
      ))}
    </select>
  )
}

// Légende du graphique : une ligne par pilote (tiretée si les deux sont de la même écurie).
function DuelLegend({ first, second, showFastestLap }) {
  const sameColour = first.colour === second.colour
  return (
    <ul aria-label="Légende du graphique" className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-mute">
      {[first, second].map((driver, index) => (
        <li key={index} className="flex items-center gap-1.5">
          <span
            className={`block w-5 ${index === 1 && sameColour ? 'border-t-2 border-dashed' : 'border-t-[3px]'}`}
            style={{ borderColor: `#${driver.colour}` }}
          />
          {driver.code} {driver.lastName}
        </li>
      ))}
      {showFastestLap && (
        <li className="flex items-center gap-1.5">
          <span className="block size-3 rounded-full bg-fastest" />
          Meilleur tour de la course
        </li>
      )}
    </ul>
  )
}

function buildVerdict(first, second, comparison) {
  if (first.number === second.number) return 'Même pilote des deux côtés.'
  if (!comparison.isReliable) {
    return `Seulement ${comparison.comparedLaps} tours comparables : pas de verdict.`
  }
  const faster = comparison.meanGapSeconds > 0 ? first : second
  const gap = formatDecimal(Math.abs(comparison.meanGapSeconds), 2)
  return `${faster.code} plus rapide de ${gap} s par tour en moyenne, sur ${comparison.comparedLaps} tours comparés.`
}

function describeBestLap(driver) {
  const best = bestLapSeconds(driver)
  return `${driver.code}, meilleur tour ${best != null ? formatLapTime(best) : 'n.c.'}.`
}

function describeClipped(clippedCount) {
  if (!clippedCount) return ''
  const plural = clippedCount > 1 ? 's' : ''
  return ` ${clippedCount} tour${plural} très lent${plural} écrêté${plural} en haut du graphique.`
}

export default function DuelPanel({ drivers, fastestLap, totalLaps }) {
  const selectable = drivers.filter((driver) => cleanLaps(driver).length)
  const [firstNumber, setFirstNumber] = useState(selectable[0]?.number)
  const [secondNumber, setSecondNumber] = useState((selectable[1] ?? selectable[0])?.number)

  const first = selectable.find((driver) => driver.number === firstNumber)
  const second = selectable.find((driver) => driver.number === secondNumber)
  const range = first && second ? buildChartRange([...cleanLaps(first), ...cleanLaps(second)]) : null

  return (
    <aside className="bg-panel px-[18px] pt-[18px] pb-5 min-[1001px]:sticky min-[1001px]:top-14">
      <h2 className="mb-3 font-display text-[30px] leading-none font-extrabold uppercase italic">
        Duel de rythme
      </h2>
      {!first || !second || !range ? (
        <p className="text-mute">Pas assez de tours propres pour comparer des pilotes.</p>
      ) : (
        <>
          <div className="mb-3 flex gap-2">
            <DriverSelect label="Premier pilote" value={firstNumber} drivers={selectable} onChange={setFirstNumber} />
            <DriverSelect label="Second pilote" value={secondNumber} drivers={selectable} onChange={setSecondNumber} />
          </div>
          <LapChart first={first} second={second} range={range} totalLaps={totalLaps} fastestLap={fastestLap} />
          <DuelLegend
            first={first}
            second={second}
            showFastestLap={Boolean(findFastestPoint(first, second, fastestLap))}
          />
          <p className="mt-3 leading-[1.45]">
            {describeBestLap(first)} {describeBestLap(second)}{' '}
            {buildVerdict(first, second, compareDrivers(first, second))} Le premier tour et les tours
            d’entrée et de sortie des stands sont exclus.{describeClipped(range.clippedCount)}
          </p>
        </>
      )}
    </aside>
  )
}
