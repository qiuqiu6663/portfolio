import { useEffect, useRef, useState } from 'react'
import './glass-project.css'
import TechHeading from './TechHeading.jsx'
import ResponsiveImage from './ResponsiveImage.jsx'

// Pointer updates stay outside React rendering. The frame loop stops as soon as
// the material settles, and never starts for touch or reduced-motion visitors.
function useGlassSurface() {
  const rootRef = useRef(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const preference = window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)')
    let frame = 0
    let lastTime = 0
    let current = { x: 0, y: 0, light: 0 }
    let target = { x: 0, y: 0, light: 0 }
    let scrollListening = false

    const stopWatchingScroll = () => {
      if (!scrollListening) return
      window.removeEventListener('scroll', reset)
      scrollListening = false
    }
    const watchScroll = () => {
      if (scrollListening) return
      window.addEventListener('scroll', reset, { passive: true })
      scrollListening = true
    }

    const paint = () => {
      root.style.setProperty('--glass-rx', `${(-current.y * 1.8).toFixed(3)}deg`)
      root.style.setProperty('--glass-ry', `${(current.x * 2.4).toFixed(3)}deg`)
      root.style.setProperty('--glass-x', `${50 + current.x * 45}%`)
      root.style.setProperty('--glass-y', `${50 + current.y * 45}%`)
      root.style.setProperty('--glass-light', current.light.toFixed(3))
    }
    const tick = time => {
      const dt = lastTime ? Math.min(time - lastTime, 50) : 16
      lastTime = time
      const ease = 1 - Math.exp(-dt / 115)
      let difference = 0
      for (const key of ['x', 'y', 'light']) {
        current[key] += (target[key] - current[key]) * ease
        difference += Math.abs(target[key] - current[key])
      }
      paint()
      if (difference > 0.002) frame = requestAnimationFrame(tick)
      else {
        current = { ...target }
        paint()
        frame = 0
        lastTime = 0
        if (!current.light) stopWatchingScroll()
      }
    }
    const start = () => { if (!frame) frame = requestAnimationFrame(tick) }
    const move = event => {
      if (!preference.matches || event.pointerType === 'touch') return
      const bounds = root.getBoundingClientRect()
      target = {
        x: Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1)),
        y: Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1)),
        light: 1,
      }
      watchScroll()
      start()
    }
    const leave = () => {
      if (!frame && !current.light && !target.light) return
      target = { x: 0, y: 0, light: 0 }
      start()
    }
    const reset = () => {
      stopWatchingScroll()
      if (!frame && !current.x && !current.y && !current.light && !target.light) return
      cancelAnimationFrame(frame)
      frame = 0
      lastTime = 0
      current = target = { x: 0, y: 0, light: 0 }
      paint()
    }
    const visibility = () => { if (document.hidden) reset() }
    root.addEventListener('pointerenter', move)
    root.addEventListener('pointermove', move, { passive: true })
    root.addEventListener('pointerleave', leave)
    root.addEventListener('pointercancel', reset)
    window.addEventListener('blur', reset)
    document.addEventListener('visibilitychange', visibility)
    preference.addEventListener('change', reset)
    return () => {
      reset()
      root.removeEventListener('pointerenter', move)
      root.removeEventListener('pointermove', move)
      root.removeEventListener('pointerleave', leave)
      root.removeEventListener('pointercancel', reset)
      window.removeEventListener('blur', reset)
      document.removeEventListener('visibilitychange', visibility)
      preference.removeEventListener('change', reset)
    }
  }, [])

  return rootRef
}

export default function GlassProjectCard({ project, featured, imageLayout = featured ? 'full' : 'half', onOpen, Arrow }) {
  const rootRef = useGlassSurface()

  return <button
    ref={rootRef}
    className={`project-card card glass-project ${featured ? 'project-featured' : ''}`}
    onClick={() => onOpen(project)}
    aria-label={`${project.title}の詳細を見る`}
    aria-haspopup="dialog"
    aria-controls="project-detail"
  >
    <div className="project-image frame glass-surface">
      <div className="project-photo-frame motion-photo-frame"><div className="motion-card-visual"><div className="motion-image-parallax"><ResponsiveImage src={project.image} alt={project.imageAlt} layout={imageLayout} data-source="Unsplash" data-subject={project.category} /></div></div></div>
      <div className="project-shade" />
      <div className="glass-reflection" aria-hidden="true" />
      <div className="project-top"><span>PROJECT {project.number}</span><span>{project.category}</span></div>
      <div className="project-bottom">
        <div><span className="project-subtitle">{project.subtitle}</span><TechHeading as="h3">{project.title}</TechHeading></div>
        <span className="project-open" aria-hidden="true"><Arrow diagonal /></span>
      </div>
    </div>
    <div className="project-meta">
      <div>{project.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
      <span>VISUAL STUDY <span className="muted">↗</span></span>
    </div>
  </button>
}

export function ProjectGlassReveal({ project }) {
  const [loaded, setLoaded] = useState(null)
  const imageSource = loaded?.project === project.id ? loaded.src : null
  return <div className="dialog-visual">
    <ResponsiveImage className="dialog-image" src={project.image} alt={project.imageAlt} layout="dialog" loading="eager" onLoad={event => setLoaded({ project: project.id, src: event.currentTarget.currentSrc })} />
    <div className="glass-fragments" aria-hidden="true">
      {imageSource && [0, 1, 2, 3, 4].map(index => <span
        key={index}
        className={`glass-fragment fragment-${index}`}
        style={{ backgroundImage: `url("${imageSource}")` }}
      />)}
    </div>
  </div>
}
