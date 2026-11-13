import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useRenderBudget } from '../render-budget.js'
import BackgroundBoundary from './BackgroundBoundary.jsx'
import './particles-background.css'

const Particles = lazy(() => import('./Particles.jsx'))
const COLORS = ['#3b82f6', '#ffffff', '#ffffff']

export default function ParticlesBackground() {
  const rootRef = useRef(null)
  const budget = useRenderBudget()
  const [visible, setVisible] = useState(false)
  const [pixelRatio, setPixelRatio] = useState(1)
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '120px 0px' })
    observer.observe(rootRef.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const resize = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setPixelRatio(Math.min(devicePixelRatio || 1, budget.dpr, Math.sqrt(budget.particlePixels / Math.max(1, width * height))))
    })
    resize.observe(rootRef.current)
    return () => resize.disconnect()
  }, [budget])
  return <div ref={rootRef} className="section-particles" aria-hidden="true" data-budget={budget.name} data-visible={visible} data-paused={Boolean(budget.still)}>
    {visible && !budget.still && <BackgroundBoundary><Suspense fallback={null}><Particles
      particleColors={COLORS} particleCount={budget.particles} particleSpread={10}
      speed={0.08} particleBaseSize={100} glow={0.5} twinkle={1}
      moveParticlesOnHover hoverEffect="attract" sizeRandomness={0.95}
      particleHoverFactor={0.85} alphaParticles cameraDistance={26} opacity={0.8}
      pixelRatio={pixelRatio} maxFps={budget.fps}
    /></Suspense></BackgroundBoundary>}
  </div>
}
