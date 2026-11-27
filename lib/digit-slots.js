// Chiffres à largeur fixe pour les valeurs qui défilent (chrono, vitesse, écart). Saira n'a pas de chiffres
// tabulaires : `tabular-nums` est sans effet, et un « 1 » est bien plus étroit qu'un « 8 ». Chaque chiffre est donc
// posé dans une case de la largeur du plus large (0,49 em), centré. La ponctuation garde sa largeur : elle ne change pas.

export const SLOT_CLASS = 'inline-block w-[0.49em] text-center'

// Les signes de l'écart prennent aussi une case : « + » et « − » n'ont pas la même largeur.
const SLOTTED = /[0-9+−]/

export function splitSlots(text) {
  return [...text].map((char) => ({ char, className: SLOTTED.test(char) ? SLOT_CLASS : '' }))
}

// Même découpage écrit directement dans le DOM, pour un chrono rafraîchi à chaque image sans rendu React.
// Les cases existantes sont réutilisées : seuls les caractères qui changent sont réécrits.
export function writeSlots(element, text) {
  const slots = splitSlots(text)
  slots.forEach(({ char, className }, index) => {
    let box = element.children[index]
    if (!box) {
      box = element.ownerDocument.createElement('span')
      element.append(box)
    }
    if (box.className !== className) box.className = className
    if (box.textContent !== char) box.textContent = char
  })
  while (element.children.length > slots.length) element.children[element.children.length - 1].remove()
}
