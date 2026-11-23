import Link from 'next/link'
import { formatDateShort } from '@/lib/format'

export default function Ribbon({ calendar, currentSessionKey }) {
  return (
    <ol aria-label="Calendrier de la saison" className="flex gap-[3px] overflow-x-auto pt-3.5 pb-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {calendar.map((race) => {
        const isCurrent = race.sessionKey === currentSessionKey
        return (
          <li key={race.sessionKey} className="shrink-0">
            <Link
              href={`/gp/${race.sessionKey}`}
              aria-current={isCurrent ? 'page' : undefined}
              className="group block min-w-[78px] bg-panel px-[9px] pt-[5px] pb-1.5 text-[13px] leading-[1.15] text-mute hover:bg-white hover:text-bg aria-[current=page]:bg-white aria-[current=page]:text-bg focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-fastest"
            >
              <b className="block font-display text-[15px] font-bold text-ink group-hover:text-bg group-aria-[current=page]:text-bg">
                {race.circuit}
              </b>
              {formatDateShort(race.date)}
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
