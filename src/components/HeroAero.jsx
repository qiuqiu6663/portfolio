import { lazy, memo, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import ResponsiveImage from './ResponsiveImage.jsx'
import BackgroundBoundary from './BackgroundBoundary.jsx'
import { useRenderBudget } from '../render-budget.js'
import './hero-aero.css'

const AeroShards = lazy(() => import('./AeroShards.jsx'))

function HeroAero() {
  const rootRef = useRef(null)
  const budget = useRenderBudget()
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  const [start, setStart] = useState(false)
  const [dpr, setDpr] = useState(1)
  const onReady = useCallback(() => setReady(true), [])
  const onError = useCallback(() => { setFailed(true); setReady(false) }, [])

  useEffect(() => { if (budget.still) setReady(false) }, [budget.still])

  useEffect(() => {
    if (budget.still) return
    // Paint the poster and DOM opening before downloading the GPU runtime.
    if ('requestIdleCallback' in window) {
      const idle = requestIdleCallback(() => setStart(true), { timeout: 700 })
      return () => cancelIdleCallback(idle)
    }
    const timer = setTimeout(() => setStart(true), 120)
    return () => clearTimeout(timer)
  }, [budget.still])

  useEffect(() => {
    const resize = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setDpr(Math.max(.5, Math.min(devicePixelRatio || 1, budget.dpr, Math.sqrt(budget.heroPixels / Math.max(1, width * height)))))
    })
    resize.observe(rootRef.current)
    return () => resize.disconnect()
  }, [budget])

  const live = start && !failed && !budget.still
  return <div ref={rootRef} className="hero-media hero-aero" aria-hidden="true" data-budget={budget.name} data-status={!live ? 'fallback' : ready ? 'ready' : 'loading'}>
    <ResponsiveImage className="hero-aero-fallback" src="/media/hero-aero-fallback.png" alt="" layout="hero" loading="eager" fetchPriority="high" />
    {live && <BackgroundBoundary onError={onError}><Suspense fallback={null}><AeroShards
      shardColor="#3b82f6" accentColor="#0300b9" placement="full" material="glass" markers="plus"
      count={budget.shards} depthOfField={0.7} vignette={0.34}
      mouseInteraction pulseOnClick holdToGather grain={0}
      maxFps={budget.fps} dpr={dpr} onReady={onReady} onError={onError}
    /></Suspense></BackgroundBoundary>}
  </div>
}
export default memo(HeroAero)
