import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Desktop only. Start Vite, then run: node scripts/verify-motion.mjs.
// Keep the full Chrome binary and its native GPU path; no headless-shell or
// SwiftShader substitutions. This script does not import the old device suites.
const require = createRequire(import.meta.url)
let playwright
try { playwright = require('playwright') }
catch { playwright = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright') }

const executablePath = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'
const url = process.env.PORTFOLIO_URL || 'http://127.0.0.1:5173'
const output = fileURLToPath(new URL('../shots/motion/', import.meta.url))
const viewports = [{ width: 1126, height: 1015 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]
const primaryViewport = viewports[1]
const chapters = ['about', 'works', 'approach']
const report = { executablePath, url, viewports: [], checks: [], errors: [], performanceNote: 'Observed during QA, including style sampling and screenshots; descriptive evidence, not a benchmark or FPS guarantee.' }

// Observe native attributes, styles and rAF; do not replace timers, GSAP,
// ScrollTrigger, wheel handlers, DOM methods or renderer implementations.
function observeMotion() {
  const events = []
  const frames = []
  const intervals = []
  const longTasks = []
  const ids = new WeakMap()
  let sequence = 0
  let previousFrame = 0
  let previousSample = -Infinity
  const id = element => {
    if (!ids.has(element)) ids.set(element, ++sequence)
    return ids.get(element)
  }
  const identify = element => ({
    id: id(element),
    section: element.closest('section,footer')?.id || '',
    className: typeof element.className === 'string' ? element.className : '',
    text: (element.getAttribute('aria-label') || element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 75),
  })
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type !== 'attributes') continue
      events.push({ at: performance.now(), ...identify(record.target), attribute: record.attributeName, value: record.target.getAttribute(record.attributeName) })
    }
    if (events.length > 1500) events.splice(0, events.length - 1500)
  })
  observer.observe(document, { subtree: true, attributes: true, attributeFilter: ['data-opening-state', 'data-motion-mode', 'data-motion-ready', 'data-chapter-state', 'data-card-state'] })
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) longTasks.push({ at: entry.startTime, duration: entry.duration })
    }).observe({ type: 'longtask', buffered: true })
  } catch { /* This metric is optional; animation correctness is not. */ }

  function tick(time) {
    if (previousFrame && intervals.length < 20000) intervals.push(time - previousFrame)
    previousFrame = time
    if (time - previousSample >= 32) {
      previousSample = time
      const app = document.querySelector('.portfolio-app')
      const nodes = [...document.querySelectorAll('.opening-screen, .hero-title-reveal, .section-title-word, .project-reveal, .strength-reveal, .motion-image-parallax')].map(element => {
        const style = getComputedStyle(element)
        return {
          ...identify(element), opacity: Number(style.opacity), transform: style.transform,
          translate: style.translate, clip: style.clipPath, display: style.display,
          visibility: style.visibility, state: element.dataset.cardState || element.closest('[data-chapter-state]')?.dataset.chapterState || '',
        }
      })
      frames.push({ at: time, y: scrollY, opening: app?.dataset.openingState, mode: app?.dataset.motionMode, nodes })
      if (frames.length > 6000) frames.shift()
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  window.__motionQa = {
    snapshot: () => ({ events, frames, intervals, longTasks }),
    mark: () => performance.now(),
  }
}

const evidence = page => page.evaluate(() => window.__motionQa.snapshot())
const mark = page => page.evaluate(() => window.__motionQa.mark())
const delay = (page, milliseconds) => page.waitForTimeout(milliseconds)

function trackSeries(frames, predicate) {
  const series = new Map()
  for (const frame of frames) for (const node of frame.nodes.filter(predicate)) {
    if (!series.has(node.id)) series.set(node.id, [])
    series.get(node.id).push({ at: frame.at, ...node })
  }
  return [...series.values()]
}

function geometricChanges(series) {
  return new Set(series.map(node => `${node.transform}|${node.translate}|${node.clip}`)).size > 1
}

function firstEntrance(series) {
  const baseline = series.find(node => node.state === 'waiting') || series[0]
  if (!baseline) return null
  return series.find(node => node.at > baseline.at && node.opacity > .025 && node.display !== 'none' && node.visibility !== 'hidden' && (
    Math.abs(node.opacity - baseline.opacity) > .025 || node.transform !== baseline.transform || node.translate !== baseline.translate || node.clip !== baseline.clip
  ))?.at ?? null
}

async function createPage(browser, viewport, name, reducedMotion = 'no-preference') {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, isMobile: false, hasTouch: false, reducedMotion })
  page.setDefaultTimeout(12000)
  page.on('pageerror', error => report.errors.push({ name, viewport, message: error.message }))
  await page.addInitScript(observeMotion)
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.locator('.portfolio-app[data-motion-ready="true"]').waitFor({ state: 'attached' })
  return page
}

