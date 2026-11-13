import { Children, isValidElement, lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import './tech-heading.css'
import { useRenderBudget } from '../render-budget.js'

const TechText = lazy(() => import('./TechText.jsx').catch(() => ({ default: () => null })))

const baselineCache = new Map()
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const context = document.createElement('canvas').getContext('2d')
const enhancementQuery = '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)'

// Parent navigation/dialog state creates new JSX objects without changing the
// heading. Only text or markup changes should invalidate its glyph geometry.
function contentSignature(children) {
  return Children.toArray(children).map(child => isValidElement(child)
    ? [typeof child.type === 'string' ? child.type : 'component', child.props.className || '', child.props.style || null, contentSignature(child.props.children)]
    : child)
}

// Canvas and CSS use different vertical origins. Measure the font's real DOM
// baseline once, so the registry component can sit exactly over the live text.
function baselineFor(style) {
  const key = [style.fontFamily, style.fontSize, style.fontWeight].join('|')
  if (baselineCache.has(key)) return baselineCache.get(key)
  const probe = document.createElement('span')
  Object.assign(probe.style, {
    position: 'absolute', visibility: 'hidden', whiteSpace: 'nowrap',
    fontFamily: style.fontFamily, fontSize: style.fontSize,
    fontWeight: style.fontWeight, lineHeight: 'normal',
  })
  const text = document.createTextNode('Hg国')
  const marker = document.createElement('i')
  Object.assign(marker.style, { display: 'inline-block', width: '0', height: '0', verticalAlign: 'baseline' })
  probe.append(text, marker)
  document.body.append(probe)
  const range = document.createRange()
  range.selectNodeContents(text)
  const baseline = marker.getBoundingClientRect().top - range.getBoundingClientRect().top
  probe.remove()
  baselineCache.set(key, baseline)
  return baseline
}

function measureRuns(copy, heading) {
  if (!context || !heading.getClientRects().length) return []
  const origin = heading.getBoundingClientRect()
  const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT)
  const runs = []
  let node
  while ((node = walker.nextNode())) {
    if (!node.textContent.trim() || node.parentElement.closest('.sr-only, [aria-hidden="true"]')) continue
    const style = getComputedStyle(node.parentElement)
    const size = parseFloat(style.fontSize)
    const spacing = parseFloat(style.letterSpacing) || 0
    const range = document.createRange()
    let line = null
    const flush = () => {
      if (!line?.text.trim()) return
      context.font = `${style.fontWeight} ${size}px ${style.fontFamily}`
      context.letterSpacing = `${spacing}px`
      const metrics = context.measureText(line.text)
      const inkWidth = metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight
      const inkHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
      // Undo TechText's own 5% margins and 66% height fit, rather than changing
      // its upstream source or giving every heading a fixed 480px demo frame.
      const width = Math.max(inkWidth, line.right - line.left, 1) / .9 + 2
      // Leave room for outline guides above/below the baseline. This is absolute
      // artwork, so its extra breathing room never changes the page layout.
      const height = Math.max(Math.max(inkHeight, 1) / .66 + 2, size * 2.4)
      const baseline = (height - inkHeight) / 2 + metrics.actualBoundingBoxAscent
      runs.push({
        text: line.text,
        left: line.left - origin.left - metrics.actualBoundingBoxLeft - width * .05,
        top: line.top - origin.top + baselineFor(style) - baseline,
        width, height, size, spacing: spacing / size,
        hitLeft: line.left - origin.left, hitRight: line.right - origin.left,
        hitTop: line.top - origin.top, hitHeight: line.height,
        fontFamily: style.fontFamily, fontWeight: Number(style.fontWeight), color: style.color,
      })
    }
    for (const { segment, index } of segmenter.segment(node.textContent)) {
      range.setStart(node, index)
      range.setEnd(node, index + segment.length)
      const rect = range.getBoundingClientRect()
      if (!rect.width || !rect.height) continue
      if (line && Math.abs(rect.top - line.top) > 1) { flush(); line = null }
      if (!line) line = { text: '', left: rect.left, right: rect.right, top: rect.top, height: rect.height }
      line.text += segment
      line.right = rect.right
    }
    flush()
  }
  return runs
}

