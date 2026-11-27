import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatDelta, formatLapTime as formatDriveTime } from '../lib/car-drive.js'
import { SLOT_CLASS, splitSlots, writeSlots } from '../lib/digit-slots.js'

const boxed = (text) => splitSlots(text).map(({ className }) => (className === SLOT_CLASS ? 'x' : '.')).join('')

test('splitSlots : une case par chiffre et par signe, la ponctuation garde sa largeur', () => {
  assert.equal(boxed(formatDriveTime(83.4567)), 'x.xx.xxx') // 1:23.457
  assert.equal(boxed(formatDelta(0.312)), 'xx.xxx') // +0.312
  assert.equal(boxed(formatDelta(-1.5)), 'xx.xxx') // −1.500
  assert.equal(boxed('–'), '.')
  assert.equal(splitSlots('1:23.457').map(({ char }) => char).join(''), '1:23.457')
})

// Élément minimal : juste ce que writeSlots utilise, avec un compteur des réécritures.
function fakeElement() {
  const element = { children: [], writes: 0 }
  element.ownerDocument = {
    createElement() {
      let content = ''
      const box = {
        className: '',
        get textContent() {
          return content
        },
        set textContent(value) {
          content = value
          element.writes += 1
        },
        remove: () => element.children.splice(element.children.indexOf(box), 1),
      }
      return box
    },
  }
  element.append = (box) => element.children.push(box)
  element.text = () => element.children.map((box) => box.textContent).join('')
  return element
}

test('writeSlots : réutilise les cases et ne réécrit que ce qui change', () => {
  const clock = fakeElement()
  writeSlots(clock, '0:00.000') // format du chrono de replay
  assert.equal(clock.text(), '0:00.000')
  const boxes = [...clock.children]
  clock.writes = 0
  writeSlots(clock, '0:00.001')
  assert.equal(clock.text(), '0:00.001')
  assert.equal(clock.writes, 1)
  assert.deepEqual(clock.children, boxes)
})

test('writeSlots : texte plus long ou plus court', () => {
  const clock = fakeElement()
  writeSlots(clock, '9:59.999')
  writeSlots(clock, '10:00.000')
  assert.equal(clock.text(), '10:00.000')
  assert.equal(clock.children[1].className, SLOT_CLASS) // le « : » est devenu un chiffre
  writeSlots(clock, '0:01.000')
  assert.equal(clock.text(), '0:01.000')
  assert.equal(clock.children.length, 8)
  assert.equal(clock.children[1].className, '')
})
