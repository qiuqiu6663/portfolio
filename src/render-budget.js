import { useSyncExternalStore } from 'react'

const base = {
  desktop: { heroPixels: 1350000, particlePixels: 1000000, dpr: 1.25, shards: 1300, particles: 450, fps: 60 },
  tablet: { heroPixels: 650000, particlePixels: 500000, dpr: 1, shards: 850, particles: 300, fps: 30 },
  phone: { heroPixels: 350000, particlePixels: 300000, dpr: 1, shards: 600, particles: 220, fps: 30 },
}
const budgets = Object.fromEntries(Object.entries(base).flatMap(([name, value]) => [[name, { ...value, name }], [`${name}-still`, { ...value, name: `${name}-still`, still: true }]]))
const touch = window.matchMedia('(pointer: coarse)')
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
const subscribers = new Set()
let frame = 0
function snapshot() {
  const name = innerWidth < 700 ? 'phone' : touch.matches || innerWidth < 1100 ? 'tablet' : 'desktop'
  return name + (reduced.matches || navigator.connection?.saveData ? '-still' : '')
}
let current = snapshot()
function update() {
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    const next = snapshot()
    if (next !== current) { current = next; subscribers.forEach(notify => notify()) }
  })
}
function subscribe(notify) {
  subscribers.add(notify)
  if (subscribers.size === 1) {
    current = snapshot()
    window.addEventListener('resize', update, { passive: true })
    touch.addEventListener('change', update)
    reduced.addEventListener('change', update)
    navigator.connection?.addEventListener('change', update)
  }
  return () => {
    subscribers.delete(notify)
    if (!subscribers.size) {
      cancelAnimationFrame(frame); frame = 0
      window.removeEventListener('resize', update)
      touch.removeEventListener('change', update)
      reduced.removeEventListener('change', update)
      navigator.connection?.removeEventListener('change', update)
    }
  }
}
export function useRenderBudget() {
  return budgets[useSyncExternalStore(subscribe, () => current)]
}
