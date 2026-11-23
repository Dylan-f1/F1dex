import { formatDecimal, formatLapTime, formatTemperatureRange } from '@/lib/format'

function Fact({ label, value, isFastestLap = false }) {
  return (
    <div className={`min-w-[130px] bg-panel px-4 pt-2 pb-[9px] ${isFastestLap ? 'border-l-4 border-fastest' : ''}`}>
      <dt className="text-[13px] text-mute">{label}</dt>
      <dd className="font-display text-2xl leading-[1.1] font-bold">{value}</dd>
    </div>
  )
}

export default function RaceFacts({ weather, fastestLap }) {
  return (
    <dl className="flex flex-wrap gap-[3px]">
      {weather && (
        <>
          <Fact label="Piste" value={formatTemperatureRange(weather.trackMin, weather.trackMax)} />
          <Fact label="Air" value={formatTemperatureRange(weather.airMin, weather.airMax)} />
          <Fact label="Conditions" value={weather.rain ? 'Pluie' : 'Sec'} />
          <Fact label="Vent maxi" value={`${formatDecimal(weather.windMax)} m/s`} />
        </>
      )}
      {fastestLap && (
        <Fact
          label={`Meilleur tour, ${fastestLap.code}`}
          value={formatLapTime(fastestLap.seconds)}
          isFastestLap
        />
      )}
    </dl>
  )
}