async function scrollTo(page, y) {
  await page.evaluate(top => window.scrollTo({ top, behavior: 'instant' }), Math.max(0, y))
  await delay(page, 100)
}

async function sectionTop(page, selector) {
  return page.locator(selector).evaluate(element => element.getBoundingClientRect().top + scrollY)
}

async function waitOpeningEnded(page) {
  await page.waitForFunction(() => ['complete', 'skipped'].includes(document.querySelector('.portfolio-app')?.dataset.openingState), null, { timeout: 8000 })
  await delay(page, 150)
}

async function assertUnblocked(page) {
  const state = await page.evaluate(() => {
    const cover = document.querySelector('.opening-screen')
    const style = cover ? getComputedStyle(cover) : null
    const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2)
    return {
      opening: document.querySelector('.portfolio-app')?.dataset.openingState,
      htmlOverflow: getComputedStyle(document.documentElement).overflowY,
      bodyOverflow: getComputedStyle(document.body).overflowY,
      inert: Boolean(document.querySelector('main')?.closest('[inert]')),
      cover: style ? { display: style.display, visibility: style.visibility, opacity: Number(style.opacity), pointerEvents: style.pointerEvents, clip: style.clipPath } : null,
      hitCover: Boolean(hit?.closest('.opening-screen')),
    }
  })
  assert.notEqual(state.opening, 'running', 'Opening must finish or be skipped')
  assert.ok(!state.inert && !state.hitCover, 'Opening must not leave inert content or an intercepting overlay')
  assert.ok(!['hidden', 'clip'].includes(state.htmlOverflow) && !['hidden', 'clip'].includes(state.bodyOverflow), 'Opening must not leave native scrolling locked')
  if (state.cover) assert.ok(state.cover.display === 'none' || state.cover.visibility === 'hidden' || state.cover.opacity < .02 || state.cover.clip !== 'none', 'Opening cover must be dismissed visually')
  return state
}

// A TechHeading intentionally hides its source copy when its canvas is ready.
// Inspect the rendered heading and its actual text canvases, not that source copy.
async function assertContentVisible(page, selector = 'main, footer') {
  const result = await page.evaluate(scopeSelector => {
    const roots = [...document.querySelectorAll(scopeSelector)]
    const nodes = [...new Set(roots.flatMap(root => [...root.querySelectorAll('h1,h2,h3,.motion-subtitle,.section-title-word,.project-reveal,.strength-reveal')]))]
    const hidden = []
    const missingCanvases = []
    const opacity = element => {
      let value = 1
      for (let node = element; node instanceof Element; node = node.parentElement) {
        const style = getComputedStyle(node)
        if (style.display === 'none' || style.visibility === 'hidden') return 0
        value *= Number(style.opacity)
      }
      return value
    }
    for (const element of nodes) {
      if (element.closest('dialog:not([open])') || element.classList.contains('sr-only')) continue
      if (element.closest('.tech-heading[data-tech-ready="true"] > .tech-heading-copy')) continue
      const rect = element.getBoundingClientRect()
      const label = `${element.tagName}.${element.className}: ${element.textContent.trim().slice(0, 60)}`
      if (opacity(element) < .95 || rect.width < 1 || rect.height < 1) hidden.push(label)
      if (element.matches('.tech-heading[data-tech-ready="true"]')) {
        const canvases = [...element.querySelectorAll('.tech-text-canvas')]
        if (!canvases.length || canvases.some(canvas => !canvas.width || !canvas.height || opacity(canvas) < .95)) missingCanvases.push(label)
      }
    }
    return { checked: nodes.length, hidden, missingCanvases }
  }, selector)
  assert.deepEqual(result.hidden, [], 'Revealed text and card wrappers must be visible')
  assert.deepEqual(result.missingCanvases, [], 'Ready TechHeading canvases must remain present and visible')
  assert.ok(result.checked > 0, `Content check must inspect actual nodes in ${selector}`)
  return result
}

