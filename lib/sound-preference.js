// Préférence « son du moteur » (activé par défaut), mémorisée dans le navigateur. Le stockage peut être
// indisponible (navigation privée, politique du navigateur) : le choix reste alors valable le temps de la visite.

const KEY = 'f1dex.sound' // même préfixe que les favoris et les meilleurs tours
let current = null
const listeners = new Set()

export function readSound() {
  if (current === null) {
    try {
      current = globalThis.localStorage?.getItem(KEY) !== 'off'
    } catch {
      current = true
    }
  }
  return current
}

export function writeSound(on) {
  current = on
  try {
    globalThis.localStorage?.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // choix gardé en mémoire seulement
  }
  for (const notify of listeners) notify()
}

export function subscribeSound(notify) {
  listeners.add(notify)
  return () => listeners.delete(notify)
}
