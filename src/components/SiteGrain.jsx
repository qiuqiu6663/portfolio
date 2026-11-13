import { useEffect, useRef } from 'react'
import './site-grain.css'

export default function SiteGrain() {
  const ref = useRef(null)
  useEffect(() => {
    let heroBottom = 0
    let frame = 0
    let previous = -1
    const update = () => {
      frame = 0
      const next = Math.max(0, Math.min(innerHeight, heroBottom - scrollY))
      if (next === previous) return
      previous = next
      ref.current.style.setProperty('--grain-exclude-top', `${next}px`)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    const hero = document.getElementById('home')
    const resize = new ResizeObserver(() => { heroBottom = hero.getBoundingClientRect().bottom + scrollY; schedule() })
    resize.observe(hero)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    return () => { cancelAnimationFrame(frame); resize.disconnect(); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule) }
  }, [])
  return <div ref={ref} className="site-grain" aria-hidden="true" />
}