async function assertNoOverflow(page, label) {
  const geometry = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    nav: (() => { const nav = document.querySelector('.glass-nav'); const rect = nav.getBoundingClientRect(); return { position: getComputedStyle(nav).position, top: rect.top, left: rect.left, right: rect.right } })(),
  }))
  assert.ok(geometry.document <= geometry.viewport + 1 && geometry.body <= geometry.viewport + 1, `${label}: no horizontal overflow`)
  assert.ok(['fixed', 'sticky'].includes(geometry.nav.position), 'Navigation must retain its fixed/sticky positioning')
  assert.ok(geometry.nav.left >= -1 && geometry.nav.right <= geometry.viewport + 1, 'Fixed navigation must stay inside the desktop viewport')
  return geometry
}

async function openingTest(page) {
  await waitOpeningEnded(page)
  const recording = await evidence(page)
  const openingFrames = recording.frames.filter(frame => frame.opening === 'running')
  assert.ok(openingFrames.length >= 2, 'Capture a real running opening, not only its final state')
  const moving = trackSeries(openingFrames, node => /opening-screen|hero-title-reveal/.test(node.className))
  assert.ok(moving.some(geometricChanges), 'Opening must change transform/translate/clip-path, not only opacity')
  const starts = recording.events.filter(event => event.attribute === 'data-opening-state' && event.value === 'running')
  const ends = recording.events.filter(event => event.attribute === 'data-opening-state' && event.value === 'complete')
  const elapsed = ends.length ? ends.at(-1).at - (starts[0]?.at ?? openingFrames[0].at) : null
  assert.ok(elapsed !== null && elapsed > 500 && elapsed < 6500, `Opening should complete near four seconds (observed ${elapsed} ms)`)
  const unblocked = await assertUnblocked(page)
  const visible = await assertContentVisible(page, '#home')
  return { elapsed, runningSamples: openingFrames.length, geometricTracks: moving.filter(geometricChanges).map(series => series[0].className), unblocked, visible }
}

async function chapterTest(page, id, viewport) {
  const selector = `#${id}`
  const title = page.locator(`${selector} h2.section-cinematic-title`)
  assert.equal(await title.count(), 1, `${id}: exactly one cinematic English h2`)
  assert.ok(await title.locator('.section-title-word').count() > 0, `${id}: visible English word DOM is present`)
  assert.ok(await page.locator(`${selector} h3.motion-subtitle`).count() > 0, `${id}: Japanese subtitle retains h3 semantics`)
  const top = await sectionTop(page, selector)
  const start = await mark(page)
  await scrollTo(page, top - viewport.height * .66)
  await page.waitForFunction(section => document.getElementById(section)?.dataset.chapterState !== 'waiting', id)
  await delay(page, 850)
  const bottom = await page.locator(selector).evaluate(element => element.getBoundingClientRect().bottom + scrollY)
  // Reach the current section's final cards without triggering the next
  // chapter early and losing its entrance evidence.
  const lastY = Math.max(top, bottom - viewport.height * .94)
  for (let y = top; y <= lastY; y += viewport.height * .55) {
    await scrollTo(page, y)
    await delay(page, 160)
  }
  await scrollTo(page, lastY)
  // A tall Works section legitimately leaves offscreen cards waiting. Visit
  // each card before requiring completion, rather than treating chapter entry
  // as permission to reveal all of its cards at once.
  const cardWrappers = page.locator(`${selector} .project-reveal, ${selector} .strength-reveal`)
  for (let index = 0; index < await cardWrappers.count(); index++) {
    const card = cardWrappers.nth(index)
    const cardTop = await card.evaluate(element => element.getBoundingClientRect().top + scrollY)
    await scrollTo(page, Math.min(lastY, Math.max(top, cardTop - viewport.height * .65)))
    await page.waitForFunction(element => element?.dataset.cardState === 'complete', await card.elementHandle())
  }
  await page.waitForFunction(section => {
    const root = document.getElementById(section)
    return root?.dataset.chapterState === 'complete' && [...root.querySelectorAll('[data-card-state]')].every(card => card.dataset.cardState === 'complete')
  }, id)
  await delay(page, 250)
  const recording = await evidence(page)
  // Retain initial waiting samples so the first actual style change can be timed.
  const tracks = trackSeries(recording.frames, node => node.section === id)
  const words = tracks.filter(series => series[0].className.includes('section-title-word'))
  const cards = tracks.filter(series => /project-reveal|strength-reveal/.test(series[0].className))
  assert.ok(words.some(series => geometricChanges(series.filter(node => node.at >= start))), `${id}: title words must actually translate or clip into view`)
  const titleOnsets = words.map(firstEntrance).filter(value => value !== null)
  const cardOnsets = cards.map(firstEntrance).filter(value => value !== null)
  if (cards.length) {
    assert.equal(cardOnsets.length, cards.length, `${id}: every card must have an observed reveal`)
    assert.ok(titleOnsets.length > 0 && Math.min(...cardOnsets) >= Math.min(...titleOnsets) - 40, `${id}: English title must begin before cards`)
  }
  if (id === 'approach' && cards.length > 1) {
    assert.ok(Math.max(...cardOnsets) - Math.min(...cardOnsets) >= 50, 'Strength cards must visibly stagger instead of appearing in one frame')
  }
  return { titleOnsets, cardOnsets, visible: await assertContentVisible(page, selector), geometry: await assertNoOverflow(page, id) }
}