/** Semantic, responsive typography with the unmodified React Bits visual layer. */
export default function TechHeading({ as: Heading = 'h2', children, className = '', autoSweep = false, ...props }) {
  const budget = useRenderBudget()
  const headingRef = useRef(null)
  const copyRef = useRef(null)
  const artRef = useRef(null)
  const [runs, setRuns] = useState([])
  const [visible, setVisible] = useState(false)
  const [pageVisible, setPageVisible] = useState(() => !document.hidden)
  const [ready, setReady] = useState(false)
  const [suspended, setSuspended] = useState(false)
  const [measureVersion, setMeasureVersion] = useState(0)
  const [canEnhance, setCanEnhance] = useState(() => window.matchMedia(enhancementQuery).matches)
  const contentKey = JSON.stringify(contentSignature(children))

  useLayoutEffect(() => {
    const heading = headingRef.current
    let first = 0
    let second = 0
    const stop = () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
      setSuspended(true)
      setReady(false)
    }
    const restart = () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
      first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => {
          setMeasureVersion(version => version + 1)
          setSuspended(false)
        })
      })
    }
    heading.addEventListener('portfolio:motion-start', stop)
    heading.addEventListener('portfolio:motion-end', restart)
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
      heading.removeEventListener('portfolio:motion-start', stop)
      heading.removeEventListener('portfolio:motion-end', restart)
    }
  }, [])

  useEffect(() => {
    const preference = window.matchMedia(enhancementQuery)
    const update = () => setCanEnhance(preference.matches)
    const updateVisibility = () => setPageVisible(!document.hidden)
    preference.addEventListener('change', update)
    document.addEventListener('visibilitychange', updateVisibility)
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
    observer.observe(headingRef.current)
    return () => { observer.disconnect(); preference.removeEventListener('change', update); document.removeEventListener('visibilitychange', updateVisibility) }
  }, [])

  useLayoutEffect(() => {
    if (!canEnhance || suspended || !visible || !pageVisible || budget.still) return
    let frame = 0
    let alive = true
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (!alive || headingRef.current.dataset.motionSuspended === 'true') return
        const next = measureRuns(copyRef.current, headingRef.current)
        setRuns(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
      })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(copyRef.current)
    // A dialog gets dimensions only after showModal; font completion can also
    // change glyph metrics without changing the heading's overall width.
    document.fonts?.ready.then(() => { if (alive) { baselineCache.clear(); measure() } })
    document.fonts?.addEventListener('loadingdone', measure)
    window.addEventListener('resize', measure, { passive: true })
    measure()
    return () => {
      alive = false
      cancelAnimationFrame(frame)
      observer.disconnect()
      document.fonts?.removeEventListener('loadingdone', measure)
      window.removeEventListener('resize', measure)
    }
  }, [contentKey, className, canEnhance, suspended, visible, pageVisible, budget.still, measureVersion])

  const enhanced = canEnhance && !suspended && visible && pageVisible && !budget.still && runs.length > 0
  useEffect(() => {
    if (!enhanced) return
    const heading = headingRef.current
    let active = null
    // Tall canvases overlap neighbouring lines to give outline guides room.
    // Route real pointer events by the original text boxes, so that invisible
    // canvas padding cannot steal hover/clicks from another line or a button.
    const forward = (element, type, event) => element?.dispatchEvent(new PointerEvent(type, {
      pointerId: event.pointerId, pointerType: event.pointerType, isPrimary: event.isPrimary,
      clientX: event.clientX, clientY: event.clientY, button: event.button, buttons: event.buttons,
      pressure: event.pressure, bubbles: false,
    }))
    const route = event => {
      // Drag capture delivers native events straight to the upstream component.
      if (event.target.closest?.('.tech-text')) return
      const bounds = heading.getBoundingClientRect()
      const x = event.clientX - bounds.left
      const y = event.clientY - bounds.top
      let closest = -1
      let distance = Infinity
      runs.forEach((run, index) => {
        const dx = Math.max(run.hitLeft - x, 0, x - run.hitRight)
        const dy = Math.max(run.hitTop - y, 0, y - run.hitTop - run.hitHeight)
        const next = Math.hypot(dx, dy)
        if (next < distance) { closest = index; distance = next }
      })
      const target = distance <= 24 ? artRef.current.children[closest]?.querySelector('.tech-text') : null
      if (target !== active) {
        forward(active, 'pointerleave', event)
        active = target
        forward(active, 'pointerenter', event)
      }
      forward(active, event.type, event)
    }
    const leave = event => { forward(active, 'pointerleave', event); active = null }
    const events = ['pointermove', 'pointerdown', 'pointerup', 'pointercancel']
    events.forEach(type => heading.addEventListener(type, route, { passive: true }))
    heading.addEventListener('pointerleave', leave, { passive: true })
    return () => {
      events.forEach(type => heading.removeEventListener(type, route))
      heading.removeEventListener('pointerleave', leave)
    }
  }, [enhanced, runs])

  useEffect(() => {
    setReady(false)
    if (!enhanced) return
    let frame = 0
    let timer = 0
    let attempts = 0
    // Validate actual ink before hiding the accessible DOM copy, but never read
    // an entire high-DPR title canvas back to the CPU for this readiness check.
    const sample = document.createElement('canvas')
    sample.width = 64
    sample.height = 32
    const sampleContext = sample.getContext('2d', { willReadFrequently: true })
    if (!sampleContext) return
    const check = () => {
      const canvases = [...artRef.current.querySelectorAll('canvas')]
      const painted = canvases.length === runs.length && canvases.every(canvas => {
        if (!canvas.width || !canvas.height) return false
        try {
          sampleContext.clearRect(0, 0, sample.width, sample.height)
          sampleContext.drawImage(canvas, 0, 0, sample.width, sample.height)
          const pixels = sampleContext.getImageData(0, 0, sample.width, sample.height).data
          return pixels.some((value, index) => index % 4 === 3 && value > 0)
        } catch {
          return false
        }
      })
      if (painted) setReady(true)
      else if (++attempts < 12) timer = setTimeout(() => {
        frame = requestAnimationFrame(check)
      }, Math.min(attempts * 50, 200))
    }
    frame = requestAnimationFrame(() => { frame = requestAnimationFrame(check) })
    return () => { cancelAnimationFrame(frame); clearTimeout(timer) }
  }, [enhanced, runs])

  return <Heading {...props} ref={headingRef} className={`tech-heading ${className}`.trim()} data-tech-ready={enhanced && ready}>
    <span ref={copyRef} className="tech-heading-copy">{children}</span>
    <span ref={artRef} className="tech-heading-art" aria-hidden="true">
      {enhanced && <Suspense fallback={null}>{runs.map((run, index) => <span key={index} className="tech-heading-run" style={{ left: run.left, top: run.top, width: run.width, height: run.height, color: run.color }}>
        <TechText text={run.text} fontFamily={run.fontFamily} fontWeight={600} fontSize={run.size}
          letterSpacing={run.spacing} align="left" reveal="letter" lineStyle="solid" dashLength={4} dashGap={2}
          specks={15} intro="none" introDuration={2} clickKick={false} guides={false} draggable={false} sweep={autoSweep} />
      </span>)}</Suspense>}
    </span>
  </Heading>
}
