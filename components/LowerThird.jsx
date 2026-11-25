// Bandeau « lower third » de la retransmission : nom en blanc incliné, détails à droite.
// `action` : un contrôle optionnel (ex. l'étoile de favori) aligné à droite du panneau.
// `compact` : sur téléphone, une seule ligne basse, sans la phrase de détails, pour laisser la place au contenu.
const COMPACT = {
  frame: 'compact:mt-3 compact:flex-nowrap',
  title: 'compact:-mr-[18px] compact:py-1 compact:pr-9 compact:pl-3 compact:text-[34px] compact:[clip-path:polygon(0_0,100%_0,calc(100%_-_18px)_100%,0_100%)]',
  panel: 'compact:min-w-0 compact:flex-1 compact:py-1 compact:pl-8',
  headline: 'compact:text-[20px]',
  details: 'compact:hidden',
}

export default function LowerThird({ title, headline, details, action, compact = false }) {
  const small = compact ? COMPACT : {}
  return (
    <div className={`mt-5 flex flex-wrap items-stretch ${small.frame ?? ''}`}>
      <h1 className={`relative z-10 -mr-[30px] bg-white py-2.5 pr-16 pb-3 pl-[22px] font-display text-[clamp(48px,7.5vw,96px)] leading-[.95] font-extrabold text-bg uppercase italic [clip-path:polygon(0_0,100%_0,calc(100%_-_30px)_100%,0_100%)] ${small.title ?? ''}`}>
        {title}
      </h1>
      <div className={`flex min-w-60 items-center gap-4 bg-panel py-3 pr-4 pl-11 md:pl-12 ${small.panel ?? ''}`}>
        <div className="flex flex-col justify-center">
          <strong className={`font-display text-[28px] font-bold ${small.headline ?? ''}`}>{headline}</strong>
          <span className={`text-mute ${small.details ?? ''}`}>{details}</span>
        </div>
        {action}
      </div>
    </div>
  )
}