async function parallaxTest(page, viewport) {
  const images = page.locator('.motion-image-parallax')
  assert.ok(await images.count() > 0, 'Image parallax must have real target elements')
  assert.ok(await images.evaluateAll(nodes => nodes.every(node => node.tagName === 'DIV' && node.querySelector('img') && !node.querySelector('h1,h2,h3,p,button,a'))), 'Parallax wrappers contain only image content; text and controls must not receive image parallax')
  const target = page.locator('#about .motion-image-parallax').first()
  const top = await target.evaluate(element => element.getBoundingClientRect().top + scrollY)
  await scrollTo(page, top - viewport.height * .65)
  await delay(page, 350)
  const first = await target.evaluate(element => ({ transform: getComputedStyle(element).transform, translate: getComputedStyle(element).translate }))
  await scrollTo(page, top - viewport.height * .3)
  await delay(page, 500)
  const second = await target.evaluate(element => ({ transform: getComputedStyle(element).transform, translate: getComputedStyle(element).translate }))
  assert.notDeepEqual(first, second, 'Scrolling through an image must change its actual parallax transform')
  const image = await target.locator('img').evaluate(element => ({ complete: element.complete, naturalWidth: element.naturalWidth, naturalHeight: element.naturalHeight, width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }))
  assert.ok(image.complete && image.naturalWidth > 0 && image.naturalHeight > 0 && image.width > 0 && image.height > 0, 'The parallax wrapper must retain a loaded image with visible dimensions')
  return { first, second, image }
}

async function interactionTest(page) {
  const nav = page.locator('.glass-nav .desktop-nav a[href="#works"]')
  await nav.click()
  await page.waitForFunction(() => Math.abs(document.getElementById('works').getBoundingClientRect().top) < 220)
  const buttons = page.locator('#works .filter-buttons button')
  await buttons.nth(1).click()
  await page.waitForFunction(() => {
    const cards = [...document.querySelectorAll('#works .project-reveal')]
    return cards.length > 0 && cards.every(card => card.dataset.cardState === 'complete' && Number(getComputedStyle(card).opacity) > .95)
  })
  const card = page.locator('#works .project-card').first()
  const name = await card.getAttribute('aria-label')
  await card.focus()
  await page.keyboard.press('Enter')
  const dialog = page.locator('#project-detail')
  await dialog.waitFor({ state: 'visible' })
  assert.ok(await dialog.evaluate(element => element.open && element.matches(':modal')), 'Project details must use a native modal dialog')
  for (let index = 0; index < 4; index++) {
    // Chromium's native dialog cycle can briefly focus its document body;
    // background links and buttons must remain inert throughout the cycle.
    assert.ok(await dialog.evaluate(element => element.contains(document.activeElement) || document.activeElement === document.body), 'Tab must not focus a background control while the native modal is open')
    await page.keyboard.press('Tab')
  }
  assert.ok(await page.evaluate(() => {
    const outside = document.querySelector('.glass-nav .desktop-nav a[href="#works"]')
    outside.focus()
    return document.activeElement !== outside
  }), 'The native modal must prevent programmatic focus on background navigation')
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), name, 'Closing the dialog restores focus to its project card')
  await buttons.first().click()
  await page.waitForFunction(() => document.querySelectorAll('#works .project-reveal').length > 1)
  const workBounds = await page.locator('#works').evaluate(element => ({ top: element.getBoundingClientRect().top + scrollY, bottom: element.getBoundingClientRect().bottom + scrollY, height: innerHeight }))
  const lastWorkY = Math.max(workBounds.top, workBounds.bottom - workBounds.height * .94)
  for (let y = workBounds.top; y <= lastWorkY; y += workBounds.height * .5) await scrollTo(page, y)
  await scrollTo(page, lastWorkY)
  await page.waitForFunction(() => {
    const cards = [...document.querySelectorAll('#works .project-reveal')]
    return cards.length > 1 && cards.every(card => card.dataset.cardState === 'complete')
  })
  await assertContentVisible(page, '#works')
  await page.locator('.glass-nav .nav-contact').click()
  await page.waitForFunction(() => Math.abs(document.getElementById('contact').getBoundingClientRect().top) < 220)
  await page.locator('.contact-orbit').click()
  const contact = page.locator('dialog.contact-dialog')
  await contact.waitFor({ state: 'visible' })
  assert.ok(await contact.evaluate(element => element.matches(':modal') && element.contains(document.activeElement)))
  await page.keyboard.press('Escape')
  await contact.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => {
    const footer = document.getElementById('contact')
    return !footer.hasAttribute('data-chapter-state') || footer.dataset.chapterState === 'complete'
  })
  return { filteredProject: name, restoredProjects: await page.locator('#works .project-card').count(), nativeProjectAndContactDialogs: true, fixedNavigation: true }
}

