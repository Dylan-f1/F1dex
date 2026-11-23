// Bandeau « lower third » de la retransmission : nom en blanc incliné, détails à droite.
// `action` : un contrôle optionnel (ex. l'étoile de favori) aligné à droite du panneau.
export default function LowerThird({ title, headline, details, action }) {
  return (
    <div className="mt-5 flex flex-wrap items-stretch">
      <h1 className="relative z-10 -mr-[30px] bg-white py-2.5 pr-16 pb-3 pl-[22px] font-display text-[clamp(48px,7.5vw,96px)] leading-[.95] font-extrabold text-bg uppercase italic [clip-path:polygon(0_0,100%_0,calc(100%_-_30px)_100%,0_100%)]">
        {title}
      </h1>
      <div className="flex min-w-60 items-center gap-4 bg-panel py-3 pr-4 pl-11 md:pl-12">
        <div className="flex flex-col justify-center">
          <strong className="font-display text-[28px] font-bold">{headline}</strong>
          <span className="text-mute">{details}</span>
        </div>
        {action}
      </div>
    </div>
  )
}