async function assertReducedStatic(page, viewport) {
  await page.waitForFunction(() => document.querySelector('.portfolio-app')?.dataset.motionMode === 'reduced')
  await waitOpeningEnded(page)
  await delay(page, 250)
  const states = await page.evaluate(() => ({
    unfinishedChapters: [...document.querySelectorAll('[data-chapter-state]')].filter(node => node.dataset.chapterState !== 'complete').map(node => node.id),
    unfinishedCards: [...document.querySelectorAll('[data-card-state]')].filter(node => node.dataset.cardState !== 'complete').map(node => node.className),
  }))
  assert.deepEqual(states.unfinishedChapters, [], 'Reduced motion restores every chapter immediately')
  assert.deepEqual(states.unfinishedCards, [], 'Reduced motion restores every card immediately')
  await assertUnblocked(page)
  await assertContentVisible(page)
  const target = page.locator('#about .motion-image-parallax').first()
  const top = await target.evaluate(element => element.getBoundingClientRect().top + scrollY)
  await scrollTo(page, top - viewport.height * .65)
  await delay(page, 200)
  const first = await target.evaluate(element => ({ transform: getComputedStyle(element).transform, translate: getComputedStyle(element).translate }))
  await scrollTo(page, top - viewport.height * .3)
  await delay(page, 350)
  const second = await target.evaluate(element => ({ transform: getComputedStyle(element).transform, translate: getComputedStyle(element).translate }))
  assert.deepEqual(first, second, 'Reduced motion must remove scroll-dependent image transforms')
  const staticTransforms = await page.locator('.hero-title-reveal,.section-title-word,.project-reveal,.strength-reveal,.motion-image-parallax').evaluateAll(nodes => nodes.map(node => {
    const style = getComputedStyle(node)
    const matrix = style.transform === 'none' ? null : new DOMMatrixReadOnly(style.transform)
    return { className: node.className, transform: style.transform, translate: style.translate, moved: matrix ? Math.abs(matrix.m41) > .1 || Math.abs(matrix.m42) > .1 || Math.abs(matrix.m43) > .1 : false }
  }))
  assert.ok(staticTransforms.every(node => !node.moved && ['none', '0px', '0px 0px'].includes(node.translate)), 'Reduced motion clears entrance and parallax translations')
  return { states, parallax: first, geometry: await assertNoOverflow(page, 'reduced-motion') }
}

function performanceSummary(recording) {
  const values = [...recording.intervals].sort((a, b) => a - b)
  const percentile = fraction => values.length ? Number(values[Math.min(values.length - 1, Math.floor(values.length * fraction))].toFixed(2)) : null
  return {
    sampledFrames: values.length, frameIntervalMs: { median: percentile(.5), p95: percentile(.95), max: values.length ? Number(values.at(-1).toFixed(2)) : null },
    longTasks: { count: recording.longTasks.length, totalMs: Number(recording.longTasks.reduce((sum, task) => sum + task.duration, 0).toFixed(2)), maxMs: recording.longTasks.length ? Math.max(...recording.longTasks.map(task => task.duration)) : 0 },
  }
}

await mkdir(output, { recursive: true })
const browser = await playwright.chromium.launch({ headless: true, executablePath })
let activePage
try {
  for (const viewport of viewports) {
    const result = { viewport, chapters: {} }
    report.viewports.push(result)
    const page = await createPage(browser, viewport, `normal-${viewport.width}`)
    activePage = page
    result.opening = await openingTest(page)
    result.heroGeometry = await assertNoOverflow(page, 'hero')
    await page.screenshot({ path: path.join(output, `${viewport.width}-hero.png`) })
    for (const id of chapters) result.chapters[id] = await chapterTest(page, id, viewport)
    result.parallax = await parallaxTest(page, viewport)
    result.interactions = await interactionTest(page)
    await page.screenshot({ path: path.join(output, `${viewport.width}-contact.png`) })
    await assertContentVisible(page)
    if (viewport.width === primaryViewport.width) {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      result.runtimeReduced = await assertReducedStatic(page, viewport)
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await page.waitForFunction(() => document.querySelector('.portfolio-app')?.dataset.motionMode === 'full')
      assert.notEqual(await page.locator('.portfolio-app').getAttribute('data-opening-state'), 'running', 'Returning to full motion must not replay the opening')
    }
    const recording = await evidence(page)
    result.performance = performanceSummary(recording)
    await writeFile(path.join(output, `${viewport.width}-timeline.json`), JSON.stringify({ events: recording.events, frames: recording.frames }, null, 2))
    await page.close()
    activePage = null
    console.log(`PASS ${viewport.width}x${viewport.height}: geometric opening, chapter/card order, image parallax, filters, dialogs, navigation and overflow`)
  }

  for (const input of ['wheel', 'Tab']) {
    const page = await createPage(browser, primaryViewport, `skip-${input}`)
    activePage = page
    assert.equal(await page.locator('.portfolio-app').getAttribute('data-opening-state'), 'running', `${input} test must start during the opening`)
    const before = await mark(page)
    if (input === 'wheel') { await page.mouse.move(700, 500); await page.mouse.wheel(0, 520) }
    else await page.keyboard.press('Tab')
    // Completing a GSAP timeline immediately is also a valid input skip; its
    // shared onComplete callback may record "complete" instead of "skipped".
    await page.waitForFunction(() => ['complete', 'skipped'].includes(document.querySelector('.portfolio-app')?.dataset.openingState), null, { timeout: 1800 })
    const elapsed = (await mark(page)) - before
    assert.ok(elapsed < 1800, `${input} must skip promptly`)
    const unblocked = await assertUnblocked(page)
    if (input === 'wheel') await page.waitForFunction(() => scrollY > 40)
    else assert.ok(await page.evaluate(() => document.activeElement !== document.body && document.activeElement?.matches('a,button,[tabindex]')), 'Tab must reach a real focusable element after skipping')
    report.checks.push({ name: `skip-${input}`, elapsed, unblocked })
    await page.close()
    activePage = null
    console.log(`PASS ${input}: native input skips the opening without locking scroll or keyboard focus`)
  }

  for (const initial of [true, false]) {
    const page = await createPage(browser, primaryViewport, initial ? 'initial-reduced' : 'opening-live-reduced', initial ? 'reduce' : 'no-preference')
    activePage = page
    if (!initial) {
      assert.equal(await page.locator('.portfolio-app').getAttribute('data-opening-state'), 'running', 'Live reduced-motion test starts while opening is running')
      await page.emulateMedia({ reducedMotion: 'reduce' })
    }
    report.checks.push({ name: initial ? 'initial-reduced' : 'opening-live-reduced', result: await assertReducedStatic(page, primaryViewport) })
    await page.close()
    activePage = null
    console.log(`PASS ${initial ? 'Initial' : 'Live opening'} reduced motion: all text/cards restored, cover removed and no parallax`)
  }
  assert.deepEqual(report.errors, [], 'No pageerror in any desktop or reduced-motion scenario')
  console.log(`PASS Desktop motion verification complete. Evidence: ${output}`)
} catch (error) {
  report.failure = error.stack || error.message
  if (activePage && !activePage.isClosed()) {
    report.failureRecording = await evidence(activePage).catch(() => null)
    await activePage.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {})
  }
  throw error
} finally {
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
